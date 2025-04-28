import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid'; // For generating state parameter

export async function GET(request: NextRequest) {
  const notionClientId = process.env.NOTION_CLIENT_ID;
  const notionRedirectUri = process.env.NOTION_REDIRECT_URI; // e.g., http://localhost:3000/api/connectors/notion/auth/callback

  if (!notionClientId || !notionRedirectUri) {
    console.error('[Notion Auth Start] Missing NOTION_CLIENT_ID or NOTION_REDIRECT_URI environment variables.');
    return NextResponse.json({ error: 'Notion integration not configured correctly.' }, { status: 500 });
  }

  // Generate a unique state parameter for CSRF protection
  const state = uuidv4();
  // TODO: Store the state temporarily (e.g., in session cookie or short-lived DB entry) to verify later

  const params = new URLSearchParams({
    client_id: notionClientId,
    redirect_uri: notionRedirectUri,
    response_type: 'code',
    owner: 'user', // Request user-specific token
    state: state, // Include state for security
  });

  const authorizationUrl = `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;

  console.log('[Notion Auth Start] Redirecting user to Notion authorization URL.');
  // Redirect the user to Notion's authorization page
  return NextResponse.redirect(authorizationUrl);
} 