import { createClient, SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import { MemoryItem } from "@/lib/types/memory";

// Use environment variables for server-side client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Ensure service role key is provided
if (!supabaseServiceRoleKey) {
  console.warn("SUPABASE_SERVICE_ROLE_KEY is not set. MemoryServiceServer may not function correctly for all operations.");
  // Optionally throw an error if service key is absolutely required
  // throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for MemoryServiceServer");
}

class MemoryServiceServer {
  private supabaseAdmin: SupabaseClient;

  constructor() {
    // Use the service role client for server-side operations
    // NOTE: RLS policies MUST be robust to protect data when using service role key
    this.supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false } // No session needed for service role
    });
  }

  private handlePostgrestError(error: PostgrestError | null, context: string): void {
    if (error) {
      console.error(`[MemoryServiceServer] Error in ${context}:`, error);
      throw new Error(`Database error during ${context}: ${error.message}`);
    }
  }

  // --- Methods adapted for server-side use ---

  // Removed redundant userId parameter - user_id MUST be in the 'item' object
  async addMemory(item: Omit<MemoryItem, 'id' | 'created_at' | 'updated_at'>): Promise<MemoryItem> {
    // Check if user_id is provided in the item
    if (!item.user_id) {
      throw new Error('[MemoryServiceServer] user_id must be provided in the item object for addMemory.');
    }
    console.log(`[MemoryServiceServer] Adding memory for user: ${item.user_id}`);
    
    // TODO: Encryption logic if needed
    const memoryToInsert = {
      ...item,
      // Ensure defaults are handled
      priority: item.priority || 'medium',
      type: item.type || 'other',
      relevance_score: item.relevance_score ?? 0.5,
      metadata: item.metadata || {},
    };

    const { data, error } = await this.supabaseAdmin
      .from('memory_items')
      .insert(memoryToInsert)
      .select()
      .single();
    this.handlePostgrestError(error, 'addMemory');
    if (!data) throw new Error('Failed to add memory item, no data returned.');
    console.log(`[MemoryServiceServer] Memory added with ID: ${data.id}`);
    // TODO: Decryption logic if needed
    return data as MemoryItem;
  }

  // Gets memories for a specific user, potentially relevant to context
  async getRelevantMemories(queryContext: string, userId: string, limit: number = 5): Promise<MemoryItem[]> {
    console.log(`[MemoryServiceServer] Getting relevant memories for user: ${userId}, context: \"${queryContext.substring(0, 30)}...\", limit: ${limit}`);
    
    // Filter keywords more effectively and clean them
    const keywords = queryContext
      .toLowerCase()
      .split(/\s+/)
      // Remove non-alphanumeric characters from each potential keyword
      .map(kw => kw.replace(/[^a-z0-9]/gi, '')) 
      // Filter out short/empty strings and basic stop words
      .filter(kw => kw.length > 2 && !['the', 'a', 'is', 'in', 'that', 'remember', 'for'].includes(kw)); 

    let query = this.supabaseAdmin
      .from('memory_items')
      .select('*')
      .eq('user_id', userId);

    // Use ILIKE for simpler, broader matching instead of FTS
    if (keywords.length > 0) {
        // Build an ILIKE pattern for each keyword ORed together
        // Keywords should now be clean, no need to escape % or _ unless they are part of the actual word
        const ilikePattern = keywords.map(kw => `content.ilike.%${kw}%`).join(','); // Use comma separator
        console.log(`[MemoryServiceServer] Searching memories with OR ILIKE pattern: ${ilikePattern}`);
        query = query.or(ilikePattern);
    } else {
      console.log('[MemoryServiceServer] No keywords, fetching recent memories.');
      // If no keywords, maybe still order by update/access time?
    }
    
    // Sort by relevance score (if implemented) or last accessed time
    // query = query.order('relevance_score', { ascending: false }); // Add this if score is meaningful
    query = query.order('last_accessed_at', { ascending: false }).limit(limit);

    const { data, error } = await query;
    this.handlePostgrestError(error, 'getRelevantMemories');
    const memories = data || [];
    console.log(`[MemoryServiceServer] Found ${memories.length} potentially relevant memories.`);
    // TODO: Decryption logic if needed
    return memories as MemoryItem[];
  }

  // Other methods (getById, update, delete) can be added similarly, always requiring userId
}

// Export a single instance for the server
export const memoryServiceServer = new MemoryServiceServer(); 