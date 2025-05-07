import { SupabaseClient } from '@supabase/supabase-js';

// Define the structure and methods required for all data connectors

export enum ConnectorType {
  NOTION = 'notion',
  GOOGLE_CALENDAR = 'google_calendar',
  GOOGLE_DRIVE = 'google_drive',
  GMAIL = 'gmail',
  FILE_UPLOAD = 'file_upload', // Represents the existing file upload mechanism
  // Add other types as needed
}

export enum SyncStatus {
  IDLE = 'idle',
  SYNCING = 'syncing',
  SUCCESS = 'success',
  ERROR = 'error',
  NEEDS_AUTH = 'needs_auth',
}

// Interface for the result of a sync operation
export interface SyncResult {
    connectorType: ConnectorType;
    status: 'success' | 'partial_success' | 'error';
    processedCount: number;
    errorCount: number;
    message: string;
    firstErrorMessage?: string; 
}

// Interface for the data returned by a connector's fetch operation
// This should be transformable into the Document/Chunk format used by the ingestion pipeline
export interface ConnectorData {
  id: string; // Unique ID within the source system (e.g., Notion page ID)
  type: string; // e.g., 'page', 'database_item', 'email', 'event'
  title: string;
  content: string; // Raw or semi-structured content
  fileName?: string; // Optional: Filename associated with the data (e.g., for uploads, or constructed like message ID)
  metadata: Record<string, any>; // Source-specific metadata (timestamps, author, URLs, etc.)
  source: ConnectorType; // Track the origin
  lastModified?: Date; // Optional: Last modified time in source system
}

// Interface for connection status and details
export interface ConnectionStatus {
  connectorType: ConnectorType;
  isConnected: boolean;
  accountName?: string; // Add optional account name
  lastSyncTime?: Date;
  lastSyncStatus?: SyncStatus;
  syncProgress?: number; // Optional: 0-100 for progress indication
  error?: string; // Optional: Error message if last sync failed
  accountIdentifier?: string; // Optional: e.g., email address associated with the connection
}

// The main interface for a Data Connector
export interface DataConnector {
  type: ConnectorType;

  // Connects to the external service, usually involving OAuth or API key setup
  // May return connection details or status
  connect(userId: string, authCode?: string): Promise<ConnectionStatus>;

  // Disconnects from the service, revoking tokens if necessary
  disconnect(userId: string): Promise<ConnectionStatus>;

  // Checks the current connection status for the user
  getConnectionStatus(userId: string): Promise<ConnectionStatus>;

  // Fetches new or updated data since the last sync
  // Should ideally support incremental fetching
  fetchData(userId: string, supabase: SupabaseClient, lastSyncTime?: Date): Promise<ConnectorData[]>;

  // Optional: Transforms fetched data into a standardized format if needed before ingestion
  // If not provided, the ingestion pipeline assumes fetchData returns compatible data
  // transformData?(rawData: any[]): Promise<ConnectorData[]>; // Example signature

  // Optional: Triggers a manual sync operation
  triggerSync?(userId: string): Promise<SyncStatus>;

  // Optional: Get specific configuration options for this connector
  // getConfigOptions?(userId: string): Promise<Record<string, any>>;

  // Optional: Update configuration options
  // updateConfigOptions?(userId: string, options: Record<string, any>): Promise<void>;
}

export type DataConnectorType = 'notion' | 'google_calendar' | 'gmail'; 