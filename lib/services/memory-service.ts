"use client"; // Indicate client-side usage if interacting with client Supabase instance

// Import the specific Supabase client creation helper for client components
import { createBrowserClient } from '@supabase/ssr';
import { MemoryItem, MemoryOperations } from "@/lib/types/memory";
import { SupabaseClient, PostgrestError } from "@supabase/supabase-js";

// TODO: Add encryption/decryption utilities if needed
// import crypto from 'crypto';
// const ENCRYPTION_KEY = process.env.MEMORY_ENCRYPTION_KEY; // Store securely!
// const ALGORITHM = 'aes-256-cbc';
// const IV_LENGTH = 16;

// function encrypt(text: string): string { ... }
// function decrypt(encryptedText: string): string { ... }

class MemoryService implements MemoryOperations {
  private supabase: SupabaseClient;

  constructor() {
    // Create a Supabase client suitable for client components
    // Ensure environment variables are accessible client-side (prefixed with NEXT_PUBLIC_)
    this.supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  private async getUserId(): Promise<string> {
    const { data: { user }, error } = await this.supabase.auth.getUser();
    if (error || !user) {
      throw new Error("User not authenticated to perform memory operations.");
    }
    return user.id;
  }

  private handlePostgrestError(error: PostgrestError | null, context: string): void {
    if (error) {
      console.error(`Error in ${context}:`, error);
      // Distinguish between RLS errors and other DB errors if needed
      if (error.code === '42501') { // RLS violation code
        throw new Error(`Permission denied: Cannot ${context}.`);
      }
      throw new Error(`Database error during ${context}: ${error.message}`);
    }
  }

  async addMemory(item: Omit<MemoryItem, 'id' | 'created_at' | 'updated_at'>): Promise<MemoryItem> {
    const userId = await this.getUserId();
    console.log(`[MemoryService] Adding memory for user: ${userId}`);

    // TODO: Encrypt item.content before inserting if encryption is implemented
    // const encryptedContent = encrypt(item.content);

    const memoryToInsert = {
      ...item,
      user_id: userId,
      // content: encryptedContent, // Use encrypted content
      // Ensure default values are handled if not provided in 'item'
      priority: item.priority || 'medium',
      type: item.type || 'other',
      relevance_score: item.relevance_score ?? 0.5, 
      metadata: item.metadata || {},
    };

    const { data, error } = await this.supabase
      .from('memory_items')
      .insert(memoryToInsert)
      .select()
      .single();

    this.handlePostgrestError(error, 'addMemory');

    if (!data) {
      throw new Error('Failed to add memory item, no data returned.');
    }

    console.log(`[MemoryService] Memory added with ID: ${data.id}`);
    // TODO: Decrypt data.content before returning if encryption is implemented
    // return { ...data, content: decrypt(data.content) };
    return data as MemoryItem;
  }

  async getMemoryById(id: string): Promise<MemoryItem | null> {
    const userId = await this.getUserId(); // Ensure user is authenticated
    console.log(`[MemoryService] Getting memory by ID: ${id} for user: ${userId}`);

    const { data, error } = await this.supabase
      .from('memory_items')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId) // RLS should handle this, but explicit check is safer
      .single();

    this.handlePostgrestError(error, 'getMemoryById');

    if (!data) {
      console.log(`[MemoryService] Memory with ID: ${id} not found for user: ${userId}`);
      return null;
    }

    // TODO: Decrypt data.content before returning
    return data as MemoryItem;
  }

  // Refined basic implementation - gets memories potentially relevant to the query context
  // Relies on internal getUserId() for user context.
  async getRelevantMemories(queryContext: string, limit: number = 5): Promise<MemoryItem[]> {
    // Get user ID internally
    const userId = await this.getUserId(); 
    
    console.log(`[MemoryService] Getting relevant memories for user: ${userId}, context: "${queryContext.substring(0, 30)}...", limit: ${limit}`);

    // Basic keyword matching (split context into words, search for any match)
    // This is VERY basic and likely inefficient/inaccurate for large datasets
    // A better approach might involve full-text search indexes or embeddings if performance allows
    const keywords = queryContext.toLowerCase().split(/\s+/).filter(kw => kw.length > 2); // Simple keyword extraction
    const searchPattern = keywords.join(' | '); // Create OR pattern for keywords

    if (!searchPattern) {
      console.log('[MemoryService] No keywords extracted, falling back to recent memories.');
      // Fallback to just getting the most recent ones if context is empty or has no keywords
      const { data, error } = await this.supabase
        .from('memory_items')
        .select('*')
        .eq('user_id', userId)
        .order('last_accessed_at', { ascending: false })
        .limit(limit);
      this.handlePostgrestError(error, 'getRelevantMemories (fallback)');
      return (data || []) as MemoryItem[];
    }

    console.log(`[MemoryService] Searching memories with pattern: ${searchPattern}`);
    const { data, error } = await this.supabase
      .from('memory_items')
      .select('*')
      .eq('user_id', userId) // Filter based on internally retrieved userId
      .textSearch('content', searchPattern, { type: 'plain' }) // Use plain text search for basic keyword matching
      // TODO: Ordering might be better by relevance (ts_rank?) if using FTS index, or keep recency?
      .order('last_accessed_at', { ascending: false })
      .limit(limit);

    this.handlePostgrestError(error, 'getRelevantMemories');

    const memories = data || [];
    console.log(`[MemoryService] Found ${memories.length} potentially relevant memories via keyword search.`);

    // TODO: Decrypt content for each memory item
    return memories as MemoryItem[];
  }

  async updateMemory(id: string, updates: Partial<Omit<MemoryItem, 'id' | 'user_id' | 'created_at'>>): Promise<MemoryItem | null> {
    const userId = await this.getUserId();
    console.log(`[MemoryService] Updating memory ID: ${id} for user: ${userId}`);

    // TODO: Encrypt updates.content if present
    // if (updates.content) { updates.content = encrypt(updates.content); }

    // Ensure last_accessed_at is updated if relevant (or rely on trigger)
    if (updates.relevance_score || updates.content) {
        updates.last_accessed_at = new Date();
    }

    const { data, error } = await this.supabase
      .from('memory_items')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId) // Ensure user owns the record they're updating
      .select()
      .single();

    // handlePostgrestError will throw on RLS violation or other DB errors
    this.handlePostgrestError(error, 'updateMemory');

    if (!data) {
      console.log(`[MemoryService] Memory update failed or record not found for ID: ${id}, user: ${userId}`);
      return null; // Or throw? Depends on desired behavior
    }

    console.log(`[MemoryService] Memory updated for ID: ${id}`);
    // TODO: Decrypt data.content before returning
    return data as MemoryItem;
  }

  async deleteMemory(id: string): Promise<boolean> {
    const userId = await this.getUserId();
    console.log(`[MemoryService] Deleting memory ID: ${id} for user: ${userId}`);

    const { error, count } = await this.supabase
      .from('memory_items')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', userId); // Ensure user owns the record

    // Check specifically for RLS error which might present as 0 count despite record existing
    if (error && error.code === '42501') {
        this.handlePostgrestError(error, 'deleteMemory'); // Let handler throw permission error
    }
    // Handle other errors
    this.handlePostgrestError(error, 'deleteMemory');

    const deleted = count === 1;
    if (deleted) {
      console.log(`[MemoryService] Memory deleted successfully for ID: ${id}`);
    } else {
      console.warn(`[MemoryService] Memory delete failed or record not found/accessible for ID: ${id}, user: ${userId}. Count: ${count}`);
    }
    return deleted;
  }
}

// Export the class itself
export { MemoryService }; 