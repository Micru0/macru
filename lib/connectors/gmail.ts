import { google, Auth, gmail_v1 } from 'googleapis';
import { createServerClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { Database } from '@/lib/types/database.types';
import { DataConnector, ConnectorData, ConnectionStatus, DataConnectorType, ConnectorType } from '@/lib/types/data-connector';
import { Buffer } from 'buffer';

// Helper function to get Supabase client (server-side context)
async function getSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: any) {
          cookieStore.set(name, '', options);
        },
      },
    }
  );
}

// Helper function to save Google tokens
async function saveGmailToken(userId: string, tokens: Auth.Credentials) {
  const supabase = await getSupabaseClient();
  const { access_token, refresh_token, expiry_date, scope } = tokens;

  if (!access_token) {
    throw new Error('Missing access token');
  }

  const scopesArray = scope ? scope.split(' ') : [];
  const expiryDateIso = expiry_date ? new Date(expiry_date).toISOString() : null;

  // TODO: Encrypt tokens before saving
  const { error } = await supabase.from('connector_tokens').upsert({
    user_id: userId,
    connector_type: 'gmail' as DataConnectorType,
    access_token: access_token, // Store securely!
    refresh_token: refresh_token ?? null, // Store securely!
    scopes: scopesArray,
    expiry_date: expiryDateIso,
    updated_at: new Date().toISOString(),
    // raw_response: // Consider storing raw response if needed for id_token etc.
  }, {
    onConflict: 'user_id, connector_type'
  });

  if (error) {
    console.error('Error saving Gmail token:', error);
    throw error;
  }
}

// Helper function to get Google tokens
async function getGmailToken(userId: string): Promise<Auth.Credentials | null> {
  const supabase = await getSupabaseClient();
  // TODO: Decrypt tokens after retrieving
  const { data, error } = await supabase
    .from('connector_tokens')
    .select('access_token, refresh_token, expiry_date, scopes')
    .eq('user_id', userId)
    .eq('connector_type', 'gmail')
    .maybeSingle();

  if (error) {
    console.error('Error retrieving Gmail token:', error);
    return null;
  }

  if (!data || !data.access_token) {
    return null;
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: data.expiry_date ? new Date(data.expiry_date).getTime() : null,
    scope: data.scopes ? data.scopes.join(' ') : undefined,
    token_type: 'Bearer' // Standard for Google OAuth
  };
}

// Helper function to delete Google tokens
async function deleteGmailToken(userId: string) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from('connector_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('connector_type', 'gmail');

  if (error) {
    console.error('Error deleting Gmail token:', error);
    throw error;
  }
}

export class GmailConnector implements DataConnector {
  type = ConnectorType.GMAIL;

  private getOAuth2Client(tokens?: Auth.Credentials): Auth.OAuth2Client {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID!,
      process.env.GMAIL_CLIENT_SECRET!,
      process.env.GMAIL_REDIRECT_URI!
    );
    if (tokens) {
      oauth2Client.setCredentials(tokens);
    }
    return oauth2Client;
  }

  async connect(userId: string, authCode?: string | undefined): Promise<ConnectionStatus> {
     // Note: Actual connection (token exchange) happens in the callback route
     console.log('GmailConnector connect called (OAuth handled by callback)', { userId, authCode });
     // Return a pending or default status, as connection finalizes in callback
     return Promise.resolve({ connectorType: ConnectorType.GMAIL, isConnected: false, accountName: 'Pending connection...' });
  }

  async disconnect(userId: string): Promise<ConnectionStatus> {
    let status: ConnectionStatus = { connectorType: ConnectorType.GMAIL, isConnected: true }; // Use enum
    try {
      // Attempt to revoke token with Google first
      const tokens = await getGmailToken(userId);
      if (tokens?.access_token) {
        const oauth2Client = this.getOAuth2Client(tokens);
        try {
          await oauth2Client.revokeToken(tokens.access_token);
          console.log(`Gmail token revoked for user ${userId}`);
        } catch (revokeError: any) {
          // Log error but proceed with deleting local token anyway
          console.warn(`Failed to revoke Google token for user ${userId}. May need manual revocation in Google Account settings. Error:`, revokeError.message);
        }
      }
      // Always delete local token regardless of revocation status
      await deleteGmailToken(userId);
      status = { connectorType: ConnectorType.GMAIL, isConnected: false }; // Use enum
    } catch (error: any) {
      console.error(`Error disconnecting Gmail for user ${userId}:`, error);
      status = { connectorType: ConnectorType.GMAIL, isConnected: true, error: 'Disconnection failed.' }; // Use enum
    }
    return status;
  }

  async getConnectionStatus(userId: string): Promise<ConnectionStatus> {
    const tokens = await getGmailToken(userId);
    if (!tokens) {
      return { connectorType: ConnectorType.GMAIL, isConnected: false };
    }

    // Check if token is expired or close to expiring (e.g., within 5 minutes)
    const expiryBuffer = 5 * 60 * 1000;
    if (tokens.expiry_date && tokens.expiry_date < (Date.now() + expiryBuffer)) {
       // Attempt to refresh if refresh token exists
       if (tokens.refresh_token) {
          try {
             const oauth2Client = this.getOAuth2Client(tokens);
             console.log(`Attempting Gmail token refresh for user ${userId}`);
             const { credentials } = await oauth2Client.refreshAccessToken();
             console.log(`Gmail token refreshed for user ${userId}`);
             await saveGmailToken(userId, credentials); // Save the new tokens
             // Verify the new token by fetching profile
             oauth2Client.setCredentials(credentials);
             const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
             const profile = await gmail.users.getProfile({ userId: 'me' });
             return { connectorType: ConnectorType.GMAIL, isConnected: true, accountName: profile.data.emailAddress || 'Unknown Email' };
          } catch (refreshError: any) {
            console.error(`Failed to refresh Gmail token for user ${userId}:`, refreshError);
            // Refresh failed, consider disconnected. Delete invalid local token.
            await deleteGmailToken(userId);
            return { connectorType: ConnectorType.GMAIL, isConnected: false, error: 'Token refresh failed.' };
          }
       } else {
         // Expired and no refresh token
         await deleteGmailToken(userId);
         return { connectorType: ConnectorType.GMAIL, isConnected: false, error: 'Token expired, no refresh token.' };
       }
    } else {
       // Token exists and is not expired, verify by fetching profile
       try {
          const oauth2Client = this.getOAuth2Client(tokens);
          const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
          const profile = await gmail.users.getProfile({ userId: 'me' });
          return { connectorType: ConnectorType.GMAIL, isConnected: true, accountName: profile.data.emailAddress || 'Unknown Email' };
       } catch (apiError: any) {
          console.error(`Gmail API test call failed for user ${userId}:`, apiError);
          // If API call fails (e.g., 401), token might be invalid despite not being expired
          if (apiError.code === 401 || apiError.message.includes('invalid_grant')) {
             await deleteGmailToken(userId);
             return { connectorType: ConnectorType.GMAIL, isConnected: false, error: 'Invalid token.' };
          }
          return { connectorType: ConnectorType.GMAIL, isConnected: false, error: 'API connection test failed.' };
       }
    }
  }

  async fetchData(userId: string, supabase: SupabaseClient<Database>, lastSyncTime?: Date | undefined): Promise<ConnectorData[]> {
    console.log(`Gmail fetchData started for user ${userId}. Last sync: ${lastSyncTime}`);
    const allConnectorData: ConnectorData[] = [];

    try {
      // 1. Get token (using helper defined above)
      const tokens = await getGmailToken(userId);
      if (!tokens) {
        console.error(`No valid Gmail token found for user ${userId}. Cannot fetch data.`);
        // Optionally throw an error or return specific status
        return [];
      }

      // 2. Init gmail client
      const oauth2Client = this.getOAuth2Client(tokens);
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // 3. Determine query filter
      let query = 'in:inbox'; // Basic query, adjust if needed (e.g., exclude spam/trash)
      if (lastSyncTime) {
        const timestampSeconds = Math.floor(lastSyncTime.getTime() / 1000);
        query += ` after:${timestampSeconds}`;
        console.log(`Gmail query (delta sync): ${query}`);
      } else {
        // Initial sync: Fetch emails newer than 1 day
        query += ' newer_than:1d';
        console.log(`Gmail query (initial sync): ${query}`);
      }

      // 4. List messages with pagination
      let pageToken: string | undefined | null = undefined;
      let messageCount = 0;
      const MAX_MESSAGES = 500; // Limit messages per sync run to avoid timeouts/rate limits

      do {
        console.log(`Fetching Gmail message list page... (Token: ${pageToken || 'N/A'})`);
        // Explicitly type the response
        const listResponse: gmail_v1.Schema$ListMessagesResponse = (await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 100,
          pageToken: pageToken ?? undefined,
        })).data;

        const messages = listResponse.messages;
        pageToken = listResponse.nextPageToken;

        if (!messages || messages.length === 0) {
          console.log('No new Gmail messages found.');
          break;
        }

        console.log(`Found ${messages.length} message IDs on this page.`);

        // 5. Get individual messages
        for (const messageMeta of messages) {
          if (!messageMeta.id) continue;
          if (messageCount >= MAX_MESSAGES) {
            console.warn(`Reached MAX_MESSAGES limit (${MAX_MESSAGES}), stopping sync.`);
            pageToken = null; // Stop pagination
            break;
          }

          try {
            // Fetch full message details
            const messageRes = await gmail.users.messages.get({
              userId: 'me',
              id: messageMeta.id,
              format: 'full' // Get headers and payload
            });

            const message = messageRes.data;
            if (!message || !message.payload) continue;

            // 6. Parse/transform message
            const transformedData = this.transformMessage(message, userId);
            if (transformedData) {
              allConnectorData.push(transformedData);
              messageCount++;
            }
          } catch (msgError: any) {
            console.error(`Error fetching/processing Gmail message ${messageMeta.id}:`, msgError.message);
            // Continue processing other messages
          }
        }
        console.log(`Processed page. Total messages so far: ${messageCount}`);

      } while (pageToken && messageCount < MAX_MESSAGES);

      console.log(`Gmail fetchData finished for user ${userId}. Fetched ${allConnectorData.length} emails.`);
      return allConnectorData;

    } catch (error: any) {
      console.error(`Error during Gmail fetchData for user ${userId}:`, error);
      // Handle potential token errors (e.g., invalid_grant might require re-auth)
      if (error.message?.includes('invalid_grant')) {
        console.warn(`Gmail token invalid/revoked for user ${userId}. Deleting local token.`);
        await deleteGmailToken(userId);
      }
      // Re-throw or return empty array depending on desired error handling
      throw new Error(`Failed to fetch Gmail data: ${error.message}`);
    }
  }

  // --- Helper for Transforming Message --- 
  private transformMessage(message: gmail_v1.Schema$Message, userId: string): ConnectorData | null {
    if (!message.id || !message.payload) {
      return null;
    }

    // Extract Headers
    const headers = message.payload.headers || [];
    const getHeader = (name: string): string | undefined => {
      const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
      return header?.value ?? undefined;
    };

    const subject = getHeader('subject') || 'No Subject';
    const from = getHeader('from');
    const to = getHeader('to');
    const dateStr = getHeader('date');
    const messageIdHeader = getHeader('message-id');

    // Construct Gmail URL
    // The message.id is the Gmail API message ID, not the Message-ID header.
    // Standard Gmail URL format: https://mail.google.com/mail/#inbox/<MESSAGE_ID_HEX>
    // We use message.id, which should be the correct one for URL construction.
    const gmailUrl = message.id ? `https://mail.google.com/mail/#inbox/${message.id}` : null;

    // Extract Body (prefer text/plain)
    let body = '';
    let bodyMimeType = '';

    const findBodyPart = (parts: gmail_v1.Schema$MessagePart[] | undefined): gmail_v1.Schema$MessagePart | null => {
      if (!parts) return null;
      let plainTextPart: gmail_v1.Schema$MessagePart | null = null;
      let htmlPart: gmail_v1.Schema$MessagePart | null = null;

      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          plainTextPart = part;
          break; // Found plain text, use it
        }
        if (part.mimeType === 'text/html' && part.body?.data) {
          htmlPart = part; // Found HTML, keep searching for plain text
        }
        // Recursively search nested parts
        if (part.parts) {
            const nestedPlainText = findBodyPart(part.parts);
            if (nestedPlainText) return nestedPlainText; // Found plain in nested
            // If still no plain text, consider nested HTML
            if (!htmlPart) {
                const nestedHtml = part.parts.find(p => p.mimeType === 'text/html' && p.body?.data);
                if(nestedHtml) htmlPart = nestedHtml;
            }
        }
      }
      return plainTextPart || htmlPart;
    };

    let targetPart = message.payload; // Start with top-level payload
    if (message.payload.parts) {
        const foundPart = findBodyPart(message.payload.parts);
        if (foundPart) targetPart = foundPart;
    }

    if (targetPart && targetPart.body?.data) {
      try {
        body = Buffer.from(targetPart.body.data, 'base64url').toString('utf8');
        bodyMimeType = targetPart.mimeType || '';
        // Simplified HTML stripping
        if (bodyMimeType === 'text/html') {
          body = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
      } catch (decodeError) {
        console.error(`Error decoding message body for ${message.id}:`, decodeError);
        body = '[Content could not be decoded]';
      }
    } else {
      console.warn(`No decodable body found for message ${message.id}`);
      body = '[No Content Body Found]';
    }

    const lastModified = dateStr ? new Date(dateStr) : (message.internalDate ? new Date(parseInt(message.internalDate, 10)) : undefined);

    // Construct ConnectorData
    return {
      id: message.id!,
      type: 'gmail_message',
      title: subject,
      content: body,
      fileName: message.id!,
      metadata: {
        title: subject,
        threadId: message.threadId,
        historyId: message.historyId,
        from: from,
        to: to,
        date: dateStr,
        messageIdHeader: messageIdHeader,
        labels: message.labelIds || [],
        snippet: message.snippet,
        mimeType: bodyMimeType,
        url: gmailUrl,
        // structured: {} // Add structured data mapping here if needed later
      },
      source: ConnectorType.GMAIL,
      lastModified: lastModified,
    };
  }
} 