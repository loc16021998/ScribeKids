/**
 * Kiểu dữ liệu khớp với supabase/migrations/20261104000000_init_schema.sql.
 * Khi schema thay đổi, sinh lại tự động bằng:
 *   npx supabase gen types typescript --project-id <PROJECT_ID> > lib/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "parent" | "student";
export type GuardianRole = "parent" | "teacher";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: UserRole;
          full_name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          full_name?: string | null;
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      students: {
        Row: {
          id: string;
          name: string;
          age: number;
          avatar: string | null;
          owner_id: string;
          profile_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          age: number;
          avatar?: string | null;
          owner_id?: string;
        };
        Update: {
          name?: string;
          age?: number;
          avatar?: string | null;
          /** Chỉ admin đổi được (trigger protect_student_links chặn người khác). */
          owner_id?: string;
        };
        Relationships: [];
      };
      student_guardians: {
        Row: {
          student_id: string;
          profile_id: string;
          role: GuardianRole;
          created_at: string;
        };
        Insert: {
          student_id: string;
          profile_id: string;
          role: GuardianRole;
        };
        Update: never;
        Relationships: [];
      };
      submissions: {
        Row: {
          id: string;
          student_id: string;
          image_url: string;
          score: number | null;
          feedback_json: Json | null;
          submitted_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          image_url: string;
          submitted_by?: string | null;
          /** Chỉ backend (service_role) được ghi */
          score?: number | null;
          /** Chỉ backend (service_role) được ghi */
          feedback_json?: Json | null;
        };
        Update: {
          score?: number | null;
          feedback_json?: Json | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      can_manage_student: { Args: { sid: string }; Returns: boolean };
      can_view_student: { Args: { sid: string }; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      /** null = không giới hạn (admin). */
      submissions_left_today: { Args: { sid: string }; Returns: number | null };
    };
    Enums: {
      user_role: UserRole;
      guardian_role: GuardianRole;
    };
    CompositeTypes: Record<string, never>;
  };
};

type PublicTables = Database["public"]["Tables"];
export type Tables<T extends keyof PublicTables> = PublicTables[T]["Row"];
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]["Insert"];

export type Profile = Tables<"profiles">;
export type Student = Tables<"students">;
export type Submission = Tables<"submissions">;
