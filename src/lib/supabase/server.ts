import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env.public";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 서버 컴포넌트·라우트 핸들러용 클라이언트 — anon 키 + 쿠키 세션 (04_data_layer.md 6.3절).
 *
 * 사용자 문맥을 유지하므로 **RLS가 그대로 적용됩니다.**
 * 서버가 쿠키를 갱신하지 않으면 "로그인했는데 로그아웃됨" 버그가 납니다.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // 서버 컴포넌트에서 호출된 경우 쿠키를 쓸 수 없습니다.
            // 세션 갱신은 proxy.ts가 담당하므로 여기서는 무시해도 안전합니다.
          }
        },
      },
    },
  );
}
