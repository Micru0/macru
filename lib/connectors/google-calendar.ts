import { google } from 'googleapis';
import { DataConnector, ConnectorData, ConnectionStatus, ConnectorType, SyncStatus } from '../types/data-connector';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '../types/database.types';
import { SupabaseClient } from '@supabase/supabase-js';

// Define required scopes
const SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events' // <<< Added this scope for write access
];

// Helper function to get the OAuth2 client
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

// Updated Token Storage/Retrieval functions
async function saveGoogleToken(userId: string, tokens: any) {
    // Initialize client directly
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
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

    console.log('[Connector] Attempting to save Google token for user:', userId);
    // Calculate expiry date
    let expiryDate: string | null = null;
    if (tokens.expiry_date) {
        expiryDate = new Date(tokens.expiry_date).toISOString();
    } else if (tokens.expires_in) {
        expiryDate = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
    }

    const { data, error } = await supabase
        .from('connector_tokens')
        .upsert({
            user_id: userId,
            connector_type: ConnectorType.GOOGLE_CALENDAR,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            scopes: tokens.scope,
            expiry_date: expiryDate,
            raw_response: tokens,
        }, { onConflict: 'user_id, connector_type' })
        .select();

    if (error) {
        console.error('[Connector] Error saving Google token:', error);
        throw new Error(`Failed to save Google token: ${error.message}`);
    }
    console.log('[Connector] Google token saved successfully:', data);
    return data;
}

async function getGoogleToken(userId: string) {
    // Initialize client directly
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
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

    console.log('[Connector] Attempting to retrieve Google token for user:', userId);
     const { data, error } = await supabase
        .from('connector_tokens')
        .select('*, raw_response')
        .eq('user_id', userId)
        .eq('connector_type', ConnectorType.GOOGLE_CALENDAR)
        .maybeSingle();

    if (error) {
        console.error('[Connector] Error retrieving Google token:', error);
        // Don't throw here, just return null for status check
        return null;
    }
    console.log('[Connector] Google token retrieved:', data ? 'Found' : 'Not Found');
    return data;
}

async function deleteGoogleToken(userId: string) {
    // Initialize client directly
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
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

    console.log('[Connector] Attempting to delete Google token for user:', userId);
     const { error } = await supabase
        .from('connector_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('connector_type', ConnectorType.GOOGLE_CALENDAR);

    if (error) {
        console.error('[Connector] Error deleting Google token:', error);
        throw new Error(`Failed to delete Google token: ${error.message}`);
    }
    console.log('[Connector] Google token deleted successfully for user:', userId);
}


export class GoogleCalendarConnector implements DataConnector {
    readonly type = ConnectorType.GOOGLE_CALENDAR;
    private userId: string;

    constructor(userId?: string) {
        this.userId = userId || "";
    }

    async connect(userId: string, authCode?: string): Promise<ConnectionStatus> {
        console.log(`[Connector Class ${this.type}] connect() called for user ${userId}. Code: ${authCode ? 'provided' : 'missing'}. Relying on OAuth start/callback flow.`);

        if (userId) this.userId = userId;

        if (!this.userId) {
            console.error(`[Connector Class ${this.type}] Cannot check status without userId.`);
            return { 
                connectorType: this.type, 
                isConnected: false, 
                error: 'User ID not provided.' 
            };
        }

        if (authCode) {
             console.warn(`[Connector Class ${this.type}] connect() called with authCode. This is unexpected. Token exchange should happen in callback route.`);
             return { 
                 connectorType: this.type, 
                 isConnected: false, 
                 error: 'Unexpected auth code in connect(). Use callback route.' 
             };
        }

        const status = await this.getConnectionStatus(this.userId);
        return status;
    }

    async disconnect(userId: string): Promise<ConnectionStatus> {
        console.log(`[Connector Class ${this.type}] disconnect() called for user ${userId}`);
        if (!userId) {
            return { 
                connectorType: this.type, 
                isConnected: false, 
                error: 'User ID required for disconnect.' 
            };
        }
        try {
            await deleteGoogleToken(userId);
            console.log(`[Connector Class ${this.type}] Tokens deleted operation completed for user ${userId}`);
            return { 
                connectorType: this.type, 
                isConnected: false, 
                lastSyncStatus: SyncStatus.IDLE
            };
        } catch (error: any) {
             console.error(`[Connector Class ${this.type}] Error disconnecting user ${userId}:`, error);
             return { 
                 connectorType: this.type, 
                 isConnected: false,
                 error: `Disconnect failed: ${error.message}` 
             };
        }
    }

    async getConnectionStatus(userId: string): Promise<ConnectionStatus> {
        console.log(`[Connector Class ${this.type}] getConnectionStatus() called for user ${userId}`);
        if (!userId) {
            return { 
                connectorType: this.type, 
                isConnected: false, 
                error: 'User ID required to check status.' 
            };
        }
        try {
            const tokenData = await getGoogleToken(userId);
            const isConnected = !!tokenData?.access_token;
             console.log(`[Connector Class ${this.type}] Connection status for user ${userId}: ${isConnected}`);
            
            let accountEmail: string | undefined = undefined;
            // Check if raw_response is an object and has id_token before accessing
            if (isConnected && tokenData?.raw_response && typeof tokenData.raw_response === 'object' && 'id_token' in tokenData.raw_response) {
                const idToken = tokenData.raw_response.id_token;
                if (typeof idToken === 'string') {
                    console.log(`[Connector Class ${this.type}] Found id_token, attempting to decode email.`);
                    const decodedIdToken = this.decodeJwt(idToken);
                    accountEmail = decodedIdToken?.email;
                    console.log(`[Connector Class ${this.type}] Decoded email: ${accountEmail}`);
                } else {
                    console.log(`[Connector Class ${this.type}] Found id_token, but it was not a string.`);
                }
            }

            return { 
                connectorType: this.type, 
                isConnected: isConnected,
                accountIdentifier: accountEmail
            };
        } catch (error: any) {
            console.error(`[Connector Class ${this.type}] Error getting connection status for user ${userId}:`, error);
            return { 
                connectorType: this.type, 
                isConnected: false, 
                error: `Status check failed: ${error.message}` 
            };
        }
    }

    // Helper to decode JWT (basic - assumes no verification needed here)
    private decodeJwt(token: string): { email?: string, [key: string]: any } | null {
        try {
            const base64Url = token.split('.')[1];
            if (!base64Url) return null;
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error("[Connector Class] Error decoding JWT:", e);
            return null;
        }
    }

    async fetchData(userId: string, supabase: SupabaseClient<Database>, lastSyncTime?: Date): Promise<ConnectorData[]> {
        console.log(`[Connector Class ${this.type}] fetchData() called for user ${userId}, lastSync: ${lastSyncTime}`);
        if (!userId) {
            throw new Error('User ID required for fetchData.');
        }

        const tokenData = await getGoogleToken(userId);
        if (!tokenData || !tokenData.access_token) {
            throw new Error('No valid Google Calendar token found for user.');
        }

        const oauth2Client = getOAuth2Client();
        oauth2Client.setCredentials({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
        });

        // Handle potential token refresh if needed (googleapis library often handles this)
        // TODO: Explicitly check expiry and refresh if needed?

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const fetchedItems: ConnectorData[] = [];

        // Determine the correct timeMin for the API call
        let timeMinForQuery: string;
        if (lastSyncTime) {
            // Subsequent sync: Fetch events starting from the last sync time
            timeMinForQuery = lastSyncTime.toISOString();
            console.log(`[Connector Class ${this.type}] Subsequent sync detected. Fetching events from ${timeMinForQuery}`);
        } else {
            // Initial sync: Fetch events starting from the beginning of today
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Set to midnight local time
            timeMinForQuery = today.toISOString();
            console.log(`[Connector Class ${this.type}] Initial sync detected. Fetching events from start of today: ${timeMinForQuery}`);
        }

        try {
            const eventsResponse = await calendar.events.list({
                calendarId: 'primary',
                timeMin: timeMinForQuery, // Use the determined timeMin
                singleEvents: true,
                orderBy: 'startTime', 
                eventTypes: ['default'], 
                maxResults: 250, 
            });

            const events = eventsResponse.data.items;
            if (events && events.length > 0) {
                console.log(`[Connector Class ${this.type}] Retrieved ${events.length} events.`);
                for (const event of events) {
                    if (!event.id || !event.summary) {
                        console.warn(`[Connector Class ${this.type}] Skipping event with missing ID or summary.`);
                        continue;
                    }

                    // <<< Add Detailed Logging Here >>>
                    console.log(`[Connector Class ${this.type}] Processing Event:
  - ID: ${event.id}
  - Summary: ${event.summary}
  - Creator: ${event.creator?.email || 'N/A'}
  - Organizer: ${event.organizer?.email || 'N/A'}
  - Source App Title: ${event.source?.title || 'N/A'}
  - Source App URL: ${event.source?.url || 'N/A'}
  - HTML Link: ${event.htmlLink || 'N/A'}`);
                    // <<< End Detailed Logging >>>

                    // --- Construct rawContent --- 
                    let rawContent = `Event: ${event.summary || 'No Title'}`;
                    if (event.description) {
                        rawContent += `\nDescription: ${event.description}`;
                    }
                    if (event.attendees && event.attendees.length > 0) {
                        const attendeeEmails = event.attendees
                            .map(a => a.email)
                            .filter(email => email); // Filter out null/undefined emails
                        if (attendeeEmails.length > 0) {
                            rawContent += `\nAttendees: ${attendeeEmails.join(', ')}`;
                        }
                    }
                     if (event.location) {
                        rawContent += `\nLocation: ${event.location}`;
                    }
                    // --- End Construct rawContent --- 

                    const metadata: Record<string, any> = {
                        sourceUrl: event.htmlLink,
                        sourceId: event.id,
                        // Map GCal fields to structured metadata keys used by DocumentProcessor
                        structured: {
                            event_start_time: event.start?.dateTime || event.start?.date, // Handle all-day events
                            event_end_time: event.end?.dateTime || event.end?.date,     // Handle all-day events
                            content_status: event.status, // e.g., confirmed, tentative, cancelled
                            location: event.location,
                            participants: event.attendees?.map(a => a.email).filter(e => !!e) || [],
                            // Add other potential mappings here
                        },
                        // Store original event timestamps
                        createdTime: event.created,
                        lastEditedTime: event.updated
                    };

                    fetchedItems.push({
                        id: event.id,
                        source: this.type,
                        type: 'google_calendar_event',
                        title: event.summary,
                        content: rawContent, // Use the constructed content
                        metadata: metadata
                    });
                }
            } else {
                 console.log(`[Connector Class ${this.type}] No events found for the given time range.`);
            }

        } catch (error: any) {
            console.error(`[Connector Class ${this.type}] Error fetching Google Calendar data:`, error);
            // TODO: Handle potential token errors (e.g., invalid_grant) and maybe attempt refresh?
            throw new Error(`Failed to fetch Google Calendar data: ${error.message}`);
        }

        return fetchedItems;
    }

    // --- New Method to Create Event ---
    async createEvent(userId: string, eventData: { 
        summary: string; 
        startDateTime: string; 
        endDateTime?: string; 
        // duration?: string; // Handle duration later if needed
        attendees?: string[]; 
        description?: string; 
        location?: string; 
    }): Promise<{ success: boolean; eventId?: string; error?: string }> {
        console.log(`[Connector Class ${this.type}] createEvent() called for user ${userId} with data:`, eventData);
        if (!userId) {
            return { success: false, error: 'User ID required for createEvent.' };
        }

        const tokenData = await getGoogleToken(userId);
        if (!tokenData || !tokenData.access_token) {
             return { success: false, error: 'No valid Google Calendar token found for user.' };
        }

        const oauth2Client = getOAuth2Client();
        oauth2Client.setCredentials({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
        });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        // Basic validation and formatting
        if (!eventData.summary || !eventData.startDateTime) {
            return { success: false, error: 'Missing required fields: summary or startDateTime.' };
        }
        if (!eventData.endDateTime) {
            // Default to 1 hour duration if endDateTime is missing
            try {
                const startDate = new Date(eventData.startDateTime);
                const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour
                eventData.endDateTime = endDate.toISOString();
                console.log(`[Connector Class ${this.type}] endDateTime missing, defaulting to 1 hour duration: ${eventData.endDateTime}`);
            } catch (e) {
                return { success: false, error: 'Invalid startDateTime format for calculating default duration.' };
            }
        }

        const eventPayload: any = {
            summary: eventData.summary,
            start: {
                dateTime: eventData.startDateTime,
                // timeZone: 'Your/Timezone' // TODO: Consider adding timezone awareness
            },
            end: {
                dateTime: eventData.endDateTime,
                 // timeZone: 'Your/Timezone'
            },
        };

        if (eventData.description) {
            eventPayload.description = eventData.description;
        }
        if (eventData.location) {
            eventPayload.location = eventData.location;
        }
        if (eventData.attendees && eventData.attendees.length > 0) {
            eventPayload.attendees = eventData.attendees.map(email => ({ email: email.trim() }));
            // Optionally add conference data for Google Meet link
            eventPayload.conferenceData = {
                createRequest: { requestId: `macru-meet-${Date.now()}` }
            };
        }

        try {
            console.log(`[Connector Class ${this.type}] Calling calendar.events.insert with payload:`, JSON.stringify(eventPayload, null, 2));
            const response = await calendar.events.insert({
                calendarId: 'primary',
                requestBody: eventPayload,
                sendNotifications: true, // Send invitations to attendees
                conferenceDataVersion: 1 // Required if adding conference data
            });

            const createdEvent = response.data;
            console.log(`[Connector Class ${this.type}] Event created successfully. ID: ${createdEvent.id}, Link: ${createdEvent.htmlLink}`);
            return { success: true, eventId: createdEvent.id || undefined };

        } catch (error: any) {
            console.error(`[Connector Class ${this.type}] Error creating Google Calendar event:`, error);
            // Provide more specific error message if possible
            const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
            return { success: false, error: `Failed to create event: ${errorMessage}` };
        }
    }
    // --- End New Method ---
} 