import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { v4 as uuidv4 } from 'uuid';
import * as tus from 'tus-js-client';
import { Database } from '@/lib/types/database.types';
import { FileMetadata, FileListResponse, FileUploadResponse } from '@/lib/types/file';
import { createClient } from '@supabase/supabase-js';

// Allowed file types
const ALLOWED_FILE_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.docx', '.txt'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Constants
const STORAGE_BUCKET = 'documents';

// Initialize Supabase client
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Validates if a file meets the requirements (type, size)
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size exceeds maximum allowed size (${MAX_FILE_SIZE / (1024 * 1024)}MB)` };
  }

  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
  
  if (!ALLOWED_FILE_TYPES.includes(file.type) && !ALLOWED_FILE_EXTENSIONS.includes(fileExtension)) {
    return { valid: false, error: 'File type not supported. Please upload PDF, DOCX, or TXT files.' };
  }

  return { valid: true };
}

/**
 * Uploads a file to Supabase Storage using standard upload (for files <= 6MB)
 */
export async function uploadFile(file: File): Promise<FileMetadata> {
  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  // Create a unique filename to avoid collisions
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
  const uniqueFilename = `${uuidv4()}${fileExtension}`;
  
  // File path will be userId/uniqueFilename
  const filePath = `${user.id}/${uniqueFilename}`;

  // Upload to Supabase Storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (uploadError) {
    throw new Error(`Error uploading file: ${uploadError.message}`);
  }

  // Store metadata in database
  const fileMetadata = {
    filename: file.name,
    file_path: filePath,
    file_type: file.type || fileExtension,
    file_size: file.size,
    user_id: user.id,
  };

  const { data: metadataData, error: metadataError } = await supabase
    .from('files')
    .insert(fileMetadata)
    .select()
    .single();

  if (metadataError) {
    // Attempt to delete the uploaded file if metadata insertion fails
    await supabase.storage.from('documents').remove([filePath]);
    throw new Error(`Error storing file metadata: ${metadataError.message}`);
  }

  return metadataData as FileMetadata;
}

/**
 * Uploads a file using resumable upload (TUS protocol) - recommended for files > 6MB
 */
export async function uploadFileResumable(
  file: File, 
  onProgress?: (progress: number) => void,
  onSuccess?: () => void,
  onError?: (error: Error) => void
): Promise<void> {
  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    if (onError) onError(new Error(validation.error));
    throw new Error(validation.error);
  }

  // Get current user and session
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const error = new Error('User not authenticated');
    if (onError) onError(error);
    throw error;
  }

  // Create a unique filename to avoid collisions
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
  const uniqueFilename = `${uuidv4()}${fileExtension}`;
  
  // File path will be userId/uniqueFilename
  const filePath = `${session.user.id}/${uniqueFilename}`;

  // Prepare metadata for database insertion
  const fileMetadata = {
    filename: file.name,
    file_path: filePath,
    file_type: file.type || fileExtension,
    file_size: file.size,
    user_id: session.user.id,
  };

  // Use the SUPABASE_URL from environment variables
  if (!SUPABASE_URL) {
    const error = new Error('Supabase URL is not defined in environment variables');
    if (onError) onError(error);
    throw error;
  }

  return new Promise((resolve, reject) => {
    // Create a new tus upload
    const upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'true', // Overwrite existing files 
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: 'documents',
        objectName: filePath,
        contentType: file.type,
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024, // 6MB chunks (required by Supabase)
      onError: (error) => {
        console.error('Upload failed:', error);
        if (onError) onError(error);
        reject(error);
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = (bytesUploaded / bytesTotal) * 100;
        if (onProgress) onProgress(percentage);
      },
      onSuccess: async () => {
        try {
          // Store metadata in database after successful upload
          const { data, error: metadataError } = await supabase
            .from('files')
            .insert(fileMetadata)
            .select()
            .single();

          if (metadataError) {
            // The file was uploaded but we couldn't store the metadata
            console.error('Error storing file metadata:', metadataError);
            if (onError) onError(new Error(`Error storing file metadata: ${metadataError.message}`));
            reject(metadataError);
            return;
          }

          if (onSuccess) onSuccess();
          resolve();
        } catch (error) {
          if (error instanceof Error) {
            if (onError) onError(error);
            reject(error);
          }
        }
      },
    });

    // Check if there are any previous uploads to continue
    upload.findPreviousUploads().then((previousUploads) => {
      // Found previous uploads so we select the first one
      if (previousUploads.length) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      
      // Start the upload
      upload.start();
    });
  });
}

/**
 * Retrieves the list of files for the current user
 */
export async function getUserFiles(): Promise<FileMetadata[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('user_id', user.id)
    .order('upload_date', { ascending: false });

  if (error) {
    throw new Error(`Error retrieving files: ${error.message}`);
  }

  return data as FileMetadata[];
}

/**
 * Gets a temporary URL for a file
 */
export async function getFileUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(filePath, 3600); // URL valid for 1 hour

  if (error) {
    throw new Error(`Error getting file URL: ${error.message}`);
  }

  return data.signedUrl;
}

// Export only client-side compatible services
export class FileService {
  private readonly storage = supabase.storage;
  private readonly bucket = 'documents';

  /**
   * Upload a file to the server
   * 
   * @param file The file to upload
   * @param metadata Optional metadata for the file
   * @returns The uploaded file data
   */
  async uploadFile(file: File, metadata?: Record<string, any>): Promise<FileUploadResponse> {
    try {
      // Create a unique file path
      const filePath = `${Date.now()}_${file.name}`;
      
      // Upload to Supabase storage
      const { data, error } = await this.storage
        .from(this.bucket)
        .upload(filePath, file);
      
      if (error) {
        console.error('Supabase storage upload error:', error);
        throw error;
      }
      
      // Get public URL
      const { data: urlData } = await this.storage
        .from(this.bucket)
        .getPublicUrl(filePath);

      // Create metadata entry
      const fileMetadata: Partial<FileMetadata> = {
        filename: file.name,
        file_path: data.path,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        metadata: metadata,
      };
      
      // Store in database
      const { data: metadataData, error: metadataError } = await supabase
        .from('files')
        .insert(fileMetadata)
        .select()
        .single();
      
      if (metadataError) {
        console.error('Supabase database insert error:', metadataError);
        throw metadataError;
      }
      
      return {
        id: metadataData.id,
        file: metadataData as FileMetadata
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    }
  }

  /**
   * Get a list of files with optional filtering
   * @param options Filtering options
   * @returns A list of files matching the filter criteria
   */
  async getFiles(options?: {
    page?: number;
    pageSize?: number;
    userId?: string;
    fileType?: string;
    tags?: string[];
  }): Promise<FileListResponse> {
    try {
      const {
        page = 1,
        pageSize = 10,
        userId,
        fileType,
        tags
      } = options || {};
      
      // Start building the query
      let query = supabase
        .from('files')
        .select('*', { count: 'exact' });
      
      // Apply filters
      if (userId) {
        query = query.eq('user_id', userId);
      }
      
      if (fileType) {
        query = query.eq('file_type', fileType);
      }
      
      if (tags && tags.length > 0) {
        query = query.contains('tags', tags);
      }
      
      // Apply pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      const { data, error, count } = await query
        .range(from, to)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return {
        files: data as FileMetadata[],
        totalCount: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
        currentPage: page,
        pageSize
      };
    } catch (error) {
      console.error('Error fetching files:', error);
      throw new Error('Failed to retrieve files');
    }
  }

  /**
   * Get a single file by its ID
   * @param fileId The ID of the file to retrieve
   * @returns The file metadata
   */
  async getFile(fileId: string): Promise<FileMetadata> {
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('id', fileId)
        .single();
      
      if (error) throw error;
      if (!data) throw new Error('File not found');
      
      return data as FileMetadata;
    } catch (error) {
      console.error('Error fetching file:', error);
      throw new Error('Failed to retrieve file');
    }
  }

  /**
   * Update file metadata
   * @param fileId The ID of the file to update
   * @param updates The updates to apply
   * @returns The updated file metadata
   */
  async updateFile(fileId: string, updates: Partial<FileMetadata>): Promise<FileMetadata> {
    try {
      // Don't allow updating critical fields
      const safeUpdates = { ...updates };
      delete safeUpdates.id;
      delete safeUpdates.file_path;
      delete safeUpdates.user_id;
      delete safeUpdates.created_at;
      
      const { data, error } = await supabase
        .from('files')
        .update({ ...safeUpdates, updated_at: new Date().toISOString() })
        .eq('id', fileId)
        .select()
        .single();
      
      if (error) throw error;
      
      return data as FileMetadata;
    } catch (error) {
      console.error('Error updating file:', error);
      throw new Error('Failed to update file');
    }
  }

  /**
   * Delete a file by its ID
   * @param fileId The ID of the file to delete
   * @returns Boolean indicating success
   */
  async deleteFile(fileId: string): Promise<boolean> {
    try {
      // First get the file to get the path
      const { data: fileData, error: fetchError } = await supabase
        .from('files')
        .select('file_path')
        .eq('id', fileId)
        .single();
      
      if (fetchError) throw fetchError;
      if (!fileData) throw new Error('File not found');
      
      // Delete from storage
      const { error: storageError } = await this.storage
        .from(this.bucket)
        .remove([fileData.file_path]);
      
      if (storageError) throw storageError;
      
      // Delete metadata from database
      const { error: dbError } = await supabase
        .from('files')
        .delete()
        .eq('id', fileId);
      
      if (dbError) throw dbError;
      
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      throw new Error('Failed to delete file');
    }
  }
} 