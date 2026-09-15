import "server-only";

import { serverEnv } from "@/lib/env.server";
import type { FundingSource } from "@/lib/session/status";

/**
 * 역할 상수와 모델 매핑 (02_ai_architecture.md 4.4절).
 *
 * **에이전트 코드는 모델 ID를 직접 참조하지 않습니다.** 여기만 참조합니다 —
 * 한도가 소진되면 운영자가 배포 없이 환경변수로 모델을 내릴 수 있어야 합니다.
 */

export const AGENT_ROLES = [
  "interviewer",
  "summarizer",
  "planner",
  "evaluator",
  "coach",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

/**
 * **버킷은 모델이 아니라 "(키 풀 × 모델) 하나에 대응하는 독립 RPD 카운터"입니다** (D35-1).
 *
 * D34 이후 체험의 활성 버킷은 `flash_lite` 하나이고, `flash`·`pro`는 휴면(세션당 예약 0)입니다.
 * **`flash_lite_demo`는 D35로 추가된 네 번째 버킷**이며 같은 모델을 쓰지만 **키가 다릅니다**
 * (`GEMINI_API_KEY_DEMO`). 같은 키·같은 모델을 두 행으로 쪼개면 원장이 거짓말을 시작하므로,
 * 이 버킷을 운영 공용 키에 붙이면 안 됩니다.
 *
 * **순서가 의미를 갖습니다** — DB 함수의 고정 잠금 순서(`pro → flash → flash_lite →
 * flash_lite_demo`)와 같게 유지하고, 새 값은 **맨 끝에만** 붙입니다(데드락 회피 근거).
 */
export const MODEL_BUCKETS = ["flash_lite", "flash", "pro", "flash_lite_demo"] as const;
export type ModelBucket = (typeof MODEL_BUCKETS)[number];

/** 라우트가 버킷을 직접 고르지 않습니다 — 역할이 버킷을 결정합니다 (05_api_contract.md 4.7.2절). */
export const ROLE_BUCKET: Record<AgentRole, ModelBucket> = {
  interviewer: "flash_lite",
  summarizer: "flash_lite",
  planner: "flash_lite",
  evaluator: "flash_lite",
  coach: "flash_lite",
};

/**
 * 재원까지 반영한 버킷 (D35-1 ③ — 재원↔버킷 짝).
 *
 * **`demo` 세션의 모든 역할은 `flash_lite_demo`입니다.** 역할만 보고 버킷을 고르면 데모 호출이
 * 체험 원장(`flash_lite`)에 기록되고, 그 증상은 "체험 정원이 왜인지 부족하다"로만 보입니다.
 * DB 함수도 같은 짝을 강제하지만 그것은 마지막 방어선이지 유일한 방어선이 아닙니다.
 */
export function bucketFor(role: AgentRole, fundingSource: FundingSource): ModelBucket {
  return fundingSource === "demo" ? "flash_lite_demo" : ROLE_BUCKET[role];
}

export type ProviderName = "google" | "anthropic";

export type AgentModel = {
  provider: ProviderName;
  model: string;
  params: {
    temperature: number;
    maxOutputTokens: number;
  };
};

/**
 * D34 실측 — 무료 티어에서 쓸 수 있는 모델은 `gemini-3.1-flash-lite` 하나뿐입니다
 * (`02_ai_architecture.md` 4.2.0·4.2.1절). 5개 역할 전부 같은 모델입니다.
 */
const DEFAULT_MODEL = "gemini-3.1-flash-lite";

/** 파라미터 원본은 `02_ai_architecture.md` 4.5절입니다. */
const ROLE_PARAMS: Record<AgentRole, AgentModel["params"]> = {
  interviewer: { temperature: 0.7, maxOutputTokens: 220 },
  summarizer: { temperature: 0.2, maxOutputTokens: 400 },
  planner: { temperature: 0.6, maxOutputTokens: 2200 },
  // 평가는 재시도 가능해야 하고 같은 로그에 같은 점수가 나와야 합니다(이의 제기 대응).
  // 호출이 둘(패스 A 2000 / 패스 B 1600)이지만 역할 상수는 하나이며, 상한이 큰 쪽을 둡니다.
  evaluator: { temperature: 0, maxOutputTokens: 2000 },
  coach: { temperature: 0.5, maxOutputTokens: 2400 },
};

const MODEL_ENV_KEY = {
  interviewer: "AI_MODEL_INTERVIEWER",
  summarizer: "AI_MODEL_SUMMARIZER",
  planner: "AI_MODEL_PLANNER",
  evaluator: "AI_MODEL_EVALUATOR",
  coach: "AI_MODEL_COACH",
} as const satisfies Record<AgentRole, keyof ReturnType<typeof serverEnv>>;

/** 역할의 모델 설정. 환경변수 오버라이드가 있으면 그쪽이 이깁니다. */
export function agentModel(role: AgentRole): AgentModel {
  const env = serverEnv();
  return {
    provider: env.AI_PROVIDER,
    model: env[MODEL_ENV_KEY[role]] ?? DEFAULT_MODEL,
    params: ROLE_PARAMS[role],
  };
}
