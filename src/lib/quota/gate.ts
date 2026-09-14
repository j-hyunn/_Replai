import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { MODEL_BUCKETS, type ModelBucket } from "@/lib/ai/roles";
import { ApiError } from "@/lib/api/errors";
import type { FundingSource } from "@/lib/session/status";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import {
  bucketRequest,
  effectiveLimits,
  isGateInert,
  sessionRequest,
  type BucketMap,
} from "@/lib/quota/limits";
import { currentQuotaDate, nextQuotaResetAt, secondsUntilQuotaReset } from "@/lib/quota/quota-date";

/**
 * 예약 게이트 — **`ai_quota_ledger`·`ai_quota_reservations`를 만지는 유일한 모듈**입니다
 * (05_api_contract.md 4.7절 · 02_ai_architecture.md 8.3절). 라우트는 여기만 부릅니다.
 *
 * ## 재원 분기는 이 네 함수의 진입부 한 곳에만 있습니다 (D28)
 *
 * `peekCapacity` · `reserveSessionQuota` · `consumeSessionQuota` · `releaseSessionQuota`
 * **네 함수 전부 진입부 첫 줄이 같습니다**:
 *
 * ```ts
 * if (fundingSource !== "trial_shared") return NO_OP;
 * ```
 *
 * 분기를 라우트마다 흩으면 한 군데를 빠뜨리는 순간 BYOK 세션이 공용 원장을 갉아먹고,
 * 증상이 "체험 정원이 왜인지 부족하다"로만 보여 원인을 찾을 수 없습니다.
 * DB 함수도 같은 가드를 갖고 있지만(`reserve`는 예외, `consume`은 조용히 0),
 * **그것은 마지막 방어선이지 유일한 방어선이 아닙니다.**
 *
 * ## RLS 우회가 필요한 이유
 *
 * 두 원장 테이블은 **RLS를 켜고 정책이 0개**이고 함수 4종은 `service_role`에만 실행 권한이
 * 있습니다(04_data_layer.md 3.13·3.14절). 사용자 문맥 클라이언트로는 한 줄도 읽거나 쓸 수
 * 없으므로 이 모듈만 `service_role`을 씁니다.
 */

type Admin = SupabaseClient<Database>;

/** 게이트가 적용되지 않은 결과에는 전부 `applicable: false`가 붙습니다. */
type NotApplicable = { applicable: false };

export type PeekCapacityResult =
  | (NotApplicable & { hasCapacity: true; availableAtIso: null })
  | {
      applicable: true;
      hasCapacity: boolean;
      /** 여력 소진으로 막혔을 때만 값이 있습니다. 체험 소진으로 막힌 경우는 라우트가 `null`로 덮습니다. */
      availableAtIso: string | null;
    };

export type ReserveResult =
  | (NotApplicable & { quotaDate: null; buckets: BucketMap })
  | { applicable: true; quotaDate: string; buckets: BucketMap };

export type ConsumeResult =
  | (NotApplicable & { consumedCalls: 0 })
  | { applicable: true; consumedCalls: number };

export type ReleaseReason =
  | "completed"
  | "settled"
  | "canceled"
  | "abandoned"
  | "failed"
  | "expired";

export type ReleaseResult =
  | (NotApplicable & { released: BucketMap })
  | { applicable: true; released: BucketMap };

const NO_OP_PEEK: PeekCapacityResult = {
  applicable: false,
  // BYOK 사용자는 공용 여력과 무관하게 언제든 시작할 수 있습니다 — D28의 유일한 이득입니다.
  hasCapacity: true,
  availableAtIso: null,
};
const EMPTY_BUCKETS: BucketMap = { flash_lite: 0, flash: 0, pro: 0 };
const NO_OP_RESERVE: ReserveResult = { applicable: false, quotaDate: null, buckets: EMPTY_BUCKETS };
const NO_OP_CONSUME: ConsumeResult = { applicable: false, consumedCalls: 0 };
const NO_OP_RELEASE: ReleaseResult = { applicable: false, released: EMPTY_BUCKETS };

/**
 * `→ completed`에서 남겨 두는 호출 수 (05_api_contract.md 4.7.3절 1번, D34).
 * 평가자 패스 A+B 4 + 코치 2. 면접이 끝났다고 전량 반납하면 **리포트를 만들 여력이 사라집니다.**
 * 이 6은 뒤이은 `settled`(→ `evaluated`)가 마저 가져갑니다.
 */
export const COMPLETED_KEEP_CALLS = 6;

/** #16 `evaluate` 재시도 — 평가자 패스 A + B + 재시도 여유. */
export const EVALUATE_RETRY_CALLS = 4;
/** #18 `coach/retry`. */
export const COACH_RETRY_CALLS = 2;

/**
 * ① 문 앞 조회 (#3 `POST /api/sessions`) — **비원자적이며 홀드를 잡지 않습니다.**
 *
 * 동시 요청이 함께 통과한 뒤 #6에서 한쪽이 거절될 수 있고, 이는 설계에 포함된 사실입니다.
 * **권위 있는 판정은 `reserveSessionQuota`뿐입니다.**
 */
export async function peekCapacity(
  userId: string,
  fundingSource: FundingSource,
  admin: Admin = createAdminClient(),
): Promise<PeekCapacityResult> {
  if (fundingSource !== "trial_shared") return NO_OP_PEEK;

  const request = sessionRequest();
  // 한도 미설정 = fail-open(확정 동작). 여기서 막으면 미주입 배포가 전 사용자를 잠급니다.
  if (isGateInert(request)) {
    return { applicable: true, hasCapacity: true, availableAtIso: null };
  }

  const quotaDate = currentQuotaDate();
  const { data, error } = await admin
    .from("ai_quota_ledger")
    .select("model_bucket, limit_calls, held_calls")
    .eq("quota_date", quotaDate);

  if (error) {
    throw new ApiError("internal_error", "지금은 새 면접을 시작할 수 없습니다.", { cause: error });
  }

  const limits = effectiveLimits(request);
  const held = new Map(data.map((row) => [row.model_bucket, row.held_calls]));

  // 원장 행이 없는 버킷은 오늘 아무도 쓰지 않았다는 뜻이므로 보유분 0입니다.
  const fits = MODEL_BUCKETS.every((bucket) => {
    if (request[bucket] <= 0) return true;
    return (held.get(bucket) ?? 0) + request[bucket] <= limits[bucket];
  });

  // `userId`는 지금 판정에 쓰이지 않지만 시그니처에 남깁니다 — 사용자별 한도나 관측이
  // 붙을 자리이고, 호출 측이 이미 알고 있는 값을 나중에 다시 찾아 오지 않게 하려는 것입니다.
  void userId;

  return {
    applicable: true,
    hasCapacity: fits,
    availableAtIso: fits ? null : nextQuotaResetAt().toISOString(),
  };
}

/**
 * ② 확정 예약 (#6 `prepare` · #16 `evaluate` 재시도 · #18 `coach/retry`) — **원자적이며 권위**입니다.
 *
 * 실패하면 `ApiError`를 던집니다. **라우트는 잡아서 전이하지 않고 그대로 응답합니다** —
 * 세션은 `configuring`에 남고 설정이 보존됩니다(내일 그대로 이어서 준비할 수 있습니다).
 */
export async function reserveSessionQuota(
  sessionId: string,
  fundingSource: FundingSource,
  options: { request?: BucketMap; admin?: Admin } = {},
): Promise<ReserveResult> {
  if (fundingSource !== "trial_shared") return NO_OP_RESERVE;

  const request = options.request ?? sessionRequest();
  if (isGateInert(request)) return { applicable: false, quotaDate: null, buckets: EMPTY_BUCKETS };

  const admin = options.admin ?? createAdminClient();
  const quotaDate = currentQuotaDate();

  const { error } = await admin.rpc("reserve_session_quota", {
    p_session_id: sessionId,
    p_quota_date: quotaDate,
    p_request: request,
    p_limits: effectiveLimits(request),
  });

  if (error) throw translateReserveError(error.message);

  return { applicable: true, quotaDate, buckets: request };
}

/** #16 · #18 — 이미 `released`된 같은 세션의 예약을 되돌립니다(동시 예약 가드에 걸리지 않습니다). */
export function reserveRetryQuota(
  sessionId: string,
  fundingSource: FundingSource,
  bucket: ModelBucket,
  calls: number,
  admin?: Admin,
): Promise<ReserveResult> {
  return reserveSessionQuota(sessionId, fundingSource, {
    request: bucketRequest(bucket, calls),
    admin,
  });
}

/**
 * ③ 소비 기록 — 프로바이더 계층이 **호출을 보내기 전에** 부릅니다 (05_api_contract.md 4.7.2절).
 *
 * 성공 후가 아닙니다. RPD는 429로 끝난 호출도 세므로, 사후 증가는 반납을 과다하게 만들어
 * 다음 사용자가 있지도 않은 여력을 예약하게 됩니다.
 *
 * **여기서는 예외를 던지지 않습니다.** AI 호출 직전 경로라 원장 기록 실패로 면접을 끊는 것이
 * 여력이 조금 어긋나는 것보다 나쁩니다(DB 함수가 BYOK에 대해 조용히 0을 돌려주는 것과 같은 판단).
 */
export async function consumeSessionQuota(
  sessionId: string,
  fundingSource: FundingSource,
  bucket: ModelBucket,
  calls = 1,
  admin: Admin = createAdminClient(),
): Promise<ConsumeResult> {
  if (fundingSource !== "trial_shared") return NO_OP_CONSUME;

  const { data, error } = await admin.rpc("consume_session_quota", {
    p_session_id: sessionId,
    p_bucket: bucket,
    p_n: calls,
  });

  if (error) {
    console.error("[quota-gate] 소비 기록에 실패했습니다", {
      sessionId,
      bucket,
      message: error.message,
    });
    return { applicable: true, consumedCalls: 0 };
  }

  return { applicable: true, consumedCalls: data ?? 0 };
}

/**
 * ④ 반납 — **6지점 전부 여기를 부릅니다** (05_api_contract.md 4.7.3절).
 *
 * - `reason: "completed"`는 **부분 반납**입니다. `flash_lite`에서 6을 남깁니다.
 * - 나머지 5종은 전량 반납(정산·취소·포기·실패·만료)입니다.
 *
 * **멱등입니다.** DB 함수가 `status='held'` 행만 대상으로 하므로 라우트가 "이미 반납했는지"를
 * 스스로 기억하지 않습니다. **행 삭제(#23·#31)에는 반납 호출을 두지 마세요** —
 * `before delete` 트리거가 이미 반납하므로 겹치면 이중 반납이 됩니다.
 */
export async function releaseSessionQuota(
  sessionId: string,
  fundingSource: FundingSource,
  buckets: ModelBucket[] | null,
  reason: ReleaseReason,
  admin: Admin = createAdminClient(),
): Promise<ReleaseResult> {
  if (fundingSource !== "trial_shared") return NO_OP_RELEASE;

  const { data, error } = await admin.rpc("release_session_quota", {
    p_session_id: sessionId,
    // `null`을 명시적으로 넘기면 PostgREST가 default를 쓰지 못합니다 — 전체 반납은 인자 생략입니다.
    ...(buckets ? { p_buckets: buckets } : {}),
    p_reason: reason,
    // 완주 반납만 6을 남깁니다 — 평가자·코치가 같은 버킷을 먹기 때문입니다(D34).
    p_keep: reason === "completed" ? COMPLETED_KEEP_CALLS : 0,
  });

  if (error) {
    // 반납 실패는 여력이 새는 사고입니다. 조용히 넘기지 않습니다.
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
  }

  const released = { ...EMPTY_BUCKETS };
  for (const row of data ?? []) {
    if ((MODEL_BUCKETS as readonly string[]).includes(row.model_bucket)) {
      released[row.model_bucket as ModelBucket] = row.released;
    }
  }

  return { applicable: true, released };
}

/**
 * DB 함수의 `이름:값` 예외를 API 오류로 번역합니다.
 *
 * **503 `capacity_unavailable`과 429 `rate_limited`를 섞지 마세요** — 503은 우리가 부딪히기
 * 전에 막은 사전 신호이고, 429는 프로바이더 한도에 부딪힌 사후 신호입니다.
 * `details`에 버킷 이름·잔여량·한도를 넣지 않습니다(내부 용어가 새는 경로입니다).
 */
function translateReserveError(message: string): ApiError {
  if (message.includes("trial_reservation_exists")) {
    const existingSessionId = message.split("trial_reservation_exists:")[1]?.trim().split(/\s/)[0];
    return new ApiError("trial_reservation_exists", "이미 진행 중인 면접이 있습니다.", {
      details: existingSessionId ? { existingSessionId } : undefined,
    });
  }

  if (message.includes("quota_exhausted")) {
    const retryAfterSec = secondsUntilQuotaReset();
    return new ApiError("capacity_unavailable", "지금은 새 면접을 시작할 수 없습니다.", {
      details: { availableAtIso: nextQuotaResetAt().toISOString(), retryAfterSec },
      retryAfterSec,
    });
  }

  // `quota_not_applicable:byok`가 여기 오면 진입부 가드가 뚫렸다는 뜻입니다 — 보안 사고로 다룹니다.
  return new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: message });
}
