import "server-only";

import { MODEL_BUCKETS, type ModelBucket } from "@/lib/ai/roles";
import { serverEnv } from "@/lib/env.server";

/**
 * 한도·요청량 계산 (04_data_layer.md 12.2절 R8 · 02_ai_architecture.md 8.3.7절).
 *
 * **DB는 환경변수를 읽을 수 없습니다.** 그날 원장 행에 박을 `limit_calls`를 서버가 계산해
 * `p_limits`로 넘기고, 세션당 예약량을 `p_request`로 넘깁니다.
 */

export type BucketMap = Record<ModelBucket, number>;

/** 세션당 예약량. D34 이후 실질은 `{ pro: 0, flash: 0, flash_lite: 34 }` 하나뿐입니다. */
export function sessionRequest(): BucketMap {
  const env = serverEnv();
  return {
    flash_lite: env.AI_RESERVE_FLASH_LITE_PER_SESSION,
    flash: env.AI_RESERVE_FLASH_PER_SESSION,
    pro: env.AI_RESERVE_PRO_PER_SESSION,
  };
}

/** 재시도 경로(#16 평가 4 · #18 코치 2)는 세션 예약량이 아니라 필요량만 잡습니다. */
export function bucketRequest(bucket: ModelBucket, calls: number): BucketMap {
  const request: BucketMap = { flash_lite: 0, flash: 0, pro: 0 };
  request[bucket] = calls;
  return request;
}

const RPD_ENV_KEY = {
  flash_lite: "AI_RPD_LIMIT_FLASH_LITE",
  flash: "AI_RPD_LIMIT_FLASH",
  pro: "AI_RPD_LIMIT_PRO",
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
  if (rpd === undefined) return null;
  return Math.floor(rpd * (1 - env.AI_QUOTA_SAFETY_MARGIN_PCT / 100));
}

/**
 * `p_limits`로 넘길 버킷별 유효한도.
 * **요청량이 0인 버킷(휴면)은 한도가 없어도 무방합니다** — DB 함수가 건너뛰므로
 * 원장 행 자체가 만들어지지 않습니다.
 */
export function effectiveLimits(request: BucketMap): BucketMap {
  const limits: BucketMap = { flash_lite: 0, flash: 0, pro: 0 };
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
