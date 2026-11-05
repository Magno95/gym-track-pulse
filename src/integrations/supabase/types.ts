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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      body_weight_history: {
        Row: {
          created_at: string
          effective_date: string
          id: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          effective_date: string
          id?: string
          user_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          effective_date?: string
          id?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
      exercises: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_bodyweight: boolean
          name: string
          personal_records: Json | null
          superset_multiplier: number | null
          unit: string | null
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_bodyweight?: boolean
          name: string
          personal_records?: Json | null
          superset_multiplier?: number | null
          unit?: string | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_bodyweight?: boolean
          name?: string
          personal_records?: Json | null
          superset_multiplier?: number | null
          unit?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          height_cm: number | null
          user_id: string
        }
        Insert: {
          height_cm?: number | null
          user_id: string
        }
        Update: {
          height_cm?: number | null
          user_id?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          created_at: string
          date: string
          exercise_id: string
          id: string
          is_superset_secondary: boolean | null
          reps: number
          series: number
          sets: Json | null
          superset_id: string | null
          value: number
          value_multiplier: number
          weight: number
        }
        Insert: {
          created_at?: string
          date: string
          exercise_id: string
          id?: string
          is_superset_secondary?: boolean | null
          reps: number
          series: number
          sets?: Json | null
          superset_id?: string | null
          value: number
          value_multiplier: number
          weight: number
        }
        Update: {
          created_at?: string
          date?: string
          exercise_id?: string
          id?: string
          is_superset_secondary?: boolean | null
          reps?: number
          series?: number
          sets?: Json | null
          superset_id?: string | null
          value?: number
          value_multiplier?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "sessions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      strava_connections: {
        Row: {
          access_token: string
          athlete_id: number
          expires_at: number
          refresh_token: string
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          athlete_id: number
          expires_at: number
          refresh_token: string
          scope: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          athlete_id?: number
          expires_at?: number
          refresh_token?: string
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strava_imports: {
        Row: {
          activity: Json
          athlete_id: number
          session_date: string
          streams: Json | null
          user_id: string
        }
        Insert: {
          activity: Json
          athlete_id: number
          session_date: string
          streams?: Json | null
          user_id: string
        }
        Update: {
          activity?: Json
          athlete_id?: number
          session_date?: string
          streams?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      strava_locks: {
        Row: {
          expires_at: string
          token: string
          user_id: string
        }
        Insert: {
          expires_at: string
          token: string
          user_id: string
        }
        Update: {
          expires_at?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      strava_oauth_states: {
        Row: {
          expires_at: string
          session_date: string
          state_hash: string
          user_id: string
        }
        Insert: {
          expires_at?: string
          session_date: string
          state_hash: string
          user_id: string
        }
        Update: {
          expires_at?: string
          session_date?: string
          state_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      strava_publications: {
        Row: {
          activity_id: string | null
          athlete_id: number
          error: string | null
          session_date: string
          status: string
          updated_at: string
          upload_id: string | null
          user_id: string
        }
        Insert: {
          activity_id?: string | null
          athlete_id: number
          error?: string | null
          session_date: string
          status: string
          updated_at?: string
          upload_id?: string | null
          user_id: string
        }
        Update: {
          activity_id?: string | null
          athlete_id?: number
          error?: string | null
          session_date?: string
          status?: string
          updated_at?: string
          upload_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_strava_lock: {
        Args: { p_token: string; p_user_id: string }
        Returns: boolean
      }
      get_exercise_overview: {
        Args: { p_user_id: string }
        Returns: {
          exercise: Json
          sessions: Json
        }[]
      }
      valid_personal_records: { Args: { items: Json }; Returns: boolean }
      valid_session_sets: { Args: { items: Json }; Returns: boolean }
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
