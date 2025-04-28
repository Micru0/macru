"use client";

import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '@/components/ui/chat-interface';
import { Source, ProcessedResponse } from './response-processor';

interface ApiResponse {
  response: ProcessedResponse;
}

interface ChatServiceResponse {
  content: string;
  sources?: Source[];
}

/**
 * Sends a query to the LLM API and returns the response
 * Calls the CAG endpoint which includes document retrieval and context.
 */
export async function sendQueryToLLM(
  query: string,
  conversationHistory: ChatMessage[] = []
): Promise<ChatServiceResponse> {
  try {
    // Format conversation history for the LLM
    const formattedHistory = conversationHistory.map((msg) => ({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.content,
    }));
    
    // Send query to API route
    const response = await fetch('/api/llm/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        history: formattedHistory,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to get response from LLM API');
    }

    // Parse the API response which now contains the processed response object
    const apiData: ApiResponse = await response.json();
    
    // Extract the content and sources from the processed response
    const processedResponse = apiData.response;
    
    if (!processedResponse || typeof processedResponse.responseText !== 'string') {
      console.error('[ChatService] Invalid response structure from API:', apiData);
      throw new Error('Received invalid response structure from the backend.');
    }

    // Return the content and the actual sources from the API
    return {
      content: processedResponse.responseText,
      sources: processedResponse.sources,
    };
  } catch (error) {
    console.error('[ChatService] Error querying LLM:', error);
    // Provide a more specific error message if possible
    const errorMessage = error instanceof Error ? error.message : 'Failed to get a response. Please try again.';
    throw new Error(errorMessage);
  }
}

/**
 * Creates a new user message object
 */
export function createUserMessage(content: string): ChatMessage {
  return {
    id: uuidv4(),
    content,
    isUser: true,
    timestamp: new Date(),
  };
}

/**
 * Creates a new assistant message object
 */
export function createAssistantMessage(
  content: string,
  sources?: Source[]
): ChatMessage {
  return {
    id: uuidv4(),
    content,
    isUser: false,
    timestamp: new Date(),
    sources,
  };
}

/**
 * Client-side functions for conversation storage
 * These must be used in client components
 */
export const conversationStorage = {
  /**
   * Stores the conversation in localStorage
   * In a future implementation, this would be stored in the database
   */
  storeConversation(conversationId: string, messages: ChatMessage[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`conversation_${conversationId}`, JSON.stringify(messages));
    }
  },

  /**
   * Retrieves a stored conversation from localStorage
   */
  getStoredConversation(conversationId: string): ChatMessage[] {
    if (typeof window === 'undefined') {
      return [];
    }
    
    const stored = localStorage.getItem(`conversation_${conversationId}`);
    if (!stored) {
      return [];
    }
    
    try {
      const parsed = JSON.parse(stored);
      // Convert stored ISO date strings back to Date objects
      return parsed.map((message: any) => ({
        ...message,
        timestamp: new Date(message.timestamp)
      }));
    } catch (error) {
      console.error('Error parsing stored conversation:', error);
      return [];
    }
  },

  /**
   * Clears a stored conversation from localStorage
   */
  clearStoredConversation(conversationId: string): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`conversation_${conversationId}`);
    }
  },
  
  /**
   * Generates a new conversation ID
   */
  generateConversationId(): string {
    return uuidv4();
  }
}; 