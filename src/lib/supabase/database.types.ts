/**
 * ⚠️ 자리 표시자입니다. 아직 마이그레이션이 없어 생성 결과가 없습니다.
 *
 * `supabase-engineer`가 마이그레이션을 올리면 이 파일을 **생성 결과로 통째로 교체**합니다
 * (04_data_layer.md 11절):
 *
 *   supabase gen types typescript --local  > src/lib/supabase/database.types.ts
 *   supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts
 *
 * 규약:
 * - 이 파일은 **DB 그대로 snake_case**입니다. 생성 단계에서 camelCase로 바꾸지 않습니다.
 * - 마이그레이션을 추가할 때마다 재생성하고 **같은 커밋에 포함**합니다.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<
      string,
      {
        Row: Record<string, Json>;
        Insert: Record<string, Json>;
        Update: Record<string, Json>;
        Relationships: [];
      }
    >;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
