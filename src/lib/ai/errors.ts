import "server-only";

import { redactCtx, type LlmCallContext, type RedactedCallContext } from "@/lib/ai/credentials";
import type { PauseReason } from "@/lib/session/status";

/**
 * 사용자 키 오류 정규화 — 3분류 (02_ai_architecture.md 4.6절이 원본).
 *
 * **상위 계층은 원시 오류를 보지 않습니다.** SDK 예외에는 요청 헤더가 통째로 붙어 있는 경우가
 * 있어, 그대로 던지거나 로깅하면 키가 샙니다. 반드시 이 함수를 통과한 결과만 올라갑니다.
 */

export type ProviderErrorKind = "transient" | "key_invalid" | "key_quota_exhausted";

export class NormalizedProviderError extends Error {
  readonly kind: ProviderErrorKind;
  /** 백오프로 회복될 여지가 있는가. `transient`만 true입니다. */
  readonly retryable: boolean;
  /** `byok` 세션이 `paused`로 갈 때의 사유. `transient`는 `paused`로 가지 않습니다. */
  readonly pauseReason: PauseReason | null;
  /** 로그·이벤트에 남길 수 있는 전부입니다. 원시 오류도 키도 들어 있지 않습니다. */
  readonly context: RedactedCallContext;

  constructor(kind: ProviderErrorKind, context: RedactedCallContext) {
    super(KIND_MESSAGE[kind]);
    this.name = "NormalizedProviderError";
    this.kind = kind;
    this.retryable = kind === "transient";
    this.pauseReason = KIND_PAUSE_REASON[kind];
    this.context = context;
  }
}

/** 사용자에게 보이는 문구는 UI가 `kind`로 조회합니다 — 이 값은 서버 로그용 라벨입니다. */
const KIND_MESSAGE: Record<ProviderErrorKind, string> = {
  transient: "provider transient failure",
  key_invalid: "provider rejected the credential",
  key_quota_exhausted: "credential daily quota exhausted",
};

const KIND_PAUSE_REASON: Record<ProviderErrorKind, PauseReason | null> = {
  transient: null,
  key_invalid: "byok_key_invalid",
  key_quota_exhausted: "byok_quota_exhausted",
};

type ProviderErrorShape = {
  status?: number;
  code?: string;
  text?: string;
};

/**
 * 원시 오류에서 **판정에 필요한 것만** 뽑습니다. 오류 객체 전체를 들고 다니지 않습니다.
 * 메시지 문자열은 판정에만 쓰고 어디에도 다시 내보내지 않습니다.
 */
function shapeOf(raw: unknown): ProviderErrorShape {
  if (typeof raw !== "object" || raw === null) {
    return { text: typeof raw === "string" ? raw.toLowerCase() : undefined };
  }

  const record = raw as Record<string, unknown>;
  const nested = (record.error ?? {}) as Record<string, unknown>;

  const status = [record.status, record.statusCode, nested.code, nested.status].find(
    (value): value is number => typeof value === "number",
  );
  const code = [record.code, nested.status, nested.code].find(
    (value): value is string => typeof value === "string",
  );
  const message = [record.message, nested.message].find(
    (value): value is string => typeof value === "string",
  );

  return { status, code, text: message?.toLowerCase() };
}

/** 일당·계정 한도 계열의 신호. 분당 한도(`transient`)와 갈라야 합니다. */
const DAILY_QUOTA_MARKERS = [
  "per day",
  "perday",
  "daily",
  "requests per day",
  "quota_exceeded",
  "billing",
  "free_tier",
];

const AUTH_MARKERS = [
  "api_key_invalid",
  "api key not valid",
  "invalid api key",
  "permission_denied",
  "unauthenticated",
  "unauthorized",
  "forbidden",
];

/**
 * 판정 순서가 중요합니다 (4.6절).
 *
 * 1. 429·5xx·네트워크는 **먼저 `transient`** 로 봅니다. 이 단계를 건너뛰고 곧장
 *    `key_quota_exhausted`로 내리면 **분당 한도에 순간적으로 부딪힌 멀쩡한 키를 죽은 키로 신고**합니다.
 * 2. `key_invalid`는 백오프가 끝난 뒤(= `attempt`가 1을 넘은 뒤) 확정합니다.
 * 3. 429인데 일당 한도 신호가 명확하고 백오프로도 회복되지 않았으면 `key_quota_exhausted`입니다.
 *
 * @param attempt 몇 번째 시도에서 난 오류인가(1부터). 1이면 아직 `transient`로 한 번 더 태웁니다.
 */
export function normalizeProviderError(
  raw: unknown,
  ctx: LlmCallContext,
  attempt = 1,
): NormalizedProviderError {
  const context = redactCtx(ctx);
  const { status, code, text } = shapeOf(raw);
  const haystack = `${code ?? ""} ${text ?? ""}`.toLowerCase();

  const isAuthRejection =
    status === 401 ||
    status === 403 ||
    AUTH_MARKERS.some((marker) => haystack.includes(marker));

  if (isAuthRejection) {
    // 규칙 2 — 재시도 1회 후에 판정합니다. 첫 시도의 인증 거절은 아직 확정이 아닙니다.
    return new NormalizedProviderError(attempt <= 1 ? "transient" : "key_invalid", context);
  }

  const isRateLimited = status === 429 || haystack.includes("resource_exhausted");
  if (isRateLimited) {
    const looksDaily = DAILY_QUOTA_MARKERS.some((marker) => haystack.includes(marker));
    // 백오프가 남아 있으면 일당 신호가 보여도 한 번 더 태웁니다(규칙 1).
    if (!looksDaily || attempt <= 1) return new NormalizedProviderError("transient", context);
    return new NormalizedProviderError("key_quota_exhausted", context);
  }

  // 5xx·타임아웃·스트림 중단은 전부 transient입니다. 분류가 애매한 것도 여기에 둡니다 —
  // 멀쩡한 키를 죽었다고 신고하는 쪽이 한 번 더 재시도하는 쪽보다 훨씬 나쁩니다.
  return new NormalizedProviderError("transient", context);
}

export function isNormalizedProviderError(value: unknown): value is NormalizedProviderError {
  return value instanceof NormalizedProviderError;
}
