import "server-only";

import { serverEnv } from "@/lib/env.server";

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
 * D34 이후 **활성 버킷은 `flash_lite` 하나**입니다.
 * `flash`·`pro`는 휴면(세션당 예약 0)이며 유료 전환에 대비해 값만 남겨 둡니다.
 */
export const MODEL_BUCKETS = ["flash_lite", "flash", "pro"] as const;
export type ModelBucket = (typeof MODEL_BUCKETS)[number];

/** 라우트가 버킷을 직접 고르지 않습니다 — 역할이 버킷을 결정합니다 (05_api_contract.md 4.7.2절). */
export const ROLE_BUCKET: Record<AgentRole, ModelBucket> = {
  interviewer: "flash_lite",
  summarizer: "flash_lite",
  planner: "flash_lite",
  evaluator: "flash_lite",
  coach: "flash_lite",
};

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
