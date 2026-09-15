import "server-only";

import { MODEL_BUCKETS, type ModelBucket } from "@/lib/ai/roles";
import { serverEnv } from "@/lib/env.server";
import type { FundingSource } from "@/lib/session/status";

/**
 * 한도·요청량 계산 (04_data_layer.md 12.2절 R8 · 02_ai_architecture.md 8.3.7절).
 *
 * **DB는 환경변수를 읽을 수 없습니다.** 그날 원장 행에 박을 `limit_calls`를 서버가 계산해
 * `p_limits`로 넘기고, 세션당 예약량을 `p_request`로 넘깁니다.
 */

export type BucketMap = Record<ModelBucket, number>;

/** 요청량 0의 기준선. **버킷을 추가하면 여기부터 타입 오류가 납니다** — 그것이 의도입니다. */
export const ZERO_BUCKETS: BucketMap = {
  flash_lite: 0,
  flash: 0,
  pro: 0,
  flash_lite_demo: 0,
};

/**
 * 세션당 예약량. **재원이 버킷을 정합니다** (D35-1 ③).
 *
 * - `trial_shared` → `{ flash_lite: 34 }`
 * - `demo` → `{ flash_lite_demo: 17 }` — **`flash_lite`가 0이라 DB 함수가 체험 원장 행을
 *   읽지도·만들지도·잠그지도 않습니다.** 두 풀의 격리가 코드가 아니라 데이터로 보장됩니다.
 */
export function sessionRequest(fundingSource: FundingSource = "trial_shared"): BucketMap {
  const env = serverEnv();

  if (fundingSource === "demo") {
    return { ...ZERO_BUCKETS, flash_lite_demo: env.AI_RESERVE_FLASH_LITE_PER_DEMO };
  }

  return {
    ...ZERO_BUCKETS,
    flash_lite: env.AI_RESERVE_FLASH_LITE_PER_SESSION,
    flash: env.AI_RESERVE_FLASH_PER_SESSION,
    pro: env.AI_RESERVE_PRO_PER_SESSION,
  };
}

/** 재시도 경로(#16 평가 4 · #18 코치 2)는 세션 예약량이 아니라 필요량만 잡습니다. */
export function bucketRequest(bucket: ModelBucket, calls: number): BucketMap {
  const request: BucketMap = { ...ZERO_BUCKETS };
  request[bucket] = calls;
  return request;
}

const RPD_ENV_KEY = {
  flash_lite: "AI_RPD_LIMIT_FLASH_LITE",
  flash: "AI_RPD_LIMIT_FLASH",
  pro: "AI_RPD_LIMIT_PRO",
  flash_lite_demo: "AI_RPD_LIMIT_FLASH_LITE_DEMO",
} as const satisfies Record<ModelBucket, keyof ReturnType<typeof serverEnv>>;

/**
 * 유효한도 = `floor(RPD × (1 − 안전여유%/100))`.
 *
 * **한도가 미설정이면 fail-open입니다** — 그 버킷에 대해 `Number.MAX_SAFE_INTEGER`가 아니라
 * `null`을 돌려주고, 호출 측(`gate.ts`)이 게이트 자체를 건너뜁니다. 큰 수를 넣으면 원장에
 * 가짜 한도가 박혀 다음 날까지 남습니다.
 */
export function effectiveLimit(bucket: ModelBucket): number | null {
  const env = serverEnv();
  const rpd = env[RPD_ENV_KEY[bucket]];
  const fromRpd =
    rpd === undefined ? null : Math.floor(rpd * (1 - env.AI_QUOTA_SAFETY_MARGIN_PCT / 100));

  // 데모 버킷만 한도의 출처가 둘입니다 (D35-1).
  // ① 정원 상한 = 하루 데모 세션 수 × 세션당 예약량 (= 10 × 17 = 170). **항상 존재합니다.**
  // ② 실측 RPD가 주어지면 그 유효한도. 둘 다 있으면 **작은 쪽**이 이깁니다.
  // ①이 항상 있으므로 데모 게이트는 fail-open으로 떨어지지 않습니다 — 그것이 D35-2 장치 ①의
  // "구조적 상한"이며, 한도가 없어 열려 버리면 봇이 데모를 무한히 돌릴 수 있습니다.
  if (bucket === "flash_lite_demo") {
    const fromCapacity = env.AI_DEMO_DAILY_SESSIONS * env.AI_RESERVE_FLASH_LITE_PER_DEMO;
    return fromRpd === null ? fromCapacity : Math.min(fromCapacity, fromRpd);
  }

  return fromRpd;
}

/**
 * `p_limits`로 넘길 버킷별 유효한도.
 * **요청량이 0인 버킷(휴면)은 한도가 없어도 무방합니다** — DB 함수가 건너뛰므로
 * 원장 행 자체가 만들어지지 않습니다.
 */
export function effectiveLimits(request: BucketMap): BucketMap {
  const limits: BucketMap = { ...ZERO_BUCKETS };
  for (const bucket of MODEL_BUCKETS) {
    if (request[bucket] <= 0) continue;
    limits[bucket] = effectiveLimit(bucket) ?? 0;
  }
  return limits;
}

/**
 * 요청량이 있는 버킷 중 한도가 미설정인 것이 하나라도 있으면 게이트는 fail-open입니다
 * (`02_ai_architecture.md` 8.3.8절 — 확정 동작).
 */
export function isGateInert(request: BucketMap): boolean {
  if (!serverEnv().AI_QUOTA_GATE_ENABLED) return true;
  return MODEL_BUCKETS.some(
    (bucket) => request[bucket] > 0 && effectiveLimit(bucket) === null,
  );
}
