import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env.public";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/lib/supabase/database.types";

/**
 * ⚠️ service_role 클라이언트 — **RLS를 전면 우회합니다** (04_data_layer.md 6.3절).
 *
 * 유출되면 전 사용자 데이터의 읽기·쓰기·삭제가 가능합니다.
 * - `SUPABASE_SERVICE_ROLE_KEY`에 `NEXT_PUBLIC_` 접두사를 붙이는 것은 즉시·영구 유출입니다.
 * - 첫 줄의 `import 'server-only'`는 클라이언트 컴포넌트가 이 모듈을 import하면
 *   **빌드를 실패시킵니다.**
 * - 이 클라이언트를 쓰는 모든 호출 지점에는 **왜 RLS 우회가 필요한지 한 줄 주석**을 남깁니다.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    publicEnv.supabaseUrl,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
