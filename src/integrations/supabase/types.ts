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
            foreignKeyName: "ai_interactions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interactions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interactions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interactions_inbound_message_id_fkey"
            columns: ["inbound_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interactions_outbound_message_id_fkey"
            columns: ["outbound_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
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
            foreignKeyName: "ai_knowledge_items_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_items_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json
          add_tag: string | null
          assign_to_human: boolean
          channel_id: string | null
          company_id: string
          conditions: Json
          created_at: string
          id: string
          is_active: boolean
          keyword: string | null
          name: string
          priority: number
          response: string | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          add_tag?: string | null
          assign_to_human?: boolean
          channel_id?: string | null
          company_id: string
          conditions?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          keyword?: string | null
          name: string
          priority?: number
          response?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          add_tag?: string | null
          assign_to_human?: boolean
          channel_id?: string | null
          company_id?: string
          conditions?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          keyword?: string | null
          name?: string
          priority?: number
          response?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_secrets: {
        Row: {
          access_token: string | null
          access_token_enc: string | null
          app_secret: string | null
          app_secret_enc: string | null
          channel_id: string
          created_at: string
          encryption_version: string | null
          expires_at: string | null
          token_hint: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          access_token_enc?: string | null
          app_secret?: string | null
          app_secret_enc?: string | null
          channel_id: string
          created_at?: string
          encryption_version?: string | null
          expires_at?: string | null
          token_hint?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          access_token_enc?: string | null
          app_secret?: string | null
          app_secret_enc?: string | null
          channel_id?: string
          created_at?: string
          encryption_version?: string | null
          expires_at?: string | null
          token_hint?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_secrets_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "channel_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_secrets_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "channels"
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
          metadata: Json
          name: string
          notes: string | null
          phone: string | null
          potential_value: number | null
          profile_name: string | null
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
          metadata?: Json
          name: string
          notes?: string | null
          phone?: string | null
          potential_value?: number | null
          profile_name?: string | null
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
          metadata?: Json
          name?: string
          notes?: string | null
          phone?: string | null
          potential_value?: number | null
          profile_name?: string | null
          source?: string | null
          updated_at?: string
          wa_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel_public_view"
            referencedColumns: ["id"]
          },
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
      conversation_notes: {
        Row: {
          company_id: string
          conversation_id: string
          created_at: string
          id: string
          note: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          conversation_id: string
          created_at?: string
          id?: string
          note: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          note?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
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
            referencedRelation: "channel_public_view"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "integration_health_checks_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_health_checks_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "channel_public_view"
            referencedColumns: ["id"]
          },
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
      outbound_queue: {
        Row: {
          attempts: number
          channel_id: string
          company_id: string
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          sent_message_id: string | null
          status: string
          to_phone: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          channel_id: string
          company_id: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          sent_message_id?: string | null
          status?: string
          to_phone: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          channel_id?: string
          company_id?: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          sent_message_id?: string | null
          status?: string
          to_phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_queue_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_queue_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_queue_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_queue_sent_message_id_fkey"
            columns: ["sent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
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
      rate_limit_buckets: {
        Row: {
          bucket_key: string
          company_id: string
          count: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          company_id: string
          count?: number
          window_start: string
        }
        Update: {
          bucket_key?: string
          company_id?: string
          count?: number
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_buckets_company_id_fkey"
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
            referencedRelation: "channel_public_view"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "whatsapp_templates_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      channel_public_view: {
        Row: {
          ai_enabled: boolean | null
          app_secret_present: boolean | null
          auto_reply_enabled: boolean | null
          business_hours: string | null
          company_id: string | null
          connected_at: string | null
          created_at: string | null
          greeting_message: string | null
          handoff_when_unknown: boolean | null
          human_handoff_enabled: boolean | null
          id: string | null
          last_error: string | null
          last_error_code: string | null
          last_sync_at: string | null
          name: string | null
          out_of_hours_message: string | null
          phone_number: string | null
          phone_number_id: string | null
          provider: string | null
          quality_rating: string | null
          status: string | null
          type: string | null
          updated_at: string | null
          verified_name: string | null
          verify_token: string | null
          waba_id: string | null
          webhook_url: string | null
        }
        Insert: {
          ai_enabled?: boolean | null
          app_secret_present?: boolean | null
          auto_reply_enabled?: boolean | null
          business_hours?: string | null
          company_id?: string | null
          connected_at?: string | null
          created_at?: string | null
          greeting_message?: string | null
          handoff_when_unknown?: boolean | null
          human_handoff_enabled?: boolean | null
          id?: string | null
          last_error?: string | null
          last_error_code?: string | null
          last_sync_at?: string | null
          name?: string | null
          out_of_hours_message?: string | null
          phone_number?: string | null
          phone_number_id?: string | null
          provider?: string | null
          quality_rating?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
          verified_name?: string | null
          verify_token?: string | null
          waba_id?: string | null
          webhook_url?: string | null
        }
        Update: {
          ai_enabled?: boolean | null
          app_secret_present?: boolean | null
          auto_reply_enabled?: boolean | null
          business_hours?: string | null
          company_id?: string | null
          connected_at?: string | null
          created_at?: string | null
          greeting_message?: string | null
          handoff_when_unknown?: boolean | null
          human_handoff_enabled?: boolean | null
          id?: string | null
          last_error?: string | null
          last_error_code?: string | null
          last_sync_at?: string | null
          name?: string | null
          out_of_hours_message?: string | null
          phone_number?: string | null
          phone_number_id?: string | null
          provider?: string | null
          quality_rating?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
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
    }
    Functions: {
      get_user_company_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      seed_company_defaults: {
        Args: { _company_id: string }
        Returns: undefined
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
