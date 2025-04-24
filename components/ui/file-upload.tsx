"use client";

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileIcon, UploadIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/Progress';
import { FileService } from '@/lib/services/file-service';
import { uploadFileResumable } from '@/lib/services/file-service';
import { showSuccess, showError, showInfo } from '@/lib/utils/toast';
import { FileMetadata, FileUploadResponse } from '@/lib/types/file';

// Constants for file validation
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/gif'
];

export interface FileUploadProps {
  /** Optional custom class name */
  className?: string;
  /** Maximum number of files that can be selected */
  maxFiles?: number;
  /** Custom allowed file types (MIME types) */
  allowedTypes?: string[];
  /** Custom max file size in bytes */
  maxSize?: number;
  /** Callback when file is successfully uploaded */
  onFileUploaded?: (file: FileMetadata) => void;
  /** Callback when upload fails */
  onError?: (error: Error) => void;
  /** Custom upload text */
  uploadText?: string;
  /** Whether to show file preview */
  showPreview?: boolean;
  /** Whether to upload immediately on file drop */
  autoUpload?: boolean;
  /** Additional metadata to include with the file upload */
  metadata?: Record<string, any>;
  /** Optional mock service for testing (bypasses real upload service) */
  mockUploadService?: {
    uploadFile: (file: File, metadata?: Record<string, any>) => Promise<FileUploadResponse>
  };
}

export function FileUpload({
  className = '',
  maxFiles = 1,
  allowedTypes = ALLOWED_FILE_TYPES,
  maxSize = MAX_FILE_SIZE,
  onFileUploaded,
  onError,
  uploadText = "Drag and drop files here, or click to browse",
  showPreview = true,
  autoUpload = false,
  metadata,
  mockUploadService
}: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploading, setUploading] = useState<boolean>(false);
  const fileService = new FileService();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Filter out files that don't meet requirements
    const validFiles = acceptedFiles.filter(file => {
      const isValidType = allowedTypes.includes(file.type);
      const isValidSize = file.size <= maxSize;
      
      if (!isValidType) {
        showError(`${file.name} is not a supported file type.`);
      }
      
      if (!isValidSize) {
        showError(`${file.name} exceeds the maximum file size of ${maxSize / (1024 * 1024)}MB.`);
      }
      
      return isValidType && isValidSize;
    });

    // Only take max number of files
    const filesToAdd = validFiles.slice(0, maxFiles - files.length);
    
    if (filesToAdd.length > 0) {
      setFiles(prev => [...prev, ...filesToAdd]);
      
      // Automatically upload if autoUpload is true
      if (autoUpload) {
        uploadFiles(filesToAdd);
      }
    }
  }, [files, maxFiles, allowedTypes, maxSize, autoUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles,
    accept: allowedTypes.reduce((acc, type) => {
      // Convert MIME types to accept format
      acc[type] = [];
      return acc;
    }, {} as Record<string, string[]>),
    maxSize,
    disabled: uploading || files.length >= maxFiles
  });

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const uploadFiles = async (filesToUpload: File[] = files) => {
    if (filesToUpload.length === 0) return;
    
    setUploading(true);
    setUploadProgress(0);
    
    try {
      // For single file uploads
      if (filesToUpload.length === 1) {
        const file = filesToUpload[0];
        
        // Use resumable upload for larger files to show progress
        if (file.size > 6 * 1024 * 1024 && !mockUploadService) { // 6MB threshold
          await uploadFileResumable(
            file,
            (progress) => {
              setUploadProgress(progress);
            },
            () => {
              showSuccess(`${file.name} has been uploaded.`);
              setFiles([]);
              if (onFileUploaded) {
                // Since uploadFileResumable doesn't return metadata,
                // we'd need to fetch it separately if needed
                // For now, we'll pass a basic object
                onFileUploaded({
                  id: '',
                  filename: file.name,
                  file_path: '',
                  file_url: '',
                  file_type: file.type,
                  file_size: file.size,
                  user_id: '',
                  description: null,
                  tags: [],
                  metadata: {},
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
              }
            },
            (error) => {
              showError(error.message);
              if (onError) onError(error);
            }
          );
        } else {
          // Use standard upload for smaller files or when using mock service
          let response;
          
          if (mockUploadService) {
            // Use the mock service if provided
            response = await mockUploadService.uploadFile(file, metadata);
          } else {
            // Use the regular file service
            response = await fileService.uploadFile(file, metadata);
          }
          
          if (onFileUploaded) {
            onFileUploaded(response.file);
          }
          
          showSuccess(`${file.name} has been uploaded.`);
          
          // Clear the files array after successful upload
          setFiles([]);
        }
      } 
      // For multiple files, we'd implement batch uploads here
      else {
        // This would be implemented for multiple file uploads
        // Showing progress would be more complex
        showInfo("Multiple file upload is not implemented yet.");
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      showError(error instanceof Error ? error.message : "An unexpected error occurred");
      
      if (onError && error instanceof Error) {
        onError(error);
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-primary'}
          ${uploading || files.length >= maxFiles ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center space-y-2">
          <UploadIcon className="h-8 w-8 text-gray-400" />
          <p className="text-sm text-gray-600">{uploadText}</p>
          <p className="text-xs text-gray-500">
            Max file size: {formatFileSize(maxSize)} | Allowed types: {allowedTypes.map(type => type.split('/')[1]).join(', ')}
          </p>
        </div>
      </div>

      {/* File preview */}
      {showPreview && files.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">Selected files:</p>
          {files.map((file, index) => (
            <div 
              key={`${file.name}-${index}`}
              className="flex items-center justify-between p-2 border rounded-md bg-gray-50"
            >
              <div className="flex items-center space-x-2">
                <FileIcon className="h-5 w-5 text-gray-400" />
                <div className="text-sm">
                  <p className="font-medium truncate max-w-xs">{file.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <button
                onClick={() => removeFile(index)}
                className="text-gray-500 hover:text-red-500"
                disabled={uploading}
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-xs">
            <span>Uploading...</span>
            <span>{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-2" />
        </div>
      )}

      {/* Upload button (if not auto-upload) */}
      {!autoUpload && files.length > 0 && (
        <Button
          className="mt-4 w-full"
          onClick={() => uploadFiles()}
          disabled={uploading || files.length === 0}
        >
          {uploading ? 'Uploading...' : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
        </Button>
      )}
    </div>
  );
} 