/**
 * PromptFormatter
 * 
 * This service is responsible for formatting prompts for the LLM based on
 * the user query and assembled context.
 */

import { AssembledContext } from './context-assembler';

/**
 * Options for prompt formatting
 */
export interface PromptFormatterOptions {
  systemMessageTemplate?: string;   // Template for system message
  promptTemplate?: string;          // Template for user prompt
  citationStyle?: 'inline' | 'end'; // How to format citations
  includeSourceDetails?: boolean;   // Whether to include source details
  promptType?: 'rag' | 'qa' | 'summary' | 'analysis'; // Type of prompt
}

/**
 * Default prompt formatter options
 */
const DEFAULT_FORMATTER_OPTIONS: PromptFormatterOptions = {
  systemMessageTemplate: 
    "You are MACRU, an AI assistant that helps users find information in their documents. " +
    "CRITICAL INSTRUCTION: Answer the user's question based *exclusively* on the provided context. " +
    "Do *not* use any external knowledge or make assumptions. " +
    "If the information is not present in the context, you MUST respond *exactly* with: 'I don\'t have enough information in the provided documents to answer that.' " +
    "Do not add any other explanation if the information is not found. " +
    "If the answer is found, cite your sources using [number] notation corresponding to the context sections.",
  promptTemplate:
    "Context information is below.\n\n" +
    "---------------------\n" +
    "{context}\n" +
    "---------------------\n\n" +
    "Given the context information and not prior knowledge, answer the query.\n" +
    "Query: {query}\n\n" +
    "If the query cannot be answered based on the context, respond with \"I don't have enough information to answer that.\"",
  citationStyle: 'inline',
  includeSourceDetails: true,
  promptType: 'rag'
};

/**
 * Different prompt types
 */
const PROMPT_TEMPLATES = {
  rag: {
    system:
      "You are MACRU, an AI assistant that helps users find information in their documents. " +
      "Answer the user's question based only on the provided context. " +
      "If you don't know the answer or the information is not in the context, say so clearly. " +
      "Do not make up information or use external knowledge not in the context. " +
      "Cite your sources using [number] notation.",
    prompt:
      "Context information is below.\n\n" +
      "---------------------\n" +
      "{context}\n" +
      "---------------------\n\n" +
      "Given the context information and not prior knowledge, answer the query.\n" +
      "Query: {query}\n\n" +
      "If the query cannot be answered based on the context, respond with \"I don't have enough information to answer that.\"" +
      "Include citations to the relevant parts of the context using [number] notation."
  },
  qa: {
    system:
      "You are MACRU, an AI assistant designed for precise question answering. " +
      "Directly answer the user's questions based on the provided information. " +
      "Keep answers concise and to the point. " +
      "If no clear answer exists in the context, state that clearly.",
    prompt:
      "Answer the following question using only the provided context:\n\n" +
      "Context:\n{context}\n\n" +
      "Question: {query}\n\n" +
      "Answer:"
  },
  summary: {
    system:
      "You are MACRU, an AI assistant that creates clear, concise summaries. " +
      "Summarize the key points from the provided documents relevant to the user's query. " +
      "Focus on accuracy and brevity.",
    prompt:
      "Please summarize the following information, focusing on aspects relevant to: {query}\n\n" +
      "---------------------\n" +
      "{context}\n" +
      "---------------------\n\n" +
      "Provide a concise summary that captures the key points."
  },
  analysis: {
    system:
      "You are MACRU, an AI assistant specialized in deep analysis. " +
      "Analyze the provided information to identify patterns, insights, and implications. " +
      "Provide thoughtful analysis with supporting evidence from the context.",
    prompt:
      "Analyze the following information with respect to: {query}\n\n" +
      "---------------------\n" +
      "{context}\n" +
      "---------------------\n\n" +
      "Provide a detailed analysis that identifies key patterns, connections, and implications. " +
      "Use specific references from the provided context to support your analysis."
  }
};

/**
 * Formatted prompt for LLM
 */
export interface FormattedPrompt {
  systemMessage: string;
  userMessage: string;
  sources: {
    id: string;
    title: string;
    content: string;
    document_type?: string;
  }[];
}

/**
 * PromptFormatter for creating effective prompts for the LLM
 */
export class PromptFormatter {
  private options: PromptFormatterOptions;

  /**
   * Create a new PromptFormatter instance
   * @param options Options for prompt formatting
   */
  constructor(options: PromptFormatterOptions = {}) {
    // Start with default options
    this.options = { ...DEFAULT_FORMATTER_OPTIONS };
    
    // If a specific prompt type is provided, use its templates
    if (options.promptType && PROMPT_TEMPLATES[options.promptType]) {
      this.options.systemMessageTemplate = PROMPT_TEMPLATES[options.promptType].system;
      this.options.promptTemplate = PROMPT_TEMPLATES[options.promptType].prompt;
    }
    
    // Override with any explicitly provided options
    this.options = { ...this.options, ...options };
  }

  /**
   * Format a prompt for the LLM
   * @param query User query
   * @param context Assembled context
   * @returns Formatted prompt
   */
  formatPrompt(query: string, context: AssembledContext): FormattedPrompt {
    // Replace placeholders in the system message
    const systemMessage = this.options.systemMessageTemplate || DEFAULT_FORMATTER_OPTIONS.systemMessageTemplate || "";
    
    // Format the context with citations if needed
    const formattedContext = this.formatContextWithCitations(context);
    
    // Replace placeholders in the user message
    let userMessage = this.options.promptTemplate || DEFAULT_FORMATTER_OPTIONS.promptTemplate || "";
    userMessage = userMessage
      .replace("{context}", formattedContext)
      .replace("{query}", query);
    
    // If source details are included, add them at the end
    if (this.options.includeSourceDetails && this.options.citationStyle === 'end') {
      userMessage += this.formatSourceDetails(context.sources);
    }
    
    return {
      systemMessage,
      userMessage,
      sources: context.sources
    };
  }

  /**
   * Format context with appropriate citations
   * @param context Assembled context
   * @returns Formatted context with citations
   */
  private formatContextWithCitations(context: AssembledContext): string {
    if (this.options.citationStyle === 'inline') {
      // Add source numbering to each context section
      const lines = context.context.split('\n');
      let currentSource = 0;
      let inContentSection = false;
      const citedLines: string[] = [];
      
      for (const line of lines) {
        // Detect headers/section titles in markdown format
        if (line.startsWith('## [')) {
          inContentSection = true;
          currentSource++;
          citedLines.push(line);
        } else if (line.startsWith('---') || line.startsWith('----------')) {
          inContentSection = false;
          citedLines.push(line);
        } else if (inContentSection) {
          // Skip metadata lines
          if (line.includes('**Metadata:**') || line.startsWith('- ')) {
            citedLines.push(line);
          } else if (line.trim() !== '') {
            // Add citation to non-empty content lines
            citedLines.push(`${line} [${currentSource}]`);
          } else {
            citedLines.push(line);
          }
        } else {
          citedLines.push(line);
        }
      }
      
      return citedLines.join('\n');
    } else {
      // For end citations, just return the context as-is
      return context.context;
    }
  }

  /**
   * Format source details for end-of-prompt citations
   * @param sources Sources from assembled context
   * @returns Formatted source details
   */
  private formatSourceDetails(sources: AssembledContext['sources']): string {
    if (!sources.length) {
      return '';
    }
    
    let sourceDetails = "\n\nSources:\n";
    
    sources.forEach((source, index) => {
      sourceDetails += `[${index + 1}] ${source.title}`;
      if (source.document_type) {
        sourceDetails += ` (${source.document_type})`;
      }
      sourceDetails += '\n';
    });
    
    return sourceDetails;
  }
} 