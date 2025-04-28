/**
 * @file Defines the core data structures and types for the memory system.
 */

// Represents the importance or priority of a memory item
export enum MemoryPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

// Represents the type or category of information stored in a memory
export enum MemoryType {
  FACT = 'fact', // Specific piece of information (e.g., user preference)
  CONVERSATION_SUMMARY = 'conversation_summary', // Summary of a past interaction
  USER_GOAL = 'user_goal', // Stated user objective
  ENTITY_INFO = 'entity_info', // Information about a person, place, or thing mentioned
  OTHER = 'other',
}

// Core interface for a single piece of memory stored in the system
export interface MemoryItem {
  id: string; // Unique identifier (UUID)
  user_id: string; // Identifier of the user this memory belongs to
  content: string; // The actual information stored in the memory
  type: MemoryType; // Category of the memory
  priority: MemoryPriority; // Importance level
  source_interaction_id?: string; // Optional ID linking to the conversation/interaction that generated this memory
  relevance_score?: number; // Score indicating how relevant this memory is currently (0-1)
  last_accessed_at?: Date; // Timestamp of the last time this memory was retrieved/used
  metadata?: Record<string, any>; // Flexible field for additional context (e.g., source document, specific entities)
  created_at: Date; // Timestamp when the memory was created
  updated_at: Date; // Timestamp when the memory was last updated
  // Potentially add encrypted_content: string; if implementing field-level encryption
}

// Interface for operations related to memory management
export interface MemoryOperations {
  addMemory(item: Omit<MemoryItem, 'id' | 'created_at' | 'updated_at'>): Promise<MemoryItem>;
  getMemoryById(id: string): Promise<MemoryItem | null>;
  getRelevantMemories(queryContext: string, limit?: number): Promise<MemoryItem[]>;
  updateMemory(id: string, updates: Partial<MemoryItem>): Promise<MemoryItem | null>;
  deleteMemory(id: string): Promise<boolean>;
  // Add other potential operations like search, categorization, etc.
} 