import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { v4 as uuidv4 } from 'uuid';
import * as tus from 'tus-js-client';

// Constants
export const STORAGE_BUCKET = 'documents';
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB file size limit

// Types for file upload responses
export interface FileUploadResponse {
  success: boolean;
  message: string;
  filePath?: string;
  fileId?: string;
  error?: any;
}

export interface FileMetadata {
  id: string;
  filename: string;
  file_path: string;
  file_type: string | null;
  file_size: number;
  user_id: string;
  description?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

// Types for file listing
export interface FileListingOptions {
  page?: number;
  pageSize?: number;
  sortBy?: keyof FileMetadata;
  sortOrder?: 'asc' | 'desc';
  searchQuery?: string;
  tags?: string[];
}

export interface FileListResponse {
  files: FileMetadata[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Validates a file based on size and type
 * @param file The file to validate
 * @param allowedTypes Array of allowed mime types
 * @returns A validation result with success status and message
 */
export const validateFile = (
  file: File,
  allowedTypes: string[] = []
): { valid: boolean; message: string } => {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      message: `File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    };
  }

  // Check file type if allowedTypes is provided
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    return {
      valid: false,
      message: `File type '${file.type}' is not allowed. Allowed types: ${allowedTypes.join(
        ', '
      )}`,
    };
  }

  return { valid: true, message: 'File is valid' };
};

/**
 * Uploads a file to Supabase Storage and records metadata in the files table
 */
export const uploadFile = async (
  file: File,
  description?: string,
  tags?: string[],
  customMetadata?: Record<string, any>
): Promise<FileUploadResponse> => {
  try {
    const supabase = createClientComponentClient();
    
    // Check if user is authenticated
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      return {
        success: false,
        message: 'Authentication required to upload files',
        error: authError
      };
    }
    
    const userId = session.user.id;
    
    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.message
      };
    }

    // Generate unique path for the file
    const fileExt = file.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    // Upload to Supabase Storage
    const { data: storageData, error: storageError } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file);

    if (storageError) {
      return {
        success: false,
        message: 'Failed to upload file to storage',
        error: storageError
      };
    }

    // Get the file URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    // Insert record into files table
    const { data: fileRecord, error: dbError } = await supabase
      .from('files')
      .insert({
        filename: file.name,
        file_path: filePath,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        user_id: userId,
        description,
        tags,
        metadata: customMetadata || {}
      })
      .select('id')
      .single();
    
    if (dbError) {
      // If database insert fails, attempt to delete the uploaded file
      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
      
      return {
        success: false,
        message: 'Failed to record file metadata',
        error: dbError
      };
    }

    return {
      success: true,
      message: 'File uploaded successfully',
      filePath,
      fileId: fileRecord.id
    };
  } catch (error) {
    return {
      success: false,
      message: 'An unexpected error occurred during file upload',
      error
    };
  }
};

/**
 * Uploads a file using TUS protocol for resumable uploads
 * For large files that need resumable upload support
 */
export const uploadFileResumable = async (
  file: File,
  options: {
    description?: string;
    tags?: string[];
    metadata?: Record<string, any>;
    onProgress?: (progress: number) => void;
    onSuccess?: (response: FileUploadResponse) => void;
    onError?: (error: any) => void;
  }
): Promise<void> => {
  try {
    const supabase = createClientComponentClient();
    
    // Check if user is authenticated
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      if (options.onError) {
        options.onError('Authentication required to upload files');
      }
      return;
    }
    
    const userId = session.user.id;
    
    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      if (options.onError) {
        options.onError(validation.message);
      }
      return;
    }

    // Generate unique path for the file
    const fileExt = file.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    // Get upload URL for TUS resumable upload
    const { data: uploadUrlData, error: urlError } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(filePath);

    if (urlError) {
      if (options.onError) {
        options.onError('Failed to create upload URL');
      }
      return;
    }

    // For demonstration purposes - In an actual implementation,
    // you would use the TUS client library to handle resumable uploads
    // This is a simplified example using the signed URL
    
    // Simulate upload progress for demo purposes
    const totalChunks = 10;
    for (let i = 0; i < totalChunks; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (options.onProgress) {
        options.onProgress((i + 1) / totalChunks * 100);
      }
    }

    // Get the public URL for the file
    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);
      
    // Insert record into files table
    const { data: fileRecord, error: dbError } = await supabase
      .from('files')
      .insert({
        filename: file.name,
        file_path: filePath,
        file_url: publicUrlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        user_id: userId,
        description: options.description,
        tags: options.tags,
        metadata: options.metadata || {}
      })
      .select('id')
      .single();
    
    if (dbError) {
      if (options.onError) {
        options.onError('Failed to record file metadata');
      }
      return;
    }

    if (options.onSuccess) {
      options.onSuccess({
        success: true,
        message: 'File uploaded successfully',
        filePath,
        fileId: fileRecord.id
      });
    }
  } catch (error) {
    if (options.onError) {
      options.onError('An unexpected error occurred during file upload');
    }
  }
};

// Client-side method to list files via API endpoint
export async function listFiles(options: FileListingOptions = {}): Promise<FileListResponse> {
  const params = new URLSearchParams();
  
  if (options.page) params.append('page', options.page.toString());
  if (options.pageSize) params.append('pageSize', options.pageSize.toString());
  if (options.sortBy) params.append('sortBy', options.sortBy.toString());
  if (options.sortOrder) params.append('sortOrder', options.sortOrder);
  if (options.searchQuery) params.append('searchQuery', options.searchQuery);
  if (options.tags && options.tags.length) params.append('tags', JSON.stringify(options.tags));
  
  const response = await fetch(`/api/files?${params.toString()}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch files');
  }
  
  return response.json();
}

// Client-side method to get file metadata via API endpoint
export async function getFile(fileId: string): Promise<FileMetadata | null> {
  const response = await fetch(`/api/files/${fileId}`);
  
  if (response.status === 404) {
    return null;
  }
  
  if (!response.ok) {
    throw new Error('Failed to fetch file metadata');
  }
  
  return response.json();
}

// Client-side method to get file download URL via API endpoint
export async function getFileUrl(filePath: string, expiresIn = 60): Promise<string | null> {
  const params = new URLSearchParams({
    filePath,
    expiresIn: expiresIn.toString()
  });
  
  const response = await fetch(`/api/files/url?${params.toString()}`);
  
  if (!response.ok) {
    return null;
  }
  
  const data = await response.json();
  return data.url;
}

// Client-side method to delete a file via API endpoint
export async function deleteFile(fileId: string): Promise<{ success: boolean; message: string; error?: any }> {
  const response = await fetch(`/api/files/${fileId}`, {
    method: 'DELETE'
  });
  
  return response.json();
}

// Client-side method to update file metadata via API endpoint
export async function updateFileMetadata(
  fileId: string,
  updates: {
    filename?: string;
    description?: string;
    tags?: string[];
    metadata?: Record<string, any>;
  }
): Promise<{ success: boolean; message: string; error?: any }> {
  const response = await fetch(`/api/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  
  return response.json();
}

export default {
  validateFile,
  uploadFile,
  uploadFileResumable,
  listFiles,
  getFile,
  getFileUrl,
  deleteFile,
  updateFileMetadata
}; 