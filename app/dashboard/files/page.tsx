"use client";

import React from 'react';
import { FileManagement } from '@/components/ui/file-management';

export default function FilesPage() {
  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">File Manager</h1>
        <p className="text-muted-foreground mt-1">
          Upload, view, and manage your files
        </p>
      </div>

      <FileManagement 
        maxUploadFiles={5}
        pageSize={10}
        autoRefresh={false}
      />
    </div>
  );
} 