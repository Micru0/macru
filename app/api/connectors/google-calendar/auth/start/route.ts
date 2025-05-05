import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// Define required scopes, including openid and email for id_token
const SCOPES = [
    'openid',
    'email',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events'
];

// Re-use the helper function to get the OAuth2 client
function getOAuth2Client() {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
        throw new Error('Google OAuth environment variables are not set.');
    }
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
}

export async function GET() {
    console.log('GET /api/connectors/google-calendar/auth/start triggered');
    try {
        const oauth2Client = getOAuth2Client();

        // Generate the URL that will obtain consent and request offline access (for refresh token)
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent', // Force consent screen to ensure refresh token is granted
            // TODO: Add state parameter for CSRF protection
            // state: generateCsrfToken(), // You would need a function to generate and store/verify this
        });

        console.log('Redirecting user to Google Auth URL:', authUrl);
        // Redirect the user to the Google authorization page
        return NextResponse.redirect(authUrl);

    } catch (error: any) {
        console.error('Error generating Google Auth URL:', error);
        // Redirect user to an error page or back to settings with an error message
        const errorUrl = new URL('/dashboard/settings', process.env.APP_URL || 'http://localhost:3000');
        errorUrl.searchParams.set('error', 'google_calendar_auth_start_failed');
        errorUrl.searchParams.set('message', error.message || 'Failed to start Google Calendar authentication.');
        return NextResponse.redirect(errorUrl.toString());
    }
} 