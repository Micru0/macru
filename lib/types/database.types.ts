export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      action_logs: {
        Row: {
          action_type: string
          error: string | null
          id: string
          ip_address: string | null
          message: string | null
          params_snapshot: Json
          success: boolean
          timestamp: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          error?: string | null
          id?: string
          ip_address?: string | null
          message?: string | null
          params_snapshot: Json
          success: boolean
          timestamp?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          error?: string | null
          id?: string
          ip_address?: string | null
          message?: string | null
          params_snapshot?: Json
          success?: boolean
          timestamp?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string | null
          document_id: string
          id: string
          metadata: Json | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string | null
          document_id: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string | null
          document_id?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_tokens: {
        Row: {
          access_token: string
          account_identifier: string | null
          connector_type: string
          created_at: string
          expires_at: string | null
          expiry_date: string | null
          id: string
          raw_response: Json | null
          refresh_token: string | null
          scopes: string[] | null
          updated_at: string
          user_id: string
          workspace_icon: string | null
        }
        Insert: {
          access_token: string
          account_identifier?: string | null
          connector_type: string
          created_at?: string
          expires_at?: string | null
          expiry_date?: string | null
          id?: string
          raw_response?: Json | null
          refresh_token?: string | null
          scopes?: string[] | null
          updated_at?: string
          user_id: string
          workspace_icon?: string | null
        }
        Update: {
          access_token?: string
          account_identifier?: string | null
          connector_type?: string
          created_at?: string
          expires_at?: string | null
          expiry_date?: string | null
          id?: string
          raw_response?: Json | null
          refresh_token?: string | null
          scopes?: string[] | null
          updated_at?: string
          user_id?: string
          workspace_icon?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          content_status: string | null
          created_at: string | null
          due_date: string | null
          error_message: string | null
          event_end_time: string | null
          event_start_time: string | null
          file_path: string | null
          file_type: string | null
          id: string
          location: string | null
          metadata: Json | null
          participants: string[] | null
          priority: string | null
          source_created_at: string | null
          source_id: string | null
          source_type: string | null
          source_updated_at: string | null
          status: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content_status?: string | null
          created_at?: string | null
          due_date?: string | null
          error_message?: string | null
          event_end_time?: string | null
          event_start_time?: string | null
          file_path?: string | null
          file_type?: string | null
          id?: string
          location?: string | null
          metadata?: Json | null
          participants?: string[] | null
          priority?: string | null
          source_created_at?: string | null
          source_id?: string | null
          source_type?: string | null
          source_updated_at?: string | null
          status?: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content_status?: string | null
          created_at?: string | null
          due_date?: string | null
          error_message?: string | null
          event_end_time?: string | null
          event_start_time?: string | null
          file_path?: string | null
          file_type?: string | null
          id?: string
          location?: string | null
          metadata?: Json | null
          participants?: string[] | null
          priority?: string | null
          source_created_at?: string | null
          source_id?: string | null
          source_type?: string | null
          source_updated_at?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      embeddings: {
        Row: {
          chunk_id: string
          created_at: string | null
          embedding: string | null
          id: string
          model: string
        }
        Insert: {
          chunk_id: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          model: string
        }
        Update: {
          chunk_id?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          model?: string
        }
        Relationships: [
          {
            foreignKeyName: "embeddings_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string | null
          description: string | null
          file_path: string
          file_size: number
          file_type: string
          filename: string
          id: string
          metadata: Json | null
          tags: string[] | null
          updated_at: string | null
          upload_date: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          file_path: string
          file_size: number
          file_type: string
          filename: string
          id?: string
          metadata?: Json | null
          tags?: string[] | null
          updated_at?: string | null
          upload_date?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          file_path?: string
          file_size?: number
          file_type?: string
          filename?: string
          id?: string
          metadata?: Json | null
          tags?: string[] | null
          updated_at?: string | null
          upload_date?: string | null
          user_id?: string
        }
        Relationships: []
      }
      memory_items: {
        Row: {
          content: string
          created_at: string
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          priority: Database["public"]["Enums"]["memory_priority"]
          relevance_score: number | null
          source_interaction_id: string | null
          type: Database["public"]["Enums"]["memory_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          priority?: Database["public"]["Enums"]["memory_priority"]
          relevance_score?: number | null
          source_interaction_id?: string | null
          type?: Database["public"]["Enums"]["memory_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          priority?: Database["public"]["Enums"]["memory_priority"]
          relevance_score?: number | null
          source_interaction_id?: string | null
          type?: Database["public"]["Enums"]["memory_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          action_confirmation_level: string
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          updated_at: string | null
          username: string | null
          website: string | null
        }
        Insert: {
          action_confirmation_level?: string
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          updated_at?: string | null
          username?: string | null
          website?: string | null
        }
        Update: {
          action_confirmation_level?: string
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string | null
          username?: string | null
          website?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: string
      }
      match_documents: {
        Args: {
          query_embedding: string
          match_threshold?: number
          match_count?: number
          filter_user_id?: string
          filter_source_types?: string[]
          filter_event_start_time_before?: string
          filter_event_start_time_after?: string
          filter_event_end_time_before?: string
          filter_event_end_time_after?: string
          filter_due_date_before?: string
          filter_due_date_after?: string
          filter_content_status?: string
          filter_priority?: string
          filter_location?: string
          filter_participants?: string[]
        }
        Returns: {
          id: string
          content: string
          chunk_index: number
          document_id: string
          metadata: Json
          created_at: string
          similarity: number
          document_title: string
          document_type: string
          event_start_time: string
          event_end_time: string
          due_date: string
          content_status: string
          priority: string
          location: string
          participants: string[]
        }[]
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
    }
    Enums: {
      memory_priority: "low" | "medium" | "high"
      memory_type:
        | "fact"
        | "conversation_summary"
        | "user_goal"
        | "entity_info"
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      memory_priority: ["low", "medium", "high"],
      memory_type: [
        "fact",
        "conversation_summary",
        "user_goal",
        "entity_info",
        "other",
      ],
    },
  },
} as const
