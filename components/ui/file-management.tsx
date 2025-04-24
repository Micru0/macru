"use client";

import React, { useState } from 'react';
import { FileUpload } from '@/components/ui/file-upload';
import { FileList } from '@/components/ui/file-list';
import { FileMetadata } from '@/lib/types/file';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export interface FileManagementProps {
  /** Optional custom class name */
  className?: string;
  /** Maximum number of files that can be selected for upload */
  maxUploadFiles?: number;
  /** Custom allowed file types (MIME types) for upload */
  allowedFileTypes?: string[];
  /** Custom max file size in bytes for upload */
  maxFileSize?: number;
  /** File type filter for file list */
  fileTypeFilter?: string;
  /** Number of files per page in the file list */
  pageSize?: number;
  /** Whether to auto-refresh the file list */
  autoRefresh?: boolean;
}

export function FileManagement({
  className = '',
  maxUploadFiles = 1,
  allowedFileTypes,
  maxFileSize,
  fileTypeFilter,
  pageSize = 10,
  autoRefresh = false,
}: FileManagementProps) {
  const [selectedTab, setSelectedTab] = useState<string>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<FileMetadata[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const handleFileUploaded = (file: FileMetadata) => {
    setUploadedFiles(prev => [...prev, file]);
    
    // Switch to the files tab after upload
    setSelectedTab('files');
    
    // Trigger refresh of the file list
    setRefreshTrigger(prev => prev + 1);
  };

  const handleFileDeleted = (fileId: string) => {
    // Remove from the uploaded files list if present
    setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
  };

  return (
    <div className={`w-full ${className}`}>
      <Tabs
        defaultValue="upload"
        value={selectedTab}
        onValueChange={setSelectedTab}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload">Upload Files</TabsTrigger>
          <TabsTrigger value="files">My Files</TabsTrigger>
        </TabsList>
        
        <TabsContent value="upload" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload Files</CardTitle>
              <CardDescription>
                Drag and drop files or click to browse
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload
                maxFiles={maxUploadFiles}
                allowedTypes={allowedFileTypes}
                maxSize={maxFileSize}
                onFileUploaded={handleFileUploaded}
                showPreview={true}
                autoUpload={false}
              />
            </CardContent>
          </Card>
          
          {/* Recently uploaded files */}
          {uploadedFiles.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Recently Uploaded</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {uploadedFiles.map((file, index) => (
                    <div 
                      key={file.id || `uploaded-${index}`} 
                      className="p-2 border rounded flex justify-between items-center"
                    >
                      <div className="truncate">{file.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        Uploaded successfully
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <button 
                  className="text-sm text-primary hover:underline"
                  onClick={() => setUploadedFiles([])}
                >
                  Clear list
                </button>
              </CardFooter>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="files" className="mt-4">
          <FileList
            key={`file-list-${refreshTrigger}`} // Force refresh when files are uploaded
            pageSize={pageSize}
            fileTypeFilter={fileTypeFilter}
            autoRefresh={autoRefresh}
            onFileDeleted={handleFileDeleted}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
} 