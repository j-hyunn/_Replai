import { NextResponse } from "next/server";

import { safeNextPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

/**
 * `GET /auth/callback` — Google OAuth(PKCE) 콜백 (D35-4 · `06_ui_plan.md` 1절).
 *
 * **페이지가 아니라 라우트 핸들러입니다.** `(auth)` 그룹은 페이지용이라 여기에 두지 않습니다.
 *
 * ```
 * Google → Supabase → /auth/callback?code=…&next=/sessions/1
 *                         ↓ exchangeCodeForSession(code)   ← 쿠키에 세션이 실립니다
 *                         → 302 next(검증 통과) 또는 /dashboard
 * ```
 *
 * ## 세 가지 못
 *
 * 1. **`next` 검증은 `safeNextPath()` 한 함수만 씁니다** — `/settings/api-key`의 복귀와 **같은
 *    함수**입니다. 두 벌로 만들면 한쪽만 고쳐져 오픈 리다이렉트가 남습니다.
 * 2. **실패는 전부 `/login?error=oauth_failed`** 입니다. `error_description`을 그대로 붙이지
 *    않습니다 — 프로바이더 문구가 화면에 새고, 그 문구는 한국어도 아닙니다.
 * 3. **성공 후 랜딩은 이메일 로그인과 동일**합니다(`next` 또는 `/dashboard`). 경로를 두 벌로
 *    만들지 않습니다.
 *
 * 쿠키는 `server.ts`(anon + 쿠키) 클라이언트가 씁니다. `admin.ts`를 쓰면 세션이 생기지 않습니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  // 사용자가 Google 동의 화면에서 취소하면 `code` 없이 `error`만 달려 돌아옵니다.
  if (!code) {
    return redirectTo(url, "/login?error=oauth_failed");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // 상세는 서버 로그로만 나갑니다 (계약 13절).
    console.error("[auth/callback] 코드 교환에 실패했습니다", { message: error.message });
    return redirectTo(url, "/login?error=oauth_failed");
  }

  return redirectTo(url, next);
}

/** 상대 경로를 요청 오리진 기준의 절대 URL로 올립니다 — `Location`은 오리진을 요구합니다. */
function redirectTo(base: URL, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, base.origin));
}
