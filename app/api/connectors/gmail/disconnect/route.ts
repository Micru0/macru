import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { GmailConnector } from '@/lib/connectors/gmail';
import { ConnectionStatus, ConnectorType } from '@/lib/types/data-connector';

const gmailConnector = new GmailConnector();

export async function POST(request: Request) {
  const cookieStore = await cookies(); // Await here
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // set/remove needed if disconnect modifies session
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: any) {
          cookieStore.set(name, '', options);
        },
      },
    }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    // Assume connector handles its own Supabase client via cookies()
    const status: ConnectionStatus = await gmailConnector.disconnect(user.id);
    return NextResponse.json(status);
  } catch (error: any) {
    console.error(`Error disconnecting Gmail for user ${user.id}:`, error);
    // Return a status indicating failure but potentially still connected if revoke failed
    const failStatus: ConnectionStatus = {
      connectorType: ConnectorType.GMAIL, // Use the enum member
      isConnected: true, // Assume still connected if disconnect logic failed
      error: error.message || 'Failed to disconnect'
    };
    return new NextResponse(JSON.stringify(failStatus), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
} 