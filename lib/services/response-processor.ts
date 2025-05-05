import { v4 as uuidv4 } from 'uuid';

// Define the structure for source chunks retrieved from vector search
export interface SourceChunk {
  documentId: string; // UUID of the source document
  documentName: string; // Filename or title of the source document
  chunkIndex: number; // Index of the chunk within the document
  content: string; // Text content of the chunk
  similarity?: number; // Similarity score from vector search
  metadata?: Record<string, any>; // Optional metadata (e.g., page number)
  documentType?: string; // Added document type
  source_url?: string | null; // Original URL of the source document (optional)
}

// Define the structure for a citation object (Internal use for now)
interface InternalCitation {
  id: string; // Unique ID for this citation instance
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string; // Keep content for potential snippet
  documentType?: string; // Added document type
}

// Define the structure expected by the existing ChatMessage component
export interface Source {
  title: string;
  content?: string;
  url?: string; // Keep for potential future links
}

// Define the structure for the processed response returned by the API
export interface ProcessedResponse {
  responseText: string; // The original text from the LLM
  sources: Source[]; // Adjusted to match ChatMessage expectation
}

export class ResponseProcessor {
  constructor() {
    // Initialization logic if needed
  }

  /**
   * Processes the LLM response and associates it with source chunks.
   * Formats the source chunks into the Source[] structure expected by ChatMessage.
   * @param llmResponseText The raw text response from the LLM.
   * @param sourceChunks The array of source chunks used to generate the context for the LLM.
   * @returns A ProcessedResponse object containing the original text and sources.
   */
  processResponse(llmResponseText: string, sourceChunks: SourceChunk[]): ProcessedResponse {
    console.log('[ResponseProcessor] Processing response with sources:', sourceChunks);
    
    const internalCitations: InternalCitation[] = sourceChunks.map((chunk) => ({
      id: uuidv4(),
      documentId: chunk.documentId,
      documentName: chunk.documentName || `Document ${chunk.documentId.substring(0, 8)}`, // Fallback name
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      documentType: chunk.documentType || chunk.metadata?.source_type || 'unknown' // Get type from chunk or metadata
    }));

    // Basic deduplication based on documentId and chunkIndex
    const uniqueInternalCitations = Array.from(
      new Map(internalCitations.map(c => [`${c.documentId}-${c.chunkIndex}`, c]))
      .values()
    );

    // Map internal citations to the Source[] format expected by the frontend
    const sources: Source[] = uniqueInternalCitations.map(citation => {
      // Conditionally add prefix based on document type
      let prefix = '';
      switch (citation.documentType) {
        case 'notion':
          prefix = 'Notion: ';
          break;
        case 'file_upload': // Assuming 'file_upload' is the type for manual uploads
          prefix = 'File: ';
          break;
        // Add cases for other types like 'gmail', 'gdrive' etc. as needed
        default:
          prefix = ''; // No prefix for unknown or other types
      }
      return {
        title: `${prefix}${citation.documentName}`, // Conditionally add prefix
        content: citation.content.substring(0, 100) + '...', // Keep snippet for now, maybe remove later
        // url: `/documents/${citation.documentId}?chunk=${citation.chunkIndex}` // Example future URL
      }
    });

    return {
      responseText: llmResponseText,
      sources: sources, // Use the key 'sources' as expected by frontend
    };
  }

  // Future methods for more advanced processing:
  // - mapResponseSegmentsToSources(responseText, sourceChunks)
  // - generateInlineCitations(responseText, citations)
  // - formatCitationList(citations)
  // - validateAttribution(processedResponse)
} 