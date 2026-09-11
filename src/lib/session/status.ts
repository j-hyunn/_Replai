/**
 * 세션 상태 값 (05_api_contract.md 12절 / 01_state_machine.md).
 *
 * **값은 영어 문자열 그대로입니다.** 번역하거나 camelCase로 바꾸면
 * DB의 CHECK 제약과 API 계약이 동시에 깨집니다.
 */

export const SESSION_STATUSES = [
  "created",
  "configuring",
  "ready",
  "in_progress",
  "paused",
  "completed",
  "evaluating",
  "evaluated",
  "failed",
  "abandoned",
  "canceled",
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** D28로 3종 → 5종. 재개 패널은 5종을 전부 분기해야 합니다. */
export const PAUSE_REASONS = [
  "user_requested",
  "rate_limited",
  "connection_lost",
  "byok_key_invalid",
  "byok_quota_exhausted",
] as const;

export type PauseReason = (typeof PAUSE_REASONS)[number];

/** D28 — 세션이 누구의 토큰으로 도는가. */
export const FUNDING_SOURCES = ["trial_shared", "byok"] as const;
export type FundingSource = (typeof FUNDING_SOURCES)[number];
