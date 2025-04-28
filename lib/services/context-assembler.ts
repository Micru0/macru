/**
 * ContextAssembler
 * 
 * This service is responsible for assembling retrieved document chunks into a coherent context
 * for the LLM, ensuring it fits within token limits and is properly formatted.
 */

import { SearchResult } from './vector-search-service';
import { createLLMRouter } from '../llmRouter';
import { getApiKey } from '../credentials';

/**
 * Error type for context assembly errors
 */
export class ContextAssemblerError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ContextAssemblerError';
  }
}

/**
 * Options for context assembly
 */
export interface ContextAssemblyOptions {
  maxTokens?: number;         // Maximum tokens for the context
  reservedTokens?: number;    // Tokens reserved for the query and system message
  chunkOverlapStrategy?: 'remove' | 'keep' | 'truncate'; // How to handle overlapping chunks
  prioritizeStrategy?: 'similarity' | 'recency' | 'combined'; // How to prioritize chunks
  includeMetadata?: boolean;  // Whether to include metadata in the context
  formatType?: 'markdown' | 'json' | 'text'; // Output format
}

/**
 * Default context assembly options
 */
const DEFAULT_ASSEMBLY_OPTIONS: ContextAssemblyOptions = {
  maxTokens: 6000,           // Default to 6000 tokens (Gemini can handle 8K+)
  reservedTokens: 1000,      // Reserve 1000 tokens for query and system message
  chunkOverlapStrategy: 'truncate',
  prioritizeStrategy: 'similarity',
  includeMetadata: true,
  formatType: 'markdown'
};

/**
 * Result of context assembly
 */
export interface AssembledContext {
  context: string;           // The assembled context
  sources: {                 // Sources information for citation
    id: string;
    title: string;
    content: string;
    document_type?: string;
  }[];
  tokenCount: number;        // Token count of the context
  totalChunks: number;       // Total chunks considered
  usedChunks: number;        // Chunks used in the context
}

/**
 * ContextAssembler for assembling document chunks into a coherent context for the LLM
 */
export class ContextAssembler {
  private options: ContextAssemblyOptions;

  /**
   * Create a new ContextAssembler instance
   * @param options Options for context assembly
   */
  constructor(options: ContextAssemblyOptions = {}) {
    this.options = { ...DEFAULT_ASSEMBLY_OPTIONS, ...options };
  }

  /**
   * Assemble a context from search results
   * @param searchResults Search results to assemble into a context
   * @param query The original query
   * @returns Assembled context
   */
  async assembleContext(
    searchResults: SearchResult[],
    query: string
  ): Promise<AssembledContext> {
    try {
      if (!searchResults.length) {
        return {
          context: "",
          sources: [],
          tokenCount: 0,
          totalChunks: 0,
          usedChunks: 0
        };
      }

      // Initialize token counter
      const apiKey = getApiKey('gemini');
      
      if (!apiKey) {
        throw new ContextAssemblerError('No API key found for Gemini LLM');
      }
      
      const llmRouter = createLLMRouter('gemini', apiKey);
      
      // Sort and prioritize chunks
      const prioritizedResults = this.prioritizeChunks(searchResults);
      
      // Deduplicate or handle overlapping content
      const processedResults = this.processOverlappingChunks(prioritizedResults);
      
      // Assemble context within token limits
      const availableTokens = this.options.maxTokens! - this.options.reservedTokens!;
      let currentTokenCount = 0;
      const selectedChunks: SearchResult[] = [];
      const sources: Record<string, {
        id: string;
        title: string;
        content: string;
        document_type?: string;
      }> = {};
      
      // Build context within token limits
      for (const chunk of processedResults) {
        const chunkContent = chunk.content;
        const chunkTokens = await llmRouter.countTokens(chunkContent);
        
        // Check if adding this chunk would exceed the token limit
        if (currentTokenCount + chunkTokens > availableTokens) {
          // If we haven't selected any chunks yet, take this one but truncate it
          if (selectedChunks.length === 0) {
            const truncatedContent = await this.truncateToFit(
              chunkContent,
              availableTokens,
              llmRouter
            );
            selectedChunks.push({
              ...chunk,
              content: truncatedContent
            });
            currentTokenCount = await llmRouter.countTokens(truncatedContent);
          }
          break;
        }
        
        // Add chunk to selected chunks
        selectedChunks.push(chunk);
        currentTokenCount += chunkTokens;
        
        // Add to sources (de-duplicated by document_id)
        if (!sources[chunk.document_id]) {
          sources[chunk.document_id] = {
            id: chunk.document_id,
            title: chunk.document_title || 'Unknown Document',
            content: chunk.content,
            document_type: chunk.document_type
          };
        }
      }
      
      // Format the context based on the specified format type
      const context = this.formatContext(selectedChunks);
      
      return {
        context,
        sources: Object.values(sources),
        tokenCount: currentTokenCount,
        totalChunks: processedResults.length,
        usedChunks: selectedChunks.length
      };
    } catch (error) {
      throw new ContextAssemblerError(
        `Failed to assemble context: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Prioritize chunks based on the specified strategy
   * @param chunks Chunks to prioritize
   * @returns Prioritized chunks
   */
  private prioritizeChunks(chunks: SearchResult[]): SearchResult[] {
    const { prioritizeStrategy } = this.options;
    
    if (prioritizeStrategy === 'recency') {
      // Sort by recency (newest first)
      return [...chunks].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (prioritizeStrategy === 'combined') {
      // Combine similarity with recency
      return [...chunks].sort((a, b) => {
        const recencyA = new Date(a.created_at).getTime();
        const recencyB = new Date(b.created_at).getTime();
        const recencyWeight = 0.3; // 30% weight to recency
        
        // Normalize recency to a 0-1 scale
        const oldestTime = Math.min(...chunks.map(c => new Date(c.created_at).getTime()));
        const newestTime = Math.max(...chunks.map(c => new Date(c.created_at).getTime()));
        const timeRange = newestTime - oldestTime || 1; // Avoid division by zero
        
        const normalizedRecencyA = (recencyA - oldestTime) / timeRange;
        const normalizedRecencyB = (recencyB - oldestTime) / timeRange;
        
        // Combined score (70% similarity, 30% recency)
        const scoreA = (a.similarity * 0.7) + (normalizedRecencyA * recencyWeight);
        const scoreB = (b.similarity * 0.7) + (normalizedRecencyB * recencyWeight);
        
        return scoreB - scoreA;
      });
    } else {
      // Default: sort by similarity
      return [...chunks].sort((a, b) => b.similarity - a.similarity);
    }
  }

  /**
   * Process overlapping chunks based on the specified strategy
   * @param chunks Chunks to process
   * @returns Processed chunks
   */
  private processOverlappingChunks(chunks: SearchResult[]): SearchResult[] {
    const { chunkOverlapStrategy } = this.options;
    
    if (chunkOverlapStrategy === 'keep') {
      // Keep all chunks as-is
      return chunks;
    }
    
    // Group chunks by document and sort by chunk_index
    const groupedChunks = chunks.reduce((acc, chunk) => {
      if (!acc[chunk.document_id]) {
        acc[chunk.document_id] = [];
      }
      acc[chunk.document_id].push(chunk);
      return acc;
    }, {} as Record<string, SearchResult[]>);
    
    // Sort each group by chunk_index
    Object.values(groupedChunks).forEach(group => {
      group.sort((a, b) => a.chunk_index - b.chunk_index);
    });
    
    if (chunkOverlapStrategy === 'remove') {
      // Remove consecutive chunks from the same document
      const result: SearchResult[] = [];
      
      for (const documentId in groupedChunks) {
        const documentChunks = groupedChunks[documentId];
        
        // Add first chunk from each document
        if (documentChunks.length > 0) {
          result.push(documentChunks[0]);
          
          // Add non-consecutive chunks
          for (let i = 1; i < documentChunks.length; i++) {
            if (documentChunks[i].chunk_index - documentChunks[i-1].chunk_index > 1) {
              result.push(documentChunks[i]);
            }
          }
        }
      }
      
      // Sort result by original order (similarity)
      return result.sort((a, b) => {
        const aIndex = chunks.findIndex(c => c.id === a.id);
        const bIndex = chunks.findIndex(c => c.id === b.id);
        return aIndex - bIndex;
      });
    } else if (chunkOverlapStrategy === 'truncate') {
      // Truncate overlapping parts of consecutive chunks
      const result: SearchResult[] = [];
      
      for (const documentId in groupedChunks) {
        const documentChunks = groupedChunks[documentId];
        
        // Add first chunk from each document
        if (documentChunks.length > 0) {
          result.push(documentChunks[0]);
          
          // Truncate consecutive chunks
          for (let i = 1; i < documentChunks.length; i++) {
            const currentChunk = documentChunks[i];
            const prevChunk = documentChunks[i-1];
            
            // Only process consecutive chunks
            if (currentChunk.chunk_index - prevChunk.chunk_index === 1) {
              // Find overlap between chunks
              const overlapSize = this.findOverlapSize(prevChunk.content, currentChunk.content);
              
              if (overlapSize > 0) {
                // Create a modified chunk with overlap removed
                result.push({
                  ...currentChunk,
                  content: currentChunk.content.substring(overlapSize)
                });
              } else {
                result.push(currentChunk);
              }
            } else {
              result.push(currentChunk);
            }
          }
        }
      }
      
      // Sort result by original order (similarity)
      return result.sort((a, b) => {
        const aIndex = chunks.findIndex(c => c.id === a.id);
        const bIndex = chunks.findIndex(c => c.id === b.id);
        return aIndex - bIndex;
      });
    }
    
    // Default: return chunks as-is
    return chunks;
  }

  /**
   * Truncate content to fit within token limit
   * @param content Content to truncate
   * @param maxTokens Maximum tokens allowed
   * @param llmRouter LLM router for token counting
   * @returns Truncated content
   */
  private async truncateToFit(
    content: string,
    maxTokens: number,
    llmRouter: any
  ): Promise<string> {
    // Quick check if already under limit
    const tokens = await llmRouter.countTokens(content);
    if (tokens <= maxTokens) {
      return content;
    }
    
    // Approximate tokens per character (typically 4-5 chars per token)
    const tokensPerChar = tokens / content.length;
    
    // Estimate number of characters to keep
    const estCharsToKeep = Math.floor(maxTokens / tokensPerChar) - 10; // 10 char safety margin
    
    // Initial truncation
    let truncated = content.substring(0, estCharsToKeep);
    
    // Find last period or sentence break to make a clean cut
    const lastPeriod = truncated.lastIndexOf('.');
    if (lastPeriod > estCharsToKeep * 0.7) { // Only if period is reasonably far along
      truncated = truncated.substring(0, lastPeriod + 1);
    }
    
    // Check actual token count and adjust if needed
    const truncatedTokens = await llmRouter.countTokens(truncated);
    
    if (truncatedTokens > maxTokens) {
      // Recursive call with stricter limit
      return this.truncateToFit(truncated, maxTokens, llmRouter);
    }
    
    return truncated;
  }

  /**
   * Format the selected chunks into a coherent context
   * @param chunks Selected chunks to format
   * @returns Formatted context
   */
  private formatContext(chunks: SearchResult[]): string {
    const { formatType, includeMetadata } = this.options;
    
    // Group chunks by document
    const groupedChunks = chunks.reduce((acc, chunk) => {
      if (!acc[chunk.document_id]) {
        acc[chunk.document_id] = [];
      }
      acc[chunk.document_id].push(chunk);
      return acc;
    }, {} as Record<string, SearchResult[]>);
    
    // Sort each group by chunk_index
    Object.values(groupedChunks).forEach(group => {
      group.sort((a, b) => a.chunk_index - b.chunk_index);
    });
    
    if (formatType === 'json') {
      // JSON format
      const formattedChunks = Object.entries(groupedChunks).map(([documentId, docChunks]) => {
        const documentTitle = docChunks[0].document_title || 'Unknown Document';
        const documentType = docChunks[0].document_type || 'Unknown Type';
        
        return {
          document_id: documentId,
          title: documentTitle,
          type: documentType,
          content: docChunks.map(chunk => chunk.content).join("\n"),
          metadata: includeMetadata ? docChunks[0].metadata : undefined
        };
      });
      
      return JSON.stringify(formattedChunks, null, 2);
    } else if (formatType === 'markdown') {
      // Markdown format
      let markdown = "";
      
      Object.entries(groupedChunks).forEach(([documentId, docChunks], index) => {
        const documentTitle = docChunks[0].document_title || 'Unknown Document';
        const documentType = docChunks[0].document_type || 'Unknown Type';
        
        markdown += `## [${index + 1}] ${documentTitle} (${documentType})\n\n`;
        
        // Join content from all chunks
        const content = docChunks.map(chunk => chunk.content).join("\n");
        markdown += `${content}\n\n`;
        
        // Add metadata if requested
        if (includeMetadata && Object.keys(docChunks[0].metadata || {}).length > 0) {
          markdown += "**Metadata:**\n\n";
          for (const [key, value] of Object.entries(docChunks[0].metadata || {})) {
            markdown += `- ${key}: ${value}\n`;
          }
          markdown += "\n";
        }
        
        // Add separator between documents
        if (index < Object.keys(groupedChunks).length - 1) {
          markdown += "---\n\n";
        }
      });
      
      return markdown;
    } else {
      // Plain text format
      let text = "";
      
      Object.entries(groupedChunks).forEach(([documentId, docChunks], index) => {
        const documentTitle = docChunks[0].document_title || 'Unknown Document';
        
        text += `[${index + 1}] ${documentTitle}\n\n`;
        
        // Join content from all chunks
        const content = docChunks.map(chunk => chunk.content).join("\n");
        text += `${content}\n\n`;
        
        // Add separator between documents
        if (index < Object.keys(groupedChunks).length - 1) {
          text += "----------\n\n";
        }
      });
      
      return text;
    }
  }

  /**
   * Find the size of overlap between two strings
   * @param str1 First string
   * @param str2 Second string
   * @returns Size of overlap in characters
   */
  private findOverlapSize(str1: string, str2: string): number {
    let maxOverlap = 0;
    const minLength = Math.min(str1.length, str2.length);
    
    // Try different overlap sizes, starting from the maximum possible
    for (let size = minLength; size > 0; size--) {
      const endOfStr1 = str1.substring(str1.length - size);
      const startOfStr2 = str2.substring(0, size);
      
      if (endOfStr1 === startOfStr2) {
        maxOverlap = size;
        break;
      }
    }
    
    return maxOverlap;
  }
} 