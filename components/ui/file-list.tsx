"use client";

import React, { useEffect, useState } from 'react';
import { FileIcon, ImageIcon, FileTextIcon, Trash2Icon, RefreshCwIcon, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from '@/components/ui/dialog';
import { FileService } from '@/lib/services/file-service';
import { FileMetadata, FileListResponse } from '@/lib/types/file';
import { showSuccess, showError } from '@/lib/utils/toast';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface FileListProps {
  /** Optional custom class name */
  className?: string;
  /** Initial page number for pagination */
  initialPage?: number;
  /** Number of items per page */
  pageSize?: number;
  /** Whether to auto-refresh the list */
  autoRefresh?: boolean;
  /** Callback when a file is deleted */
  onFileDeleted?: (fileId: string) => void;
  /** Callback when a file is selected */
  onFileSelected?: (file: FileMetadata) => void;
  /** Whether file selection is enabled */
  selectable?: boolean;
  /** Filter by file type */
  fileTypeFilter?: string;
}

export function FileList({
  className = '',
  initialPage = 1,
  pageSize = 10,
  autoRefresh = false,
  onFileDeleted,
  onFileSelected,
  selectable = false,
  fileTypeFilter
}: FileListProps) {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<FileMetadata | null>(null);
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const fileService = new FileService();

  const fetchFiles = async () => {
    try {
      setLoading(true);
      
      // Build filter object
      const filters: any = {
        page: currentPage,
        pageSize: pageSize
      };
      
      // Add file type filter if specified
      if (fileTypeFilter) {
        filters.fileType = fileTypeFilter;
      }
      
      // Add search query if present (this would be implemented server-side)
      if (searchQuery) {
        filters.searchQuery = searchQuery;
      }
      
      const response = await fileService.getFiles(filters);
      
      setFiles(response.files);
      setTotalPages(response.totalPages);
      setTotalCount(response.totalCount);
    } catch (error) {
      console.error('Error fetching files:', error);
      showError('Failed to load files');
    } finally {
      setLoading(false);
    }
  };
  
  // Initial fetch and refresh on dependency changes
  useEffect(() => {
    fetchFiles();
    
    // Set up auto-refresh if enabled
    let intervalId: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      intervalId = setInterval(fetchFiles, 30000); // Refresh every 30 seconds
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [currentPage, pageSize, fileTypeFilter, searchQuery, sortBy, sortOrder]);

  const handleRefresh = () => {
    fetchFiles();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1); // Reset to first page on new search
    fetchFiles();
  };

  const handleDeleteFile = async () => {
    if (!fileToDelete) return;
    
    try {
      const success = await fileService.deleteFile(fileToDelete.id);
      
      if (success) {
        showSuccess(`${fileToDelete.filename} has been deleted`);
        
        // Remove file from local state
        setFiles(prevFiles => prevFiles.filter(file => file.id !== fileToDelete.id));
        
        // Call callback if provided
        if (onFileDeleted) {
          onFileDeleted(fileToDelete.id);
        }
        
        // Reset file to delete
        setFileToDelete(null);
        
        // If we just deleted the last file on the page, go back a page
        if (files.length === 1 && currentPage > 1) {
          setCurrentPage(prev => prev - 1);
        } else {
          // Otherwise just refresh the current page
          fetchFiles();
        }
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      showError('Failed to delete file');
    }
  };

  const handleFileClick = (file: FileMetadata) => {
    if (selectable) {
      setSelectedFileId(file.id);
      if (onFileSelected) {
        onFileSelected(file);
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getFileIcon = (fileType: string | null) => {
    if (!fileType) return <FileIcon className="h-5 w-5" />;
    
    if (fileType.startsWith('image/')) {
      return <ImageIcon className="h-5 w-5 text-blue-500" />;
    } else if (fileType.includes('pdf')) {
      return <FileIcon className="h-5 w-5 text-red-500" />;
    } else {
      return <FileTextIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <div className={`w-full ${className}`}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Files</CardTitle>
              <CardDescription>
                {totalCount} {totalCount === 1 ? 'file' : 'files'} stored in your account
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCwIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          
          {/* Search and filters */}
          <div className="flex flex-col sm:flex-row gap-2 mt-2">
            <form onSubmit={handleSearch} className="flex-1 flex">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search files..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button type="submit" variant="ghost" className="ml-2">Search</Button>
            </form>
            <div className="flex gap-2">
              <Select 
                value={sortBy} 
                onValueChange={(value) => setSortBy(value)}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Upload Date</SelectItem>
                  <SelectItem value="filename">Filename</SelectItem>
                  <SelectItem value="file_size">File Size</SelectItem>
                </SelectContent>
              </Select>
              
              <Select 
                value={sortOrder} 
                onValueChange={(value: 'asc' | 'desc') => setSortOrder(value)}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {loading && files.length === 0 ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No files found</p>
              {searchQuery && (
                <p className="text-sm mt-1">Try adjusting your search criteria</p>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead className="hidden md:table-cell">Size</TableHead>
                    <TableHead className="hidden md:table-cell">Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((file) => (
                    <TableRow 
                      key={file.id} 
                      className={`${selectedFileId === file.id ? 'bg-accent/50' : ''} ${selectable ? 'cursor-pointer' : ''}`}
                      onClick={() => handleFileClick(file)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {getFileIcon(file.file_type)}
                          <span className="truncate max-w-[150px] md:max-w-[250px]">
                            {file.filename}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {file.file_type ? (
                          <Badge variant="outline">
                            {file.file_type.split('/')[1] || file.file_type}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Unknown</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {formatFileSize(file.file_size)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {formatDate(file.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFileToDelete(file);
                              }}
                            >
                              <Trash2Icon className="h-4 w-4 text-destructive" />
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
                                onClick={handleDeleteFile}
                              >
                                Delete
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {files.length} of {totalCount} files
                  </div>
                  <div className="flex gap-1">
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 