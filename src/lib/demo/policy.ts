import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

import { ApiError } from "@/lib/api/errors";
import { publicEnv } from "@/lib/env.public";
import type { Persona } from "@/lib/session/persona";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 데모 정책 — **숫자와 가드의 단일 사본입니다** (D35 · `01_state_machine.md` 1절).
 *
 * 라우트가 이 값들을 직접 적지 않습니다. 데모 파라미터는 예약량 17의 **근거**이므로
 * (면접관 8 = 최대 6턴 + 재시도 2), 한쪽만 고치면 원장과 실제 호출 수가 어긋납니다.
 */

type Admin = SupabaseClient<Database>;

/**
 * 데모 세션의 고정 파라미터. **전부 기존 CHECK 범위 안이라 DDL 변경이 없습니다.**
 * 방문자가 고르는 것은 **직군과 모달리티뿐**이고 페르소나는 `deep_pressure` 고정입니다 —
 * 제품의 차별점이 꼬리질문이고 심층 압박형이 그것을 가장 선명하게 보여줍니다(D35-3).
 */
export const DEMO_SESSION_PARAMS = {
  persona: "deep_pressure" as Persona,
  mainQuestionBudget: 2,
  maxFollowUpDepth: 2,
  maxTurns: 6,
  maxDurationMin: 12,
} as const;

/** 신규 익명 계정의 쿨다운 (D35-2 장치 ②). 10분 이내에 만들어진 계정의 두 번째 요청을 막습니다. */
export const DEMO_NEW_ACCOUNT_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * 데모가 켜져 있는가. **꺼져 있으면 라우트는 404입니다** — 403이 아닙니다.
 * 403은 "여기 있지만 당신은 안 된다"이고, 꺼진 기능은 **없는 것**이어야 합니다(D35-1).
 */
export function assertDemoEnabled(): void {
  if (!publicEnv.demoEnabled) {
    throw new ApiError("not_found", "요청하신 경로를 찾을 수 없습니다.");
  }
}

/**
 * 호출자가 **익명(데모) 계정인가**를 `profiles.account_type`으로 판정합니다.
 *
 * `auth.users.is_anonymous`를 매번 조인해 읽지 않는 이유는 D35-2 그대로입니다 —
 * 게이트·프록시·라우트가 전부 `public` 스키마만 읽게 하려는 것입니다.
 * 프로필 행이 없으면(가입 트리거 직후의 경합) **실계정으로 봅니다** — 모르는 쪽으로
 * 판정해서 익명 권한을 주는 것이 더 나쁩니다.
 */
export async function loadAccountType(
  userId: string,
  admin: Admin,
): Promise<"registered" | "demo"> {
  const { data, error } = await admin
    .from("profiles")
    .select("account_type")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
  }

  return data?.account_type === "demo" ? "demo" : "registered";
}

/**
 * 익명 계정이 실계정용 라우트에 들어오는 것을 막습니다 (D35-2).
 *
 * **이 가드가 없으면 익명 사용자가 `POST /api/sessions`로 `trial_shared` 세션을 만들어
 * 하루 12세션의 체험 정원을 먹습니다.** 프록시에도 같은 가드가 있지만 그것은 첫 겹이고,
 * DB 트리거(`account_funding_mismatch`)가 마지막 겹입니다.
 */
export async function assertNotDemoAccount(user: User, admin: Admin): Promise<void> {
  if ((await loadAccountType(user.id, admin)) !== "demo") return;

  throw new ApiError("forbidden", "데모 체험 중에는 사용할 수 없는 기능입니다.", {
    details: { reason: "demo_account" },
  });
}
