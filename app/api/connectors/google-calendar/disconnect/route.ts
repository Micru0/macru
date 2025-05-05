import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/lib/types/database.types';
import { GoogleCalendarConnector } from '@/lib/connectors/google-calendar';

export async function POST() {
    console.log('POST /api/connectors/google-calendar/disconnect triggered');
    
    // Initialize Supabase client
    let supabase;
    try {
        const cookieStore = await cookies(); 
        supabase = createServerClient<Database>(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) { return cookieStore.get(name)?.value; },
                    set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }); },
                    remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }); },
                },
            }
        );
        console.log('[Disconnect] Supabase client initialized successfully.')
    } catch (clientError: any) {
        console.error('[Disconnect] Error initializing Supabase client:', clientError);
        return NextResponse.json({ error: 'Internal server error during setup' }, { status: 500 });
    }

    try {
        // Check user authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error('[Disconnect] Authentication error:', authError);
            return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
        }
        console.log('[Disconnect] User authenticated:', user.id);

        // Instantiate the connector 
        const connector = new GoogleCalendarConnector(user.id); 

        // Call the disconnect method
        const result = await connector.disconnect(user.id);
        console.log('[Disconnect] Disconnect result:', result);

        if (result.error) {
            return NextResponse.json({ error: 'Disconnect failed', message: result.error }, { status: 500 });
        }

        return NextResponse.json({ message: 'Successfully disconnected Google Calendar' });

    } catch (error: any) {
        console.error('[Disconnect] Error disconnecting Google Calendar:', error);
        return NextResponse.json({ error: 'Failed to disconnect', message: error.message }, { status: 500 });
    }
} 