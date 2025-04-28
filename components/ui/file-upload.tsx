"use client";

import React, { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileIcon, UploadIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/Progress';
import { FileService } from '@/lib/services/file-service';
import { showSuccess, showError, showInfo } from '@/lib/utils/toast';
import { FileMetadata, FileUploadResponse } from '@/lib/types/file';
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/lib/types/database.types';

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
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const fileService = new FileService();

  // Effect using createBrowserClient
  useEffect(() => {
    console.log('FileUpload (ssr browser): useEffect running...');
    const supabase = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ); 
    let isMounted = true;

    // Simplify: Just set auth ready. Listener might not be needed if
    // createBrowserClient handles state internally more reliably.
    // Let's try without the listener first for simplicity.
    setIsAuthReady(true);
    console.log('FileUpload (ssr browser): Auth marked as ready.');

    /* // --- Listener logic (keep commented for now) ---
    const checkSessionAndSetListener = async () => { ... };
    checkSessionAndSetListener();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(...);
    return () => { ... };
    */

    // Simple cleanup function
    return () => { isMounted = false; }

  }, []); 

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
    disabled: !isAuthReady || uploading || files.length >= maxFiles
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
    if (!isAuthReady) {
      showError("Component not ready. Please wait.");
      return;
    }
    
    if (filesToUpload.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    
    try {
      if (filesToUpload.length === 1) {
        const file = filesToUpload[0];
        const useResumable = file.size > 6 * 1024 * 1024 && !mockUploadService;

        if (useResumable) {
          // Update required here if resumable needed
          showError("Resumable upload not updated for createBrowserClient yet."); 
          throw new Error("Resumable upload not implemented.");
        } else {
          let response: FileUploadResponse | undefined;
          if (mockUploadService) {
            response = await mockUploadService.uploadFile(file, metadata);
          } else {
            response = await fileService.uploadFile(file, metadata);
          }

          // Ensure response and response.file are valid
          if (!response || !response.file) {
            throw new Error("Upload succeeded but file metadata was not returned.");
          }
          
          if (onFileUploaded) {
            onFileUploaded(response.file);
          }
          
          showSuccess(`${file.name} has been uploaded. Starting processing...`);
          
          // --- RE-ENABLE triggerIngestion --- 
          console.log('Calling triggerIngestion...'); // Add log
          await triggerIngestion(response.file); 
          console.log('triggerIngestion finished.'); // Add log

          // --- KEEP COMMENTED OUT --- 
          // Clear files now
          // console.log('Skipping setFiles([]) for debugging...');
          // setFiles([]); 
          // --- END TEMPORARY --- 
        }
      } else {
        showInfo("Multiple file upload is not implemented yet.");
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      showError(error instanceof Error ? error.message : "An unexpected error occurred during upload");
      if (onError && error instanceof Error) onError(error);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Updated triggerIngestion to accept FileMetadata object
  const triggerIngestion = async (fileMetadata: FileMetadata) => {
    // Get token just-in-time using createBrowserClient
    const supabase = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ); 
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      showError('Authentication token not available for ingestion trigger.');
      console.error('Error triggering ingestion: No token from getSession()');
      if (onError) onError(new Error('Authentication token not available'));
      return; 
    }

    try {
      // Send required metadata to the API
      const apiPayload = {
        fileId: fileMetadata.id,
        filePath: fileMetadata.file_path,
        fileType: fileMetadata.file_type,
        filename: fileMetadata.filename
      };

      const response = await fetch('/api/documents/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(apiPayload),
      });

      // Check if the response status is OK (2xx range)
      if (!response.ok) {
        // Try to parse error JSON, but handle cases where it might not be JSON
        let errorMsg = `Failed to start ingestion (status ${response.status})`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorData.message || errorMsg;
        } catch (e) {
          // Ignore JSON parsing error if response wasn't JSON
          console.warn('Could not parse error response as JSON');
        }
        throw new Error(errorMsg);
      }

      // Handle 202 Accepted specifically - likely no JSON body
      if (response.status === 202) {
        console.log(`Ingestion started successfully (Status ${response.status}) for file: ${fileMetadata.filename}`);
        showInfo(`Processing started for file ${fileMetadata.filename}`);
      } else {
        // Handle other potential success statuses (e.g., 200 OK) if they might return JSON
        try {
           const data = await response.json(); 
           console.log('Ingestion API returned data:', data);
           showInfo(`Processing started for file ${fileMetadata.filename}`); // Still show info
        } catch (e) {
           console.warn('Could not parse success response as JSON, but status was ok.');
           showInfo(`Processing started for file ${fileMetadata.filename}`); // Still show info
        }
      }

    } catch (error) {
      console.error('Error triggering ingestion:', error);
      showError(`Failed to start processing: ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (onError && error instanceof Error) onError(error);
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
          ${!isAuthReady || uploading || files.length >= maxFiles ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center space-y-2">
          <UploadIcon className="h-8 w-8 text-gray-400" />
          <p className="text-sm text-gray-600">
            {!isAuthReady ? "Checking authentication..." : uploadText}
          </p>
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
          disabled={!isAuthReady || uploading || files.length === 0}
        >
          {uploading ? 'Uploading...' : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
        </Button>
      )}
    </div>
  );
}
