import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/lib/types/database.types';

interface FileUpdateParams {
  filename?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

// GET: Retrieve a specific file by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const fileId = params.id;
    
    // Get user session
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to access files' },
        { status: 401 }
      );
    }
    
    // Get the file by ID, ensuring it belongs to the current user
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', session.user.id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'File not found' },
          { status: 404 }
        );
      }
      
      console.error('Database error:', error);
      return NextResponse.json(
        { error: `Failed to fetch file: ${error.message}` },
        { status: 500 }
      );
    }
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Unhandled error in file retrieval:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while fetching the file' },
      { status: 500 }
    );
  }
}

// DELETE: Remove a file by ID
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const fileId = params.id;
    
    // Get user session
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to delete files' },
        { status: 401 }
      );
    }
    
    // First get the file to get the filePath
    const { data: file, error: fetchError } = await supabase
      .from('files')
      .select('file_path')
      .eq('id', fileId)
      .eq('user_id', session.user.id)
      .single();
    
    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'File not found or you do not have permission to delete it' },
          { status: 404 }
        );
      }
      
      console.error('Database error:', fetchError);
      return NextResponse.json(
        { error: `Failed to find file: ${fetchError.message}` },
        { status: 500 }
      );
    }
    
    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('files')
      .remove([file.file_path]);
    
    if (storageError) {
      console.error('Storage error:', storageError);
      return NextResponse.json(
        { error: `Failed to delete file from storage: ${storageError.message}` },
        { status: 500 }
      );
    }
    
    // Delete from database
    const { error: dbError } = await supabase
      .from('files')
      .delete()
      .eq('id', fileId)
      .eq('user_id', session.user.id);
    
    if (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.json(
        { error: `Failed to delete file record: ${dbError.message}` },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true, message: 'File deleted successfully' });
    
  } catch (error) {
    console.error('Unhandled error in file deletion:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while deleting the file' },
      { status: 500 }
    );
  }
}

// PATCH: Update file metadata
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const fileId = params.id;
    
    // Get user session
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to update files' },
        { status: 401 }
      );
    }
    
    // Parse update data
    const updateData = await request.json();
    
    // Only allow certain fields to be updated
    const safeUpdateData: Record<string, any> = {};
    const allowedFields = ['filename', 'description', 'tags', 'metadata'];
    
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        safeUpdateData[key] = updateData[key];
      }
    });
    
    // Add updated timestamp
    safeUpdateData.updated_at = new Date().toISOString();
    
    // Check if the file exists and belongs to the user
    const { data: existingFile, error: checkError } = await supabase
      .from('files')
      .select('id')
      .eq('id', fileId)
      .eq('user_id', session.user.id)
      .single();
    
    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'File not found or you do not have permission to update it' },
          { status: 404 }
        );
      }
      
      console.error('Database error:', checkError);
      return NextResponse.json(
        { error: `Failed to validate file access: ${checkError.message}` },
        { status: 500 }
      );
    }
    
    // Update the file metadata
    const { data, error } = await supabase
      .from('files')
      .update(safeUpdateData)
      .eq('id', fileId)
      .eq('user_id', session.user.id)
      .select()
      .single();
    
    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: `Failed to update file: ${error.message}` },
        { status: 500 }
      );
    }
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Unhandled error in file update:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while updating the file' },
      { status: 500 }
    );
  }
} 