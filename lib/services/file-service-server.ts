import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import { Database } from '@/lib/types/database.types';
import { FileMetadata, FileUploadResponse } from '@/lib/types/file';

// Constants
const STORAGE_BUCKET = 'documents';

/**
 * Server-side file service exports
 */
export const FileServiceServer = {
  /**
   * Upload a file to Supabase Storage
   */
  async upload(file: File, userId: string, options?: { description?: string; tags?: string[] }): Promise<FileUploadResponse> {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error('SUPABASE_URL environment variable is not defined');
    }

    // Generate a unique file path with user ID prefix for RLS
    const fileExtension = file.name.split('.').pop() || '';
    const uniqueId = uuidv4();
    const filePath = `${userId}/${uniqueId}.${fileExtension}`;
    
    const supabase = createServerComponentClient<Database>({ cookies });
    
    // Upload the file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file);
    
    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }
    
    if (!uploadData) {
      throw new Error('Upload failed with no error');
    }
    
    // Get the full public URL
    const { data: publicUrl } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    // Create a record in the files table
    const { data: fileRecord, error: insertError } = await supabase
      .from('files')
      .insert({
        filename: file.name,
        file_path: filePath,
        file_url: publicUrl.publicUrl,
        file_type: file.type,
        file_size: file.size,
        user_id: userId,
        description: options?.description || null,
        tags: options?.tags || [],
        metadata: {}
      })
      .select('id')
      .single();
    
    if (insertError) {
      // If DB insert fails, try to clean up the already uploaded file
      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
      console.error('Error creating file record:', insertError);
      throw new Error(`Failed to create file record: ${insertError.message}`);
    }
    
    return {
      id: fileRecord.id,
      path: filePath,
      fullPath: publicUrl.publicUrl,
      filename: file.name
    } as any; // Type cast to avoid error with FileUploadResponse
  },

  /**
   * Get a list of files for a specific user
   */
  async listFiles(userId: string): Promise<FileMetadata[]> {
    const supabase = createServerComponentClient<Database>({ cookies });
    
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', userId)
      .order('upload_date', { ascending: false });
    
    if (error) {
      console.error('Error listing files:', error);
      throw new Error(`Failed to list files: ${error.message}`);
    }

    // Add type assertion to safely handle the metadata field
    return (data || []) as unknown as FileMetadata[];
  },
  
  /**
   * Get a single file's metadata by ID
   */
  async getFile(fileId: string, userId: string): Promise<FileMetadata> {
    const supabase = createServerComponentClient<Database>({ cookies });
    
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', userId)
      .single();
    
    if (error) {
      console.error('Error getting file:', error);
      throw new Error(`Failed to get file: ${error.message}`);
    }

    // Add type assertion for metadata compatibility
    return data as unknown as FileMetadata;
  },
  
  /**
   * Generate a temporary download URL for a file
   */
  async getDownloadUrl(filePath: string): Promise<string> {
    const supabase = createServerComponentClient<Database>({ cookies });
    
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(filePath, 60); // 60 seconds expiry
    
    if (error) {
      console.error('Error creating download URL:', error);
      throw new Error(`Failed to create download URL: ${error.message}`);
    }
    
    return data.signedUrl;
  },

  /**
   * Delete a file and its metadata
   */
  async deleteFile(fileId: string, userId: string): Promise<void> {
    const supabase = createServerComponentClient<Database>({ cookies });
    
    // First get the file path
    const { data: file, error: fetchError } = await supabase
      .from('files')
      .select('file_path')
      .eq('id', fileId)
      .eq('user_id', userId)
      .single();
    
    if (fetchError) {
      console.error('Error finding file to delete:', fetchError);
      throw new Error(`Failed to find file: ${fetchError.message}`);
    }
    
    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([file.file_path]);
    
    if (storageError) {
      console.error('Error deleting file from storage:', storageError);
      throw new Error(`Failed to delete file from storage: ${storageError.message}`);
    }
    
    // Delete from database (this would happen automatically with cascade, but we'll be explicit)
    const { error: dbError } = await supabase
      .from('files')
      .delete()
      .eq('id', fileId)
      .eq('user_id', userId);
    
    if (dbError) {
      console.error('Error deleting file record:', dbError);
      throw new Error(`Failed to delete file record: ${dbError.message}`);
    }
  },
  
  /**
   * Update file metadata
   */
  async updateFileMetadata(
    fileId: string, 
    userId: string, 
    updates: { 
      description?: string; 
      tags?: string[];
      metadata?: Record<string, any>;
    }
  ): Promise<FileMetadata> {
    const supabase = createServerComponentClient<Database>({ cookies });
    
    const { data, error } = await supabase
      .from('files')
      .update(updates)
      .eq('id', fileId)
      .eq('user_id', userId)
      .select('*')
      .single();
    
    if (error) {
      console.error('Error updating file metadata:', error);
      throw new Error(`Failed to update file metadata: ${error.message}`);
    }
    
    // Add type assertion for metadata compatibility
    return data as unknown as FileMetadata;
  }
}; 