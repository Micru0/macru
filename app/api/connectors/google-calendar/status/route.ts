import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/lib/types/database.types';
import { GoogleCalendarConnector } from '@/lib/connectors/google-calendar'; // Adjust path if needed

export async function GET() {
    console.log('GET /api/connectors/google-calendar/status triggered');
    
    // Initialize Supabase client directly within the handler
    let supabase;
    try {
        const cookieStore = await cookies(); // Await cookies here
        supabase = createServerClient<Database>(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return cookieStore.get(name)?.value;
                    },
                    set(name: string, value: string, options) {
                        try {
                          cookieStore.set({ name, value, ...options });
                        } catch (error) { /* Server Component handling */ }
                      },
                      remove(name: string, options) {
                        try {
                          cookieStore.set({ name, value: '', ...options });
                        } catch (error) { /* Server Component handling */ }
                      },
                },
            }
        );
        console.log('[Status] Supabase client initialized successfully in handler.')
    } catch (clientError: any) {
        console.error('[Status] Error initializing Supabase client in handler:', clientError);
        return NextResponse.json({ error: 'Internal server error during setup' }, { status: 500 });
    }

    try {
        // Check user authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error('[Status] Authentication error:', authError);
            return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
        }

        console.log('[Status] User authenticated:', user.id);

        // Instantiate the connector for the user
        // Note: GoogleCalendarConnector itself uses a helper internally which might still cause issues.
        // If errors persist, the helper inside GoogleCalendarConnector might also need refactoring.
        const connector = new GoogleCalendarConnector(user.id);

        // Get connection status
        const status = await connector.getConnectionStatus(user.id);

        console.log('[Status] Connection status retrieved:', status);
        return NextResponse.json(status);

    } catch (error: any) {
        console.error('[Status] Error fetching Google Calendar connection status:', error);
        return NextResponse.json({ error: 'Failed to fetch status', message: error.message }, { status: 500 });
    }
} 