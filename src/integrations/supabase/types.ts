export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_agent_settings: {
        Row: {
          agent_name: string
          company_id: string
          created_at: string
          handoff_keywords: string[]
          id: string
          is_enabled: boolean
          max_tokens: number
          model: string
          system_prompt: string
          temperature: number
          updated_at: string
        }
        Insert: {
          agent_name?: string
          company_id: string
          created_at?: string
          handoff_keywords?: string[]
          id?: string
          is_enabled?: boolean
          max_tokens?: number
          model?: string
          system_prompt?: string
          temperature?: number
          updated_at?: string
        }
        Update: {
          agent_name?: string
          company_id?: string
          created_at?: string
          handoff_keywords?: string[]
          id?: string
          is_enabled?: boolean
          max_tokens?: number
          model?: string
          system_prompt?: string
          temperature?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_items: {
        Row: {
          channel_id: string | null
          company_id: string
          content: string
          created_at: string
          id: string
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          company_id: string
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_interactions: {
        Row: {
          channel_id: string | null
          company_id: string
          completion_tokens: number | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          inbound_message_id: string | null
          input: string | null
          model: string | null
          outbound_message_id: string | null
          output: string | null
          prompt_tokens: number | null
          status: string
        }
        Insert: {
          channel_id?: string | null
          company_id: string
          completion_tokens?: number | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          inbound_message_id?: string | null
          input?: string | null
          model?: string | null
          outbound_message_id?: string | null
          output?: string | null
          prompt_tokens?: number | null
          status?: string
        }
        Update: {
          channel_id?: string | null
          company_id?: string
          completion_tokens?: number | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          inbound_message_id?: string | null
          input?: string | null
          model?: string | null
          outbound_message_id?: string | null
          output?: string | null
          prompt_tokens?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_interactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          access_token: string | null
          ai_enabled: boolean
          app_id: string | null
          app_secret_present: boolean
          auto_reply_enabled: boolean
          bridge_url: string | null
          business_hours: string | null
          company_id: string
          connected_at: string | null
          created_at: string
          created_by: string | null
          greeting_message: string | null
          handoff_when_unknown: boolean
          human_handoff_enabled: boolean
          id: string
          last_error: string | null
          last_error_code: string | null
          last_sync_at: string | null
          name: string
          out_of_hours_message: string | null
          phone_number: string | null
          phone_number_id: string | null
          provider: string
          quality_rating: string | null
          status: string
          type: string
          updated_at: string
          verified_name: string | null
          verify_token: string | null
          waba_id: string | null
          webhook_url: string | null
        }
        Insert: {
          access_token?: string | null
          ai_enabled?: boolean
          app_id?: string | null
          app_secret_present?: boolean
          auto_reply_enabled?: boolean
          bridge_url?: string | null
          business_hours?: string | null
          company_id: string
          connected_at?: string | null
          created_at?: string
          created_by?: string | null
          greeting_message?: string | null
          handoff_when_unknown?: boolean
          human_handoff_enabled?: boolean
          id?: string
          last_error?: string | null
          last_error_code?: string | null
          last_sync_at?: string | null
          name: string
          out_of_hours_message?: string | null
          phone_number?: string | null
          phone_number_id?: string | null
          provider?: string
          quality_rating?: string | null
          status?: string
          type?: string
          updated_at?: string
          verified_name?: string | null
          verify_token?: string | null
          waba_id?: string | null
          webhook_url?: string | null
        }
        Update: {
          access_token?: string | null
          ai_enabled?: boolean
          app_id?: string | null
          app_secret_present?: boolean
          auto_reply_enabled?: boolean
          bridge_url?: string | null
          business_hours?: string | null
          company_id?: string
          connected_at?: string | null
          created_at?: string
          created_by?: string | null
          greeting_message?: string | null
          handoff_when_unknown?: boolean
          human_handoff_enabled?: boolean
          id?: string
          last_error?: string | null
          last_error_code?: string | null
          last_sync_at?: string | null
          name?: string
          out_of_hours_message?: string | null
          phone_number?: string | null
          phone_number_id?: string | null
          provider?: string
          quality_rating?: string | null
          status?: string
          type?: string
          updated_at?: string
          verified_name?: string | null
          verify_token?: string | null
          waba_id?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          business_hours: string | null
          communication_tone: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string
          phone: string | null
          plan: string
          segment: string | null
          services_description: string | null
          updated_at: string
        }
        Insert: {
          business_hours?: string | null
          communication_tone?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_id: string
          phone?: string | null
          plan?: string
          segment?: string | null
          services_description?: string | null
          updated_at?: string
        }
        Update: {
          business_hours?: string | null
          communication_tone?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string
          phone?: string | null
          plan?: string
          segment?: string | null
          services_description?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contact_tags: {
        Row: {
          contact_id: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          channel_id: string | null
          company_id: string
          created_at: string
          email: string | null
          funnel_stage: string | null
          id: string
          last_interaction_at: string | null
          name: string
          notes: string | null
          phone: string | null
          potential_value: number | null
          source: string | null
          updated_at: string
          wa_id: string | null
        }
        Insert: {
          channel_id?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          funnel_stage?: string | null
          id?: string
          last_interaction_at?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          potential_value?: number | null
          source?: string | null
          updated_at?: string
          wa_id?: string | null
        }
        Update: {
          channel_id?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          funnel_stage?: string | null
          id?: string
          last_interaction_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          potential_value?: number | null
          source?: string | null
          updated_at?: string
          wa_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_handling: boolean
          ai_last_replied_at: string | null
          assigned_to: string | null
          channel: string
          channel_id: string | null
          company_id: string
          contact_id: string
          created_at: string
          handoff_reason: string | null
          id: string
          last_message: string | null
          last_message_at: string | null
          last_message_direction: string | null
          status: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          ai_handling?: boolean
          ai_last_replied_at?: string | null
          assigned_to?: string | null
          channel?: string
          channel_id?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          handoff_reason?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          last_message_direction?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          ai_handling?: boolean
          ai_last_replied_at?: string | null
          assigned_to?: string | null
          channel?: string
          channel_id?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          handoff_reason?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          last_message_direction?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_health_checks: {
        Row: {
          channel_id: string | null
          check_type: string
          company_id: string | null
          created_at: string
          error_message: string | null
          id: string
          latency_ms: number | null
          payload: Json
          status: string
        }
        Insert: {
          channel_id?: string | null
          check_type: string
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          payload?: Json
          status: string
        }
        Update: {
          channel_id?: string | null
          check_type?: string
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          payload?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_health_checks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          ai_confidence: number | null
          ai_generated: boolean
          channel_id: string | null
          company_id: string | null
          contact_id: string | null
          content: string
          conversation_id: string
          created_at: string
          delivered_at: string | null
          direction: string | null
          error_message: string | null
          id: string
          message_type: string | null
          meta_message_id: string | null
          raw_payload: Json | null
          read_at: string | null
          sender_type: string
          status: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_generated?: boolean
          channel_id?: string | null
          company_id?: string | null
          contact_id?: string | null
          content: string
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          direction?: string | null
          error_message?: string | null
          id?: string
          message_type?: string | null
          meta_message_id?: string | null
          raw_payload?: Json | null
          read_at?: string | null
          sender_type?: string
          status?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_generated?: boolean
          channel_id?: string | null
          company_id?: string | null
          contact_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: string | null
          error_message?: string | null
          id?: string
          message_type?: string | null
          meta_message_id?: string | null
          raw_payload?: Json | null
          read_at?: string | null
          sender_type?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          category: string | null
          company_id: string
          created_at: string
          id: string
          message: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          company_id: string
          created_at?: string
          id?: string
          message: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          company_id?: string
          created_at?: string
          id?: string
          message?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          category: string | null
          channel_id: string | null
          company_id: string
          components: Json
          created_at: string
          id: string
          language: string
          last_synced_at: string | null
          meta_template_id: string | null
          name: string
          raw_payload: Json
          status: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          channel_id?: string | null
          company_id: string
          components?: Json
          created_at?: string
          id?: string
          language?: string
          last_synced_at?: string | null
          meta_template_id?: string | null
          name: string
          raw_payload?: Json
          status?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          channel_id?: string | null
          company_id?: string
          components?: Json
          created_at?: string
          id?: string
          language?: string
          last_synced_at?: string | null
          meta_template_id?: string | null
          name?: string
          raw_payload?: Json
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          channel_id: string | null
          company_id: string | null
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json | null
          processed_at: string | null
          source: string
          status: string
        }
        Insert: {
          channel_id?: string | null
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          source?: string
          status?: string
        }
        Update: {
          channel_id?: string | null
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_company_overview: {
        Args: never
        Returns: {
          id: string
          name: string
          segment: string | null
          plan: string
          is_active: boolean
          contact_name: string | null
          phone: string | null
          email: string | null
          created_at: string
          whatsapp_status: string | null
          whatsapp_phone: string | null
          ai_enabled: boolean
          has_prompt: boolean
          knowledge_count: number
          appointments_count: number
          contacts_count: number
          conversations_count: number
        }[]
      }
      admin_create_company: {
        Args: {
          _name: string
          _segment?: string | null
          _phone?: string | null
          _email?: string | null
          _contact_name?: string | null
          _plan?: string | null
        }
        Returns: string
      }
      admin_enter_company: {
        Args: { _company_id: string }
        Returns: undefined
      }
      get_user_company_id: { Args: never; Returns: string }
      is_super_admin: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "agent"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "agent"],
    },
  },
} as const
