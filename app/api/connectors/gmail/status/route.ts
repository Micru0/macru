import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { GmailConnector } from '@/lib/connectors/gmail';
import { ConnectionStatus } from '@/lib/types/data-connector';

const gmailConnector = new GmailConnector();

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return new NextResponse(JSON.stringify({ isConnected: false, error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    // We need to await cookies() before passing to the connector potentially
    // Let's assume the connector handles its own Supabase client init via cookies()
    const status: ConnectionStatus = await gmailConnector.getConnectionStatus(user.id);
    return NextResponse.json(status);
  } catch (error: any) {
    console.error(`Error fetching Gmail connection status for user ${user.id}:`, error);
    return new NextResponse(JSON.stringify({ isConnected: false, error: 'Failed to fetch status' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
} 