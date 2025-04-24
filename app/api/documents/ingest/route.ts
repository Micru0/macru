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
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/lib/types/database.types';
import { documentProcessor } from '@/lib/services/document-processor';
import { DocumentIngestionRequest, DocumentIngestionResponse } from '@/lib/types/document';

// API route for document ingestion
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Create Supabase client with cookies for authenticated session
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // Get authenticated user
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session || !session.user) {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'Authentication required',
          error: 'Unauthorized',
        } as DocumentIngestionResponse,
        { status: 401 }
      );
    }

    // Parse request
    let body: DocumentIngestionRequest;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'Invalid request body',
          error: 'Bad Request',
        } as DocumentIngestionResponse,
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.fileId) {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'fileId is required',
          error: 'Bad Request',
        } as DocumentIngestionResponse,
        { status: 400 }
      );
    }

    // Process the document
    const result = await documentProcessor.processDocument(
      body.fileId,
      session.user.id,
      body.options
    );

    // Return the processing result
    return NextResponse.json({
      success: true,
      documentId: result.documentId,
      status: result.status,
      message: `Document processed successfully. ${result.chunkCount} chunks created.`,
    } as DocumentIngestionResponse);
  } catch (error) {
    console.error('Document ingestion error:', error);
    
    // Handle different types of errors
    if ((error as any).stage === 'extraction') {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'Failed to extract text from document',
          error: (error as Error).message,
        } as DocumentIngestionResponse,
        { status: 422 }
      );
    } else if ((error as any).stage === 'chunking') {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'Failed to chunk document text',
          error: (error as Error).message,
        } as DocumentIngestionResponse,
        { status: 500 }
      );
    } else if ((error as any).stage === 'embedding') {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'Failed to generate embeddings',
          error: (error as Error).message,
        } as DocumentIngestionResponse,
        { status: 500 }
      );
    } else if ((error as any).stage === 'storage') {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'Failed to store document data',
          error: (error as Error).message,
        } as DocumentIngestionResponse,
        { status: 500 }
      );
    }
    
    // Generic error
    return NextResponse.json(
      {
        success: false,
        status: 'error',
        message: 'Document processing failed',
        error: (error as Error).message,
      } as DocumentIngestionResponse,
      { status: 500 }
    );
  }
}

// GET endpoint to check ingestion status by document ID
export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {
    // Create Supabase client with cookies for authenticated session
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // Get authenticated user
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session || !session.user) {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'Authentication required',
          error: 'Unauthorized',
        } as DocumentIngestionResponse,
        { status: 401 }
      );
    }

    // Get document ID from query params
    const url = new URL(request.url);
    const documentId = url.searchParams.get('documentId');
    
    if (!documentId) {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'documentId is required',
          error: 'Bad Request',
        } as DocumentIngestionResponse,
        { status: 400 }
      );
    }

    // Get document status
    const { data, error } = await supabase
      .from('documents')
      .select('id, status, error_message')
      .eq('id', documentId)
      .eq('user_id', session.user.id)
      .single();
    
    if (error) {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'Failed to get document status',
          error: error.message,
        } as DocumentIngestionResponse,
        { status: 500 }
      );
    }
    
    if (!data) {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'Document not found or access denied',
          error: 'Not Found',
        } as DocumentIngestionResponse,
        { status: 404 }
      );
    }
    
    // Return the document status
    return NextResponse.json({
      success: true,
      documentId: data.id,
      status: data.status,
      message: data.status === 'error' 
        ? `Document processing failed: ${data.error_message}`
        : `Document status: ${data.status}`,
      error: data.error_message,
    } as DocumentIngestionResponse);
  } catch (error) {
    console.error('Document status check error:', error);
    
    return NextResponse.json(
      {
        success: false,
        status: 'error',
        message: 'Failed to check document status',
        error: (error as Error).message,
      } as DocumentIngestionResponse,
      { status: 500 }
    );
  }
} 