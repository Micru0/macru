import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { Database } from '@/lib/types/database.types';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/gif'
];
const STORAGE_BUCKET = 'files';

export async function POST(request: NextRequest) {
  try {
    // Get user session
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to upload files' },
        { status: 401 }
      );
    }
    
    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    // Validate file existence
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum allowed size (${MAX_FILE_SIZE / (1024 * 1024)}MB)` },
        { status: 400 }
      );
    }
    
    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type not supported. Please upload a PDF, DOCX, TXT, JPEG, PNG, or GIF file.' },
        { status: 400 }
      );
    }
    
    // Get metadata if provided
    let metadata: Record<string, any> = {};
    const metadataStr = formData.get('metadata');
    
    if (metadataStr && typeof metadataStr === 'string') {
      try {
        metadata = JSON.parse(metadataStr);
      } catch (err) {
        console.error('Error parsing metadata:', err);
        // Continue with empty metadata
      }
    }
    
    // Create a unique filename to avoid collisions
    const fileExtension = file.name.split('.').pop() || '';
    const uniqueId = uuidv4();
    const userId = session.user.id;
    const filePath = `${userId}/${uniqueId}.${fileExtension}`;
    
    // Upload to Supabase Storage
    const fileBuffer = await file.arrayBuffer();
    const { data: storageData, error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      });
    
    if (storageError) {
      console.error('Storage error:', storageError);
      return NextResponse.json(
        { error: `Failed to upload file: ${storageError.message}` },
        { status: 500 }
      );
    }
    
    // Get file URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);
    
    // Save metadata in database
    const fileMetadata = {
      filename: file.name,
      file_path: filePath,
      file_url: urlData.publicUrl,
      file_type: file.type,
      file_size: file.size,
      user_id: userId,
      description: metadata.description || null,
      tags: metadata.tags || [],
      metadata: metadata.additionalData || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data: dbData, error: dbError } = await supabase
      .from('files')
      .insert(fileMetadata)
      .select()
      .single();
    
    if (dbError) {
      // If DB insert fails, try to clean up the uploaded file
      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
      console.error('Database error:', dbError);
      return NextResponse.json(
        { error: `Failed to store file metadata: ${dbError.message}` },
        { status: 500 }
      );
    }
    
    // Return success with file data
    return NextResponse.json({
      id: dbData.id,
      file: dbData
    });
    
  } catch (error) {
    console.error('Unhandled error in file upload:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred during file upload' },
      { status: 500 }
    );
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
} 