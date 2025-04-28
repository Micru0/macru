import { 
  DataConnector, 
  ConnectorType, 
  ConnectionStatus, 
  ConnectorData, 
  SyncStatus 
} from '../types/data-connector';
import { 
  Client, 
  isFullBlock, // Type guard from Notion SDK
  isFullPage // Type guard from Notion SDK
} from '@notionhq/client';
import { createBrowserClient } from '@supabase/ssr'; 
import { SupabaseClient } from '@supabase/supabase-js'; // Import SupabaseClient type
// import { Database } from '@/lib/types/database.types'; // Temporarily comment out until types are generated
import type { // Use 'import type' for type-only imports
    BlockObjectResponse, 
    PageObjectResponse, 
    PartialBlockObjectResponse, 
    PartialPageObjectResponse 
} from '@notionhq/client/build/src/api-endpoints'; // Corrected import syntax

// TODO: Implement proper error handling
// TODO: Add logging
// TODO: Implement ACTUAL encryption/decryption for tokens (e.g., via Supabase Vault or Edge Functions)
// TODO: Regenerate Supabase types using CLI once possible

// Type definition for token data stored in the database
// type ConnectorTokenRow = Database['public']['Tables']['connector_tokens']['Row']; // Temporarily use any
type ConnectorTokenRow = any; // Use 'any' until types are fixed

// --- Token Management Functions (interacting with Supabase) ---

// Removed internal getSupabaseClient helper

// Functions now accept SupabaseClient as an argument
async function getNotionToken(supabase: SupabaseClient, userId: string): Promise<ConnectorTokenRow | null> {
  // const supabase = getSupabaseClient(); // Use passed client
  const { data, error } = await supabase
    .from('connector_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('connector_type', ConnectorType.NOTION)
    .maybeSingle();

  if (error) {
    console.error('[NotionConnector-Token] Error fetching token:', error);
    return null;
  }
  return data;
}

// Make saveNotionToken exportable and accept SupabaseClient
export async function saveNotionToken(
  supabase: SupabaseClient, 
  userId: string, 
  accessToken: string, 
  refreshToken?: string, 
  expiresAt?: Date, 
  accountIdentifier?: string,
  workspaceIcon?: string,
  scopes?: string[]
): Promise<boolean> {
  
  // ---> Add log here to inspect the raw accessToken string <--- 
  // Ensure log message is a single string
  console.log(`[NotionConnector-Token] Received accessToken to save (before buffering): starts('${accessToken?.substring(0, 10)}'), ends('${accessToken?.substring(accessToken.length - 10)}'), length(${accessToken?.length})`);
  
  // Log refresh token too for good measure (if it exists)
  if (refreshToken) {
    console.log(`[NotionConnector-Token] Received refreshToken to save (before buffering): starts('${refreshToken?.substring(0, 10)}'), ends('${refreshToken?.substring(refreshToken.length - 10)}'), length(${refreshToken?.length})`);
  }
  
  // !!! TODO: Encrypt accessToken and refreshToken before saving !!!
  // Store the tokens as strings directly. Supabase client handles BYTEA conversion.
  const tokenRecord = {
    user_id: userId,
    connector_type: ConnectorType.NOTION,
    access_token: accessToken, // Store as String
    refresh_token: refreshToken ?? null, // Store as String or null
    expires_at: expiresAt?.toISOString() ?? null,
    account_identifier: accountIdentifier,
    workspace_icon: workspaceIcon,
    scopes: scopes ?? null,
    // Removed updated_at - let the DB trigger handle it
  };

  // Log the record before upserting (Tokens should be readable now)
  console.log('[NotionConnector-Token] Attempting to upsert token record:', JSON.stringify(tokenRecord, null, 2));

  const { error } = await supabase
    .from('connector_tokens')
    .upsert(tokenRecord, {
      onConflict: 'user_id, connector_type' 
    });

  if (error) {
    console.error('[NotionConnector-Token] Error saving token:', error); 
    return false;
  }
  return true;
}

// Accept SupabaseClient
async function deleteNotionToken(supabase: SupabaseClient, userId: string): Promise<boolean> { 
  // const supabase = getSupabaseClient(); // Use passed client
  const { error } = await supabase
    .from('connector_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('connector_type', ConnectorType.NOTION);

  if (error) {
    console.error('[NotionConnector-Token] Error deleting token:', error);
    return false;
  }
  return true;
}

// Make decryptToken exportable so the API route can use it
// Now handles TEXT directly from the DB
export function decryptToken(token: string | null): string | null { 
  console.log('[decryptToken] Received token (type: TEXT):', token ? `starts(${token.substring(0, 10)}), ends(${token.substring(token.length - 10)}), length(${token.length})` : 'null');
  // No decryption needed as it's stored as TEXT and not encrypted yet
  // !!! TODO: Implement actual decryption when using encryption !!!
  return token;
}

// --- Notion Connector Class ---

export class NotionConnector implements DataConnector {
  readonly type = ConnectorType.NOTION;
  private notionClient: Client | null = null;

  // Helper to create client-side Supabase instance for class methods if needed
  // TODO: Review if class methods should accept userId/token or SupabaseClient instance
  private getSupabaseClientInstance() {
      return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
  }

  private async initializeClient(userId: string): Promise<Client | null> {
    const supabase = this.getSupabaseClientInstance(); // Use internal helper for now
    const tokenData = await getNotionToken(supabase, userId); // Pass client instance
    const accessToken = decryptToken(tokenData?.access_token ?? null);
    
    if (!accessToken) {
      console.warn(`[NotionConnector] No valid access token found for user ${userId}`);
      return null;
    }
    
    return new Client({ auth: accessToken }); 
  }

  // --- DataConnector Interface Implementation ---

  async connect(userId: string, authCode?: string): Promise<ConnectionStatus> {
    // This method is primarily called via the server-side callback route now.
    // The logic to exchange code & save token happens in the callback route directly.
    // This method might be simplified or repurposed, or just call getConnectionStatus.
    console.log(`[NotionConnector] Connect called for user ${userId}. Assuming token exchange happened in callback.`);
    // We can't directly save token here without the Supabase server client.
    // Rely on the callback route to call the exported saveNotionToken.
    // Perhaps just return the current status after potential save in callback.
    return this.getConnectionStatus(userId);
  }

  async disconnect(userId: string): Promise<ConnectionStatus> {
    console.log(`[NotionConnector] Disconnecting for user ${userId}`);
    const supabase = this.getSupabaseClientInstance(); // Use internal helper for now
    const success = await deleteNotionToken(supabase, userId); // Pass client instance
    if (!success) {
      console.error('[NotionConnector] Failed to delete token from database.');
    }
    this.notionClient = null; 
    return {
      connectorType: this.type,
      isConnected: false,
      lastSyncStatus: SyncStatus.IDLE, 
    };
  }

  async getConnectionStatus(userId: string, supabaseClient?: SupabaseClient): Promise<ConnectionStatus> {
    const supabase = supabaseClient || this.getSupabaseClientInstance(); 
    console.log(`[NotionConnector] getConnectionStatus called for user ${userId}. Using ${supabaseClient ? 'provided (server?)' : 'internal (browser?)'} Supabase client.`);

    const tokenData = await getNotionToken(supabase, userId); 
    console.log(`[NotionConnector] Token data ${tokenData ? 'found' : 'NOT found'} in DB for user ${userId}.`);

    const isConnected = !!tokenData?.access_token;
    // ---> REMOVE Validation Logic from here <--- 
    // No longer need to decrypt or call Notion API from this function.
    
    // let isValid = isConnectedInitially;
    // if (isConnectedInitially && accessToken) {
    //     try {
    //         console.log('[NotionConnector] Attempting to validate token with Notion API (users.me)... ');
    //         const client = new Client({ auth: accessToken });
    //         await client.users.me(); 
    //         console.log('[NotionConnector] Token validation successful.');
    //     } catch (error: any) {
    //         // ---> Log the specific validation error <--- 
    //         console.error(`[NotionConnector] Token validation API call failed for user ${userId}:`, error.code || error.message, error);
    //         isValid = false; // Set to false on validation error
    //         // TODO: Implement refresh token logic or prompt re-auth
    //     }
    // }

    console.log(`[NotionConnector] Basic connection status check (token exists?) for user ${userId}: ${isConnected}`);
    
    // This function now only reports if a token record exists.
    // The actual validation happens in the /api/connectors/notion/status endpoint.
    return {
      connectorType: this.type,
      isConnected: isConnected, // Based purely on token existence in DB
      accountIdentifier: tokenData?.account_identifier, 
      error: undefined // Remove error related to validation failure
      // TODO: Fetch and add lastSyncTime, lastSyncStatus from DB (remains valid)
    };
  }

  async fetchData(userId: string, lastSyncTime?: Date): Promise<ConnectorData[]> {
    console.log(`[NotionConnector] Fetching data for user ${userId}, last sync: ${lastSyncTime}`);
    const client = await this.initializeClient(userId);
    if (!client) {
      throw new Error('Notion client not initialized. User might not be connected or token is invalid.');
    }

    const fetchedData: ConnectorData[] = [];
    let hasMore = true;
    let startCursor: string | undefined = undefined;
    const pageSize = 50; // Reduce page size for potentially heavy content fetching

    while(hasMore) {
      try {
        console.log(`[NotionConnector] Searching Notion... Cursor: ${startCursor}`);
        const response = await client.search({
          // TODO: Add filter for last_edited_time if API supports it correctly
          sort: { direction: 'ascending', timestamp: 'last_edited_time' },
          page_size: pageSize,
          start_cursor: startCursor,
        });

        console.log(`[NotionConnector] Found ${response.results.length} items in this batch.`);

        for (const item of response.results) {
          if (isFullPage(item)) { 
            const page: PageObjectResponse = item;
            let title = 'Untitled';
            const titleProp = page.properties.title;
            if (titleProp?.type === 'title' && titleProp.title?.[0]?.plain_text) {
              title = titleProp.title[0].plain_text;
            }
            
            console.log(`[NotionConnector] Processing page: '${title}' (${page.id})`);
            // Fetch actual page content
            const pageContent = await this.fetchPageContent(client, page.id);
            
            fetchedData.push({
              id: page.id,
              type: 'page',
              title: title,
              content: pageContent, // Use fetched content
              metadata: {
                url: page.url,
                created_time: page.created_time,
                last_edited_time: page.last_edited_time,
                icon: page.icon,
                // Add parent info if needed: page.parent \n              },
              },
              source: this.type,
              lastModified: new Date(page.last_edited_time),
            });
          } else if (item.object === 'database') {
             console.log(`[NotionConnector] Found database: ${item.id} - Skipping database content for now.`);
             // TODO: Implement database row fetching if needed
          } else {
            console.log(`[NotionConnector] Found non-page/database item: ${item.object} (${item.id}) - Skipping.`);
          }
        }

        hasMore = response.has_more;
        startCursor = response.next_cursor ?? undefined;
        console.log(`[NotionConnector] Batch finished. hasMore: ${hasMore}, nextCursor: ${startCursor ? '****' : 'null'}`);

      } catch (error: any) {
        console.error('[NotionConnector] Error fetching data batch:', error.body || error.message);
        hasMore = false; // Stop pagination on error
        // Re-throw or handle differently?
        throw new Error(`Failed to fetch data from Notion: ${error.message}`);
      }
    }

    console.log(`[NotionConnector] Fetched a total of ${fetchedData.length} items.`);
    return fetchedData;
  }
  
  /**
   * Fetches all blocks for a given Notion page ID and transforms them into text.
   */
  private async fetchPageContent(client: Client, pageId: string): Promise<string> {
    let allBlocks: (BlockObjectResponse | PartialBlockObjectResponse)[] = [];
    let hasMore = true;
    let startCursor: string | undefined = undefined;
    const maxFetches = 10; // Safety break for deep pages
    let fetchCount = 0;

    console.log(`[NotionConnector] Fetching blocks for page ${pageId}...`);
    while(hasMore && fetchCount < maxFetches) {
      fetchCount++;
      try {
        const response = await client.blocks.children.list({
           block_id: pageId, 
           page_size: 100,
           start_cursor: startCursor 
          });
        allBlocks = allBlocks.concat(response.results);
        hasMore = response.has_more;
        startCursor = response.next_cursor ?? undefined;
        console.log(`[NotionConnector] Fetched block batch ${fetchCount}. hasMore: ${hasMore}`);
      } catch(error: any) {
        console.error(`[NotionConnector] Error fetching blocks for page ${pageId}:`, error.body || error.message);
        hasMore = false; 
      }
    }
    if (fetchCount >= maxFetches) {
        console.warn(`[NotionConnector] Max fetch limit (${maxFetches}) reached for page ${pageId}. Content might be truncated.`);
    }
    console.log(`[NotionConnector] Total blocks fetched for page ${pageId}: ${allBlocks.length}`);
    return this.transformBlocksToText(allBlocks);
  }

  /**
   * Transforms an array of Notion blocks into a single plain text string.
   * Handles basic block types.
   */
  private transformBlocksToText(blocks: (BlockObjectResponse | PartialBlockObjectResponse)[]): string {
    let text = '';
    for (const block of blocks) {
      if (!isFullBlock(block)) continue;
      
      let blockText = '';
      const type = block.type;
      
      try { // Add try-catch around block processing for robustness
        if (type === 'paragraph' && block.paragraph.rich_text.length > 0) {
          blockText = block.paragraph.rich_text.map(rt => rt.plain_text).join('');
        } else if (type === 'heading_1' && block.heading_1.rich_text.length > 0) {
          blockText = `# ${block.heading_1.rich_text.map(rt => rt.plain_text).join('')}`;
        } else if (type === 'heading_2' && block.heading_2.rich_text.length > 0) {
          blockText = `## ${block.heading_2.rich_text.map(rt => rt.plain_text).join('')}`;
        } else if (type === 'heading_3' && block.heading_3.rich_text.length > 0) {
          blockText = `### ${block.heading_3.rich_text.map(rt => rt.plain_text).join('')}`;
        } else if (type === 'bulleted_list_item' && block.bulleted_list_item.rich_text.length > 0) {
          blockText = `- ${block.bulleted_list_item.rich_text.map(rt => rt.plain_text).join('')}`;
        } else if (type === 'numbered_list_item' && block.numbered_list_item.rich_text.length > 0) {
          blockText = `1. ${block.numbered_list_item.rich_text.map(rt => rt.plain_text).join('')}`;
        } else if (type === 'to_do' && block.to_do.rich_text.length > 0) {
          blockText = `[${block.to_do.checked ? 'x' : ' '} ] ${block.to_do.rich_text.map(rt => rt.plain_text).join('')}`;
        } else if (type === 'code' && block.code.rich_text.length > 0) {
          // Use newline character explicitly
          const codeContent = block.code.rich_text.map(rt => rt.plain_text).join(''); // Join without extra newlines initially
          blockText = "```" + (block.code.language || '') + "\n" + codeContent + "\n" + "```";
        } else if (type === 'quote' && block.quote.rich_text.length > 0) {
          blockText = `> ${block.quote.rich_text.map(rt => rt.plain_text).join('\n> ')}`;
        } else if (type === 'callout' && block.callout.rich_text.length > 0) {
           blockText = `> ${block.callout.icon?.type === 'emoji' ? block.callout.icon.emoji + ' ' : ''}${block.callout.rich_text.map(rt => rt.plain_text).join('')}`;
        } else if (type === 'divider') {
          blockText = '---';
        } 
        // Add more simple block types here if needed
        // Skipping complex types for now
        
      } catch (transformError: any) {
        console.warn(`[NotionConnector] Error transforming block type '${type}' (ID: ${block.id}):`, transformError.message);
        blockText = `[Error processing block type: ${type}]`;
      }

      if (blockText) {
        text += blockText + '\n\n'; 
      }
    }
    return text.trim();
  }
}

// Export instance
export const notionConnector = new NotionConnector(); 