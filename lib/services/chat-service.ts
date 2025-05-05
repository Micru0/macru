"use client";

import { v4 as uuidv4 } from 'uuid';
import { type ChatMessageType as ChatMessage } from '@/components/ui/chat-interface';
import { Source, ProcessedResponse } from './response-processor';

interface ApiResponse {
  response: ProcessedResponse;
  proposedAction?: any;
}

interface ChatServiceResponse {
  content: string;
  sources?: Source[];
  proposedAction?: any;
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
    // Type needs to accommodate both text and action responses
    const apiData: any = await response.json(); 

    // **NEW**: Check if an action was proposed
    if (apiData.proposedAction) {
      console.log('[ChatService] Received proposed action:', apiData.proposedAction);
      // The 'response' object in the action case might contain a message *about* the action
      const actionMessage = apiData.response?.text || 'Assistant proposed an action.'; 
      
      // Return a specific structure indicating an action proposal
      // The UI will need to be updated to handle this type
      return {
        content: actionMessage,
        sources: [], // No document sources for action proposals
        proposedAction: apiData.proposedAction, // Include the action details
      };
    }

    // **EXISTING**: Handle regular text response
    const processedResponse = apiData.response; // Standard response object
    if (processedResponse && typeof processedResponse.responseText === 'string') {
      // Return the content and the actual sources from the API
      return {
        content: processedResponse.responseText,
        sources: processedResponse.sources || [], // Ensure sources is always an array
      };
    } 

    // **ERROR**: If neither action nor valid text response is found
    console.error('[ChatService] Invalid response structure from API:', apiData);
    throw new Error('Received invalid response structure from the backend.');

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