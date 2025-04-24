import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/lib/types/database.types';

// GET - Retrieve a list of files with filtering options
export async function GET(request: NextRequest) {
  try {
    // Get user session
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to access files' },
        { status: 401 }
      );
    }
    
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);
    const fileType = searchParams.get('fileType');
    const tags = searchParams.getAll('tags'); 
    
    // Calculate pagination values
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    
    // Start building query
    let query = supabase
      .from('files')
      .select('*', { count: 'exact' })
      .eq('userId', session.user.id); // Only show files for current user
    
    // Apply fileType filter if provided
    if (fileType) {
      query = query.eq('fileType', fileType);
    }
    
    // Apply tags filter if provided
    if (tags && tags.length > 0) {
      query = query.contains('tags', tags);
    }
    
    // Apply pagination and ordering
    const { data, error, count } = await query
      .range(from, to)
      .order('createdAt', { ascending: false });
    
    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: `Failed to fetch files: ${error.message}` },
        { status: 500 }
      );
    }
    
    // Return paginated results
    return NextResponse.json({
      files: data,
      totalCount: count || 0,
      totalPages: Math.ceil((count || 0) / pageSize),
      currentPage: page,
      pageSize: pageSize
    });
    
  } catch (error) {
    console.error('Unhandled error in file listing:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while fetching files' },
      { status: 500 }
    );
  }
} 