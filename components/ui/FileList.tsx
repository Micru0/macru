"use client"

import { useState, useEffect } from 'react'
import { FileMetadata } from '@/lib/types/file'
import { Button } from '@/components/ui/button'
import { FileService } from '@/lib/services/file-service'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Trash2, RefreshCw, File as FileIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Helper functions for formatting
const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  else return (bytes / 1048576).toFixed(1) + ' MB';
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString();
};

export interface FileListProps {
  onFileDeleted?: () => void;
  className?: string;
  initialPage?: number;
  pageSize?: number;
  autoRefresh?: boolean;
  fileTypeFilter?: string;
}

type SortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-asc' | 'size-desc'

export function FileList({ 
  onFileDeleted, 
  className = '',
  initialPage = 1,
  pageSize = 10,
  autoRefresh = false,
  fileTypeFilter
}: FileListProps) {
  const [files, setFiles] = useState<FileMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortOption, setSortOption] = useState<SortOption>('newest')
  const [refreshKey, setRefreshKey] = useState(0)
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [totalPages, setTotalPages] = useState(1)
  const [fileToDelete, setFileToDelete] = useState<FileMetadata | null>(null)

  const fileService = new FileService();

  useEffect(() => {
    const fetchFiles = async () => {
      setLoading(true)
      setError(null)
      
      try {
        // Build filter options
        const options = {
          page: currentPage,
          pageSize,
          fileType: fileTypeFilter
        };
        
        const response = await fileService.getFiles(options);
        setFiles(response.files);
        setTotalPages(response.totalPages);
      } catch (err) {
        console.error('Error fetching files:', err)
        setError('Failed to load files. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchFiles()
    
    // Set up auto-refresh if enabled
    let intervalId: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      intervalId = setInterval(() => {
        setRefreshKey(prevKey => prevKey + 1);
      }, 30000); // refresh every 30 seconds
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [currentPage, pageSize, fileTypeFilter, refreshKey])

  const handleRefresh = () => {
    setRefreshKey(prevKey => prevKey + 1)
  }

  const handleDelete = async () => {
    if (!fileToDelete) return;
    
    try {
      const success = await fileService.deleteFile(fileToDelete.id);
      
      if (success) {
        // Remove the file from the local state
        setFiles(prevFiles => prevFiles.filter(file => file.id !== fileToDelete.id));
        
        // Call the callback if provided
        if (onFileDeleted) {
          onFileDeleted();
        }
        
        // Reset the fileToDelete state
        setFileToDelete(null);
      }
    } catch (err) {
      console.error('Error deleting file:', err)
      setError('Failed to delete the file. Please try again.')
    }
  }

  // Sort files based on the selected option
  const sortedFiles = [...files].sort((a, b) => {
    switch (sortOption) {
      case 'newest':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'oldest':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'name-asc':
        return a.filename.localeCompare(b.filename)
      case 'name-desc':
        return b.filename.localeCompare(a.filename)
      case 'size-asc':
        return a.file_size - b.file_size
      case 'size-desc':
        return b.file_size - a.file_size
      default:
        return 0
    }
  })

  if (loading && files.length === 0) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading files...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-destructive/10 p-4 rounded-md">
        <p className="text-destructive">{error}</p>
        <Button onClick={handleRefresh} variant="outline" className="mt-2">
          <RefreshCw className="mr-2 h-4 w-4" /> Try Again
        </Button>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="text-center p-8 border border-dashed rounded-md">
        <FileIcon className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-2 text-lg font-medium">No files found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload files to see them listed here.
        </p>
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Your Files</h2>
        <div className="flex space-x-2">
          <Select 
            value={sortOption} 
            onValueChange={(value) => setSortOption(value as SortOption)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="name-asc">Name (A-Z)</SelectItem>
              <SelectItem value="name-desc">Name (Z-A)</SelectItem>
              <SelectItem value="size-asc">Size (smallest)</SelectItem>
              <SelectItem value="size-desc">Size (largest)</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleRefresh} variant="outline" size="icon" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sortedFiles.map((file) => (
          <Card key={file.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex justify-between">
                <div className="truncate flex-1 mr-4">
                  <h3 className="font-medium truncate" title={file.filename}>
                    {file.filename}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {file.file_type} • {formatFileSize(file.file_size)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Uploaded {formatDate(file.created_at)}
                  </p>
                </div>
                <div className="flex items-start space-x-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button 
                        variant="destructive" 
                        size="icon"
                        onClick={() => setFileToDelete(file)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Delete File</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to delete "{fileToDelete?.filename}"? This action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button 
                          variant="outline" 
                          onClick={() => setFileToDelete(null)}
                        >
                          Cancel
                        </Button>
                        <Button 
                          variant="destructive" 
                          onClick={handleDelete}
                        >
                          Delete
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
} 