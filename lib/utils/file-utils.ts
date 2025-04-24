/**
 * Formats file size in bytes to a human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Gets the file extension from a filename
 */
export function getFileExtension(filename: string): string {
  return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase();
}

/**
 * Checks if a file is an image based on its type
 */
export function isImageFile(fileType: string): boolean {
  return fileType.startsWith('image/');
}

/**
 * Checks if a file is a document based on its type
 */
export function isDocumentFile(fileType: string): boolean {
  const documentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'text/markdown'
  ];
  
  return documentTypes.includes(fileType);
}

/**
 * Gets a file icon name based on MIME type
 */
export function getFileIconByType(fileType: string): string {
  if (isImageFile(fileType)) return 'image';
  if (fileType === 'application/pdf') return 'file-pdf';
  if (fileType === 'text/plain') return 'file-text';
  if (fileType === 'text/csv') return 'file-spreadsheet';
  if (fileType.includes('spreadsheet') || fileType.includes('excel')) return 'file-spreadsheet';
  if (fileType.includes('presentation') || fileType.includes('powerpoint')) return 'file-presentation';
  if (fileType.includes('wordprocessing') || fileType.includes('word')) return 'file-document';
  if (fileType.startsWith('video/')) return 'video';
  if (fileType.startsWith('audio/')) return 'audio';
  
  return 'file';
}

/**
 * Validates a file against size and type constraints
 */
export function validateFile(
  file: File, 
  options: { 
    maxSize?: number, 
    allowedTypes?: string[] 
  } = {}
): { valid: boolean; error?: string } {
  const { 
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = [] 
  } = options;
  
  // Check file size
  if (file.size > maxSize) {
    return { 
      valid: false, 
      error: `File size exceeds the maximum allowed size (${formatFileSize(maxSize)})` 
    };
  }
  
  // Check file type if allowedTypes is provided and not empty
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    return { 
      valid: false, 
      error: `File type not supported. Allowed types: ${allowedTypes.join(', ')}` 
    };
  }
  
  return { valid: true };
}

/**
 * Creates a thumbnail URL for an image file
 */
export function createThumbnailUrl(fileUrl: string, size: number = 100): string {
  // This assumes Supabase storage URLs where we can append width/height params
  if (fileUrl.includes('supabase.co') && isImageFile(getFileTypeFromUrl(fileUrl))) {
    const url = new URL(fileUrl);
    url.searchParams.set('width', size.toString());
    url.searchParams.set('height', size.toString());
    url.searchParams.set('resize', 'cover');
    return url.toString();
  }
  
  // For other URLs, just return the original
  return fileUrl;
}

/**
 * Infers file type from URL or filename
 */
export function getFileTypeFromUrl(url: string): string {
  const extension = getFileExtension(url.split('?')[0]);
  
  const mimeTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'md': 'text/markdown',
    'mp4': 'video/mp4',
    'mp3': 'audio/mpeg'
  };
  
  return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * Gets a descriptive file type name from MIME type
 */
export function getFileTypeName(fileType: string): string {
  if (fileType === 'application/pdf') return 'PDF';
  if (fileType === 'application/msword' || fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'Word Document';
  if (fileType === 'application/vnd.ms-excel' || fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'Spreadsheet';
  if (fileType === 'application/vnd.ms-powerpoint' || fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'Presentation';
  if (fileType === 'text/plain') return 'Text File';
  if (fileType === 'text/csv') return 'CSV File';
  if (fileType === 'text/markdown') return 'Markdown File';
  if (fileType === 'image/jpeg') return 'JPEG Image';
  if (fileType === 'image/png') return 'PNG Image';
  if (fileType === 'image/gif') return 'GIF Image';
  if (fileType === 'image/svg+xml') return 'SVG Image';
  if (fileType.startsWith('image/')) return 'Image';
  if (fileType.startsWith('video/')) return 'Video';
  if (fileType.startsWith('audio/')) return 'Audio';
  
  return 'File';
} 