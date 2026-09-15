import { safeNextPath } from "@/lib/auth/next-path";
import { publicEnv } from "@/lib/env.public";
import { createClient } from "@/lib/supabase/client";

/**
 * 브라우저에서 부르는 로그인 진입점 2종 (D35-2 · D35-4).
 *
 * **서버 라우트를 하나도 만들지 않습니다.** Supabase Auth는 브라우저 클라이언트가 직접 부르는
 * 것이 정상 경로이고, 그래야 PKCE verifier가 같은 브라우저에 저장됩니다. 서버 액션으로 감싸면
 * verifier가 서버에 남아 `/auth/callback`의 코드 교환이 실패합니다.
 *
 * 쓰는 쪽(`shadcn-ui-engineer`)이 볼 것:
 * - 두 함수 모두 **클라이언트 컴포넌트에서만** 부릅니다.
 * - `signInWithGoogle()`은 **반환되지 않습니다** — 브라우저가 Google로 떠납니다.
 *   실패했을 때만 `{ error }`를 들고 돌아옵니다.
 * - `signInAnonymouslyForDemo()`는 `POST /api/demo/sessions`를 부르기 **직전에** 한 번 부릅니다.
 *   이미 익명 세션 쿠키가 살아 있으면 **같은 계정으로 재사용**되며(D35-2), 그것이 재입장 시
 *   자기 리포트를 다시 볼 수 있게 하는 장치입니다.
 */

export type SignInFailure = { error: string };

/**
 * Google OAuth 시작. `next`는 로그인 뒤 돌아갈 **내부 경로**이며 여기서 한 번,
 * `/auth/callback`에서 다시 한 번 검증됩니다(같은 함수).
 */
export async function signInWithGoogle(next?: string | null): Promise<SignInFailure | void> {
  const supabase = createClient();
  const callback = new URL("/auth/callback", publicEnv.siteUrl);
  if (next) callback.searchParams.set("next", safeNextPath(next));

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString() },
  });

  if (error) return { error: "로그인을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
}

/**
 * 데모용 익명 로그인. **`auth.users`에 `is_anonymous = true`인 진짜 행이 생기고 `auth.uid()`가
 * 발급되므로 기존 RLS 정책이 한 줄도 바뀌지 않은 채 그대로 적용됩니다**(D35-2).
 *
 * 프로바이더 대시보드에서 익명 로그인이 꺼져 있으면 여기서 실패합니다 — 그 설정은
 * 이 코드 범위 밖이며(`04_data_layer.md` 15.10절), 켜지 않으면 데모 진입 자체가 불가능합니다.
 */
export async function signInAnonymouslyForDemo(): Promise<SignInFailure | void> {
  const supabase = createClient();

  const { data } = await supabase.auth.getSession();
  // 쿠키가 살아 있으면 새 계정을 만들지 않습니다 — 새로 만들면 방금 받은 리포트를 잃습니다.
  if (data.session) return;

  const { error } = await supabase.auth.signInAnonymously();
  if (error) return { error: "지금은 데모를 시작할 수 없습니다. 잠시 뒤 다시 시도해 주세요." };
}
