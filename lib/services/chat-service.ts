"use client";

import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '@/components/ui/chat-interface';

interface LLMResponse {
  content: string;
  sources?: {
    title: string;
    content?: string;
    url?: string;
  }[];
}

/**
 * Sends a query to the LLM API and returns the response
 * In future versions, this will implement the CAG querying system
 * For now, it's a simple call to the LLM API
 */
export async function sendQueryToLLM(
  query: string,
  conversationHistory: ChatMessage[] = []
): Promise<LLMResponse> {
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
      throw new Error(errorData.message || 'Failed to get response from LLM');
    }

    const data = await response.json();
    
    // Mock sources for now - in the real implementation this would come from the CAG system
    const mockSources = query.toLowerCase().includes('document') ? [
      {
        title: 'Sample Document',
        content: 'This is a snippet from the document that contains relevant information.',
      }
    ] : undefined;

    return {
      content: data.response,
      sources: mockSources,
    };
  } catch (error) {
    console.error('Error querying LLM:', error);
    throw new Error('Failed to get a response. Please try again.');
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
  sources?: LLMResponse['sources']
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