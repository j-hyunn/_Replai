import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env.public";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 브라우저 클라이언트 — anon 키 (04_data_layer.md 6.3절).
 *
 * RLS가 적용된 읽기, Realtime 구독, Storage 직업로드에만 씁니다.
 * **AI 프로바이더를 이 경로에서 부르는 코드는 하나도 없습니다** (고정 제약).
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
  );
}
