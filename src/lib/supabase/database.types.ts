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
      account_events: {
        Row: {
          detail: Json | null
          event_name: string
          id: string
          occurred_at: string
          user_id: string
        }
        Insert: {
          detail?: Json | null
          event_name: string
          id?: string
          occurred_at?: string
          user_id: string
        }
        Update: {
          detail?: Json | null
          event_name?: string
          id?: string
          occurred_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_quota_ledger: {
        Row: {
          created_at: string
          denied_count: number
          granted_total: number
          held_calls: number
          limit_calls: number
          model_bucket: string
          quota_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          denied_count?: number
          granted_total?: number
          held_calls?: number
          limit_calls: number
          model_bucket: string
          quota_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          denied_count?: number
          granted_total?: number
          held_calls?: number
          limit_calls?: number
          model_bucket?: string
          quota_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_quota_reservations: {
        Row: {
          consumed_calls: number
          created_at: string
          id: string
          model_bucket: string
          quota_date: string
          released_calls: number
          reserved_calls: number
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          consumed_calls?: number
          created_at?: string
          id?: string
          model_bucket: string
          quota_date: string
          released_calls?: number
          reserved_calls?: number
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          consumed_calls?: number
          created_at?: string
          id?: string
          model_bucket?: string
          quota_date?: string
          released_calls?: number
          reserved_calls?: number
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_quota_reservations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          byte_size: number | null
          created_at: string
          doc_type: string
          extracted_text: string | null
          extraction_error: string | null
          extraction_status: string
          id: string
          is_edited_by_user: boolean
          mime_type: string | null
          source_type: string
          storage_path: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          byte_size?: number | null
          created_at?: string
          doc_type: string
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: string
          id?: string
          is_edited_by_user?: boolean
          mime_type?: string | null
          source_type: string
          storage_path?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          byte_size?: number | null
          created_at?: string
          doc_type?: string
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: string
          id?: string
          is_edited_by_user?: boolean
          mime_type?: string | null
          source_type?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_citations: {
        Row: {
          citation_index: number
          comment: string | null
          id: string
          quote_end: number
          quote_start: number
          quote_text: string
          score_id: string
          session_id: string
          turn_id: string
        }
        Insert: {
          citation_index?: number
          comment?: string | null
          id?: string
          quote_end: number
          quote_start: number
          quote_text: string
          score_id: string
          session_id: string
          turn_id: string
        }
        Update: {
          citation_index?: number
          comment?: string | null
          id?: string
          quote_end?: number
          quote_start?: number
          quote_text?: string
          score_id?: string
          session_id?: string
          turn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_citations_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "evaluation_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_citations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_citations_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "turns"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_scores: {
        Row: {
          axis: string
          evaluation_id: string
          id: string
          improvement: string | null
          is_insufficient_evidence: boolean
          rationale: string
          score: number | null
          session_id: string
          weight: number
        }
        Insert: {
          axis: string
          evaluation_id: string
          id?: string
          improvement?: string | null
          is_insufficient_evidence?: boolean
          rationale: string
          score?: number | null
          session_id: string
          weight: number
        }
        Update: {
          axis?: string
          evaluation_id?: string
          id?: string
          improvement?: string | null
          is_insufficient_evidence?: boolean
          rationale?: string
          score?: number | null
          session_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_scores_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_scores_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          ai_contract_version: string | null
          attempt_count: number
          coach_payload: Json | null
          error_message: string | null
          finished_at: string | null
          id: string
          improvements: Json | null
          model_name: string | null
          overall_score: number | null
          provider: string | null
          rubric_version: string
          session_id: string
          started_at: string
          status: string
          summary: string | null
        }
        Insert: {
          ai_contract_version?: string | null
          attempt_count?: number
          coach_payload?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          improvements?: Json | null
          model_name?: string | null
          overall_score?: number | null
          provider?: string | null
          rubric_version?: string
          session_id: string
          started_at?: string
          status?: string
          summary?: string | null
        }
        Update: {
          ai_contract_version?: string | null
          attempt_count?: number
          coach_payload?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          improvements?: Json | null
          model_name?: string | null
          overall_score?: number | null
          provider?: string | null
          rubric_version?: string
          session_id?: string
          started_at?: string
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_sessions: {
        Row: {
          context_summary: string | null
          created_at: string
          current_modality: string
          ended_at: string | null
          failure_reason: string | null
          funding_source: string
          id: string
          jd_document_id: string | null
          jd_text_snapshot: string | null
          job_role: string | null
          main_question_budget: number
          max_duration_min: number
          max_follow_up_depth: number
          max_turns: number
          modality: string
          pause_reason: string | null
          paused_at: string | null
          persona: string | null
          report_first_viewed_at: string | null
          resumable_after: string | null
          resume_document_id: string | null
          resume_text_snapshot: string | null
          source_session_id: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context_summary?: string | null
          created_at?: string
          current_modality?: string
          ended_at?: string | null
          failure_reason?: string | null
          funding_source: string
          id?: string
          jd_document_id?: string | null
          jd_text_snapshot?: string | null
          job_role?: string | null
          main_question_budget?: number
          max_duration_min?: number
          max_follow_up_depth?: number
          max_turns?: number
          modality?: string
          pause_reason?: string | null
          paused_at?: string | null
          persona?: string | null
          report_first_viewed_at?: string | null
          resumable_after?: string | null
          resume_document_id?: string | null
          resume_text_snapshot?: string | null
          source_session_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context_summary?: string | null
          created_at?: string
          current_modality?: string
          ended_at?: string | null
          failure_reason?: string | null
          funding_source?: string
          id?: string
          jd_document_id?: string | null
          jd_text_snapshot?: string | null
          job_role?: string | null
          main_question_budget?: number
          max_duration_min?: number
          max_follow_up_depth?: number
          max_turns?: number
          modality?: string
          pause_reason?: string | null
          paused_at?: string | null
          persona?: string | null
          report_first_viewed_at?: string | null
          resumable_after?: string | null
          resume_document_id?: string | null
          resume_text_snapshot?: string | null
          source_session_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_sessions_jd_document_id_fkey"
            columns: ["jd_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_sessions_resume_document_id_fkey"
            columns: ["resume_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_sessions_source_session_id_fkey"
            columns: ["source_session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_job_role: string | null
          display_name: string | null
          id: string
          trial_consumed_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_job_role?: string | null
          display_name?: string | null
          id: string
          trial_consumed_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_job_role?: string | null
          display_name?: string | null
          id?: string
          trial_consumed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          archetype_id: string | null
          asked_at: string | null
          created_at: string
          depth: number
          id: string
          order_index: number
          parent_question_id: string | null
          probe_hints: Json | null
          question_kind: string
          question_text: string
          seed_version: string | null
          session_id: string
          source_span: string | null
          target_axis: string | null
        }
        Insert: {
          archetype_id?: string | null
          asked_at?: string | null
          created_at?: string
          depth?: number
          id?: string
          order_index: number
          parent_question_id?: string | null
          probe_hints?: Json | null
          question_kind: string
          question_text: string
          seed_version?: string | null
          session_id: string
          source_span?: string | null
          target_axis?: string | null
        }
        Update: {
          archetype_id?: string | null
          asked_at?: string | null
          created_at?: string
          depth?: number
          id?: string
          order_index?: number
          parent_question_id?: string | null
          probe_hints?: Json | null
          question_kind?: string
          question_text?: string
          seed_version?: string | null
          session_id?: string
          source_span?: string | null
          target_axis?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_parent_question_id_fkey"
            columns: ["parent_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      report_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          is_helpful: boolean
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          is_helpful: boolean
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          is_helpful?: boolean
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      score_disputes: {
        Row: {
          citation_id: string | null
          comment: string | null
          created_at: string
          id: string
          reason_code: string
          score_id: string
          session_id: string
          user_id: string
        }
        Insert: {
          citation_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          reason_code: string
          score_id: string
          session_id: string
          user_id: string
        }
        Update: {
          citation_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          reason_code?: string
          score_id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_disputes_citation_id_fkey"
            columns: ["citation_id"]
            isOneToOne: false
            referencedRelation: "evaluation_citations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_disputes_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "evaluation_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_disputes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_disputes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_events: {
        Row: {
          detail: Json | null
          event_name: string
          from_status: string | null
          id: string
          occurred_at: string
          session_id: string
          to_status: string
          trigger: string
        }
        Insert: {
          detail?: Json | null
          event_name: string
          from_status?: string | null
          id?: string
          occurred_at?: string
          session_id: string
          to_status: string
          trigger: string
        }
        Update: {
          detail?: Json | null
          event_name?: string
          from_status?: string | null
          id?: string
          occurred_at?: string
          session_id?: string
          to_status?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_cleanup_queue: {
        Row: {
          attempt_count: number
          bucket_id: string
          enqueued_at: string
          id: string
          last_error: string | null
          owner_user_id: string | null
          processed_at: string | null
          status: string
          storage_path: string
        }
        Insert: {
          attempt_count?: number
          bucket_id?: string
          enqueued_at?: string
          id?: string
          last_error?: string | null
          owner_user_id?: string | null
          processed_at?: string | null
          status?: string
          storage_path: string
        }
        Update: {
          attempt_count?: number
          bucket_id?: string
          enqueued_at?: string
          id?: string
          last_error?: string | null
          owner_user_id?: string | null
          processed_at?: string | null
          status?: string
          storage_path?: string
        }
        Relationships: []
      }
      trial_consents: {
        Row: {
          consent_text_sha256: string
          consent_version: string
          granted_at: string
          id: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          consent_text_sha256: string
          consent_version: string
          granted_at?: string
          id?: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          consent_text_sha256?: string
          consent_version?: string
          granted_at?: string
          id?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_consents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      turns: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          is_corrected: boolean
          modality: string
          question_id: string | null
          role: string
          seq: number
          session_id: string
          started_at: string | null
          stt_confidence: number | null
          transcript_raw: string | null
          transcript_text: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          is_corrected?: boolean
          modality: string
          question_id?: string | null
          role: string
          seq: number
          session_id: string
          started_at?: string | null
          stt_confidence?: number | null
          transcript_raw?: string | null
          transcript_text: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          is_corrected?: boolean
          modality?: string
          question_id?: string | null
          role?: string
          seq?: number
          session_id?: string
          started_at?: string | null
          stt_confidence?: number | null
          transcript_raw?: string | null
          transcript_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "turns_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_api_keys: {
        Row: {
          created_at: string
          key_last4: string
          last_failure_at: string | null
          last_failure_code: string | null
          last_verified_at: string | null
          provider: string
          status: string
          updated_at: string
          user_id: string
          vault_secret_id: string
        }
        Insert: {
          created_at?: string
          key_last4: string
          last_failure_at?: string | null
          last_failure_code?: string | null
          last_verified_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
          user_id: string
          vault_secret_id: string
        }
        Update: {
          created_at?: string
          key_last4?: string
          last_failure_at?: string | null
          last_failure_code?: string | null
          last_verified_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
          user_id?: string
          vault_secret_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_session_quota: {
        Args: { p_bucket: string; p_n?: number; p_session_id: string }
        Returns: number
      }
      get_user_api_key: { Args: { p_user_id: string }; Returns: string }
      release_session_quota: {
        Args: { p_buckets?: string[]; p_reason?: string; p_session_id: string }
        Returns: {
          model_bucket: string
          released: number
        }[]
      }
      reserve_session_quota: {
        Args: {
          p_limits: Json
          p_quota_date: string
          p_request: Json
          p_session_id: string
        }
        Returns: {
          granted: number
          held_after: number
          limit_calls: number
          model_bucket: string
        }[]
      }
      set_user_api_key: {
        Args: { p_key: string; p_last4: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
