/**
 * Document Ingestion API endpoint
 * 
 * This API endpoint orchestrates the document processing pipeline:
 * 1. Extract text from documents (PDF, DOCX, TXT)
 * 2. Split text into manageable chunks
 * 3. Generate embeddings for each chunk
 * 4. Store document, chunks, and embeddings in the database
 */

import { NextRequest, NextResponse } from 'next/server';
// Remove unused cookie import 
// import { cookies } from 'next/headers';
// Remove auth-helpers import
// import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
// Import basic createClient
import { createClient } from '@supabase/supabase-js'; 
import { Database } from '@/lib/types/database.types';
import { documentProcessor } from '@/lib/services/document-processor';
import { DocumentIngestionRequest, DocumentIngestionResponse } from '@/lib/types/document';
import { DocumentProcessor } from '@/lib/services/document-processor';

// Keep force-dynamic
export const dynamic = 'force-dynamic';

// Basic Supabase client details (needed for createClient)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// API route for document ingestion
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Use the basic Supabase client
    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

    // Get JWT from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }
    const jwt = authHeader.split(' ')[1];
    
    // Validate JWT and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      console.error('Authentication error (JWT invalid?):', userError);
      return NextResponse.json({ error: 'User not authenticated or invalid token' }, { status: 401 });
    }

    const userId = user.id;

    // Parse request body for file details
    const { fileId, filePath, fileType, filename } = await request.json();

    // Validate required fields
    if (!fileId || !filePath || !filename) { // fileType might be optional/inferred later
      return NextResponse.json({ error: 'Missing required file details (fileId, filePath, filename)' }, { status: 400 });
    }

    // Initialize the DocumentProcessor
    const processor = new DocumentProcessor();

    // Trigger processing (async - don't wait for completion here)
    // Pass all the necessary details
    processor.processDocument({
      fileId: fileId,
      userId: userId,
      filePath: filePath,
      fileType: fileType || '', // Pass empty string if fileType is null/undefined
      fileName: filename, // Use filename as fileName
      sourceType: 'file_upload' // Explicitly set sourceType
    })
      .then(result => {
        console.log(`Successfully initiated processing for file ${fileId}. Result:`, result);
      })
      .catch(error => {
        console.error(`Error processing document ${fileId}:`, error);
      });

    // Respond immediately that processing has started
    return NextResponse.json(
      { message: 'Document ingestion started', fileId },
      { status: 202 } 
    );

  } catch (error) {
    console.error('Error in ingestion route:', error);
    return NextResponse.json(
      { error: 'Failed to start document ingestion', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// --- GET Handler --- 
// Keep GET handler using createRouteHandlerClient for now.
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'; 
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
    const supabaseGet = createRouteHandlerClient<Database>({ cookies }); // Use different variable name
    const { data: { session } } = await supabaseGet.auth.getSession(); // Use different variable name
    
    if (!session || !session.user) {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'Authentication required',
          error: 'Unauthorized',
        } as any, 
        { status: 401 }
      );
    }
    
    const url = new URL(request.url);
    const documentId = url.searchParams.get('documentId');
    
    if (!documentId) {
      return NextResponse.json({ success: false, status: 'error', message: 'documentId is required' } as any, { status: 400 });
    }
    
    const { data, error } = await supabaseGet // Use different variable name
      .from('documents')
      .select('id, status, error_message')
      .eq('id', documentId)
      .eq('user_id', session.user.id)
      .single();
      
    if (error || !data) {
       return NextResponse.json({ success: false, status: 'error', message: 'Document not found or query failed' } as any, { status: error ? 500 : 404 });
    }
    
    return NextResponse.json({ success: true, documentId: data.id, status: data.status, message: `Status: ${data.status}`, error: data.error_message } as any);
} 