/**
 * File metadata interface
 */
export interface FileMetadata {
  id: string;
  filename: string;
  file_path: string;
  file_url: string;
  file_type: string | null;
  file_size: number;
  user_id: string;
  description?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Response from file upload operation
 */
export interface FileUploadResponse {
  id: string;
  file: FileMetadata;
}

/**
 * Response from file listing operation
 */
export interface FileListResponse {
  files: FileMetadata[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
} 