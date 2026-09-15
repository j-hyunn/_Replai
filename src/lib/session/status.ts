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

/**
 * D28 — 세션이 누구의 토큰으로 도는가. **D35로 `demo`가 추가되어 3종입니다.**
 *
 * `demo`는 로그인 없는 데모 체험(익명 계정)이며 **별도 키 풀(`GEMINI_API_KEY_DEMO`)과
 * 별도 버킷(`flash_lite_demo`)** 을 씁니다. 체험 정원 12세션과 절대 교차하지 않습니다.
 */
export const FUNDING_SOURCES = ["trial_shared", "byok", "demo"] as const;
export type FundingSource = (typeof FUNDING_SOURCES)[number];

/**
 * **예약을 가진 재원** (`01_state_machine.md` 2절 읽는 법 — 재원 3분기).
 *
 * `byok`만 예약 행이 없습니다. 게이트 4함수의 진입부 가드가 전부 이 목록을 봅니다 —
 * `!== 'trial_shared'` 같은 부정 비교를 쓰면 `demo`가 조용히 no-op이 되어
 * **데모가 원장을 통과해 버립니다.**
 */
export const RESERVING_FUNDING_SOURCES: readonly FundingSource[] = ["trial_shared", "demo"];

export function hasQuotaReservation(fundingSource: FundingSource): boolean {
  return RESERVING_FUNDING_SOURCES.includes(fundingSource);
}
