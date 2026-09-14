import "server-only";

import { redactCtx, type LlmCallContext, type RedactedCallContext } from "@/lib/ai/credentials";
import type { PauseReason } from "@/lib/session/status";

/**
 * 사용자 키 오류 정규화 — 3분류 (02_ai_architecture.md 4.6절이 원본).
 *
 * **상위 계층은 원시 오류를 보지 않습니다.** SDK 예외에는 요청 헤더가 통째로 붙어 있는 경우가
 * 있어, 그대로 던지거나 로깅하면 키가 샙니다. 반드시 이 함수를 통과한 결과만 올라갑니다.
 */

export type ProviderErrorKind =
  | "transient"
  | "permanent"
  | "key_invalid"
  | "key_quota_exhausted";

/**
 * `transient`의 **실제 원인**입니다 (QA R3).
 *
 * `kind`만으로는 계약 5.2절 `stream_error.code` 5종 중 `llm_timeout`·`llm_failed`가 절대 나오지
 * 않습니다 — 셋을 하나로 접으면 사용자는 타임아웃에도 "면접관이 답변을 정리하고 있습니다"만 봅니다.
 * `kind`는 **상태 전이**를 정하고, 이 값은 **사용자에게 나갈 코드**를 정합니다.
 */
export type TransientCause = "timeout" | "rate_limited" | "failed";

type NormalizedOptions = {
  /** `transient`일 때만 채웁니다. */
  transientCause?: TransientCause;
  /** 프로바이더가 준 `Retry-After`(초). `resumable_after` 계산에 씁니다(계약 10.1절). */
  retryAfterSec?: number | null;
};

export class NormalizedProviderError extends Error {
  readonly kind: ProviderErrorKind;
  /** 백오프로 회복될 여지가 있는가. `transient`만 true입니다. */
  readonly retryable: boolean;
  /** `byok` 세션이 `paused`로 갈 때의 사유. `transient`·`permanent`는 `paused`로 가지 않습니다. */
  readonly pauseReason: PauseReason | null;
  /** 로그·이벤트에 남길 수 있는 전부입니다. 원시 오류도 키도 들어 있지 않습니다. */
  readonly context: RedactedCallContext;
  /** `transient`의 원인. 다른 `kind`에서는 `null`입니다. */
  readonly transientCause: TransientCause | null;
  /** 프로바이더가 알려 준 재시도 대기 시간(초). 없으면 `null`입니다. */
  readonly retryAfterSec: number | null;
  /**
   * **백오프 예산(60초)을 다 쓰고도 회복하지 못했는가** (계약 10절 4단계).
   *
   * 재시도 루프(`runStream`·`runCompletion`)만 이 값을 `true`로 올립니다. `true`인 `transient`가
   * 전이 표 **14행**(`in_progress → paused`, `pause_reason='rate_limited'`)의 진입 조건입니다.
   */
  retriesExhausted = false;

  constructor(kind: ProviderErrorKind, context: RedactedCallContext, options: NormalizedOptions = {}) {
    super(KIND_MESSAGE[kind]);
    this.name = "NormalizedProviderError";
    this.kind = kind;
    this.retryable = kind === "transient";
    this.pauseReason = KIND_PAUSE_REASON[kind];
    this.context = context;
    this.transientCause = kind === "transient" ? (options.transientCause ?? "failed") : null;
    this.retryAfterSec = options.retryAfterSec ?? null;
  }
}

/** 사용자에게 보이는 문구는 UI가 `kind`로 조회합니다 — 이 값은 서버 로그용 라벨입니다. */
const KIND_MESSAGE: Record<ProviderErrorKind, string> = {
  transient: "provider transient failure",
  permanent: "provider permanent failure",
  key_invalid: "provider rejected the credential",
  key_quota_exhausted: "credential daily quota exhausted",
};

const KIND_PAUSE_REASON: Record<ProviderErrorKind, PauseReason | null> = {
  transient: null,
  // 영구 오류는 `paused`가 아니라 `failed`입니다(전이 표 20행) — 사용자가 기다려서 고칠 수 있는
  // 상태가 아닙니다.
  permanent: null,
  key_invalid: "byok_key_invalid",
  key_quota_exhausted: "byok_quota_exhausted",
};

type ProviderErrorShape = {
  status?: number;
  code?: string;
  text?: string;
  retryAfterSec?: number | null;
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
  const retryAfterSec = [record.retryAfterSec, record.retry_after_sec].find(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );

  return { status, code, text: message?.toLowerCase(), retryAfterSec: retryAfterSec ?? null };
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

/** 타임아웃 계열 신호. 5xx·불명(`llm_failed`)과 갈라야 `llm_timeout`이 나옵니다. */
const TIMEOUT_MARKERS = [
  "timeout",
  "timed out",
  "etimedout",
  "deadline_exceeded",
  "deadline exceeded",
  "aborterror",
  "the operation was aborted",
];

/**
 * **재시도해도 같은 결과인 것들**입니다 (계약 10.1절: `ContextOverflowError`·모델명 오타).
 * 재시도하면 남은 쿼터를 확실히 실패할 호출로 태웁니다.
 */
const PERMANENT_MARKERS = [
  "context length",
  "context_length",
  "token count",
  "exceeds the maximum",
  "is not found for api version",
  "not_found",
  "invalid_argument",
  "unsupported",
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
 * 4. 그러고도 남는 것 중 **재시도해도 같은 결과인 것**(컨텍스트 초과·모델명 오타·400 계열)은
 *    `permanent`입니다 — 전이 표 20행(`in_progress → failed`, `provider_permanent_error`)입니다.
 *    나머지(5xx·네트워크·분류 불명)는 `transient`로 둡니다.
 *
 * @param attempt 몇 번째 시도에서 난 오류인가(1부터). 1이면 아직 `transient`로 한 번 더 태웁니다.
 */
export function normalizeProviderError(
  raw: unknown,
  ctx: LlmCallContext,
  attempt = 1,
): NormalizedProviderError {
  const context = redactCtx(ctx);
  const { status, code, text, retryAfterSec } = shapeOf(raw);
  const haystack = `${code ?? ""} ${text ?? ""}`.toLowerCase();

  const isAuthRejection =
    status === 401 ||
    status === 403 ||
    AUTH_MARKERS.some((marker) => haystack.includes(marker));

  if (isAuthRejection) {
    // 규칙 2 — 재시도 1회 후에 판정합니다. 첫 시도의 인증 거절은 아직 확정이 아닙니다.
    if (attempt <= 1) {
      return new NormalizedProviderError("transient", context, { transientCause: "failed" });
    }
    // **공용 키의 401/403은 우리 설정 오류입니다**(계약 10.1절 마지막 행 + 그 아래 주석).
    // `byok_key_invalid`로 접으면 사용자가 고칠 수 없는 상태를 "키를 확인하세요"로 안내하게 되고,
    // `pause_reason`의 정의(`byok`에서만 발생)도 깨집니다. 체험 세션은 전이 표 20행입니다.
    if (context.fundingSource !== "byok") {
      return new NormalizedProviderError("permanent", context);
    }
    return new NormalizedProviderError("key_invalid", context);
  }

  const isRateLimited = status === 429 || haystack.includes("resource_exhausted");
  if (isRateLimited) {
    const looksDaily = DAILY_QUOTA_MARKERS.some((marker) => haystack.includes(marker));
    // 백오프가 남아 있으면 일당 신호가 보여도 한 번 더 태웁니다(규칙 1).
    if (!looksDaily || attempt <= 1) {
      return new NormalizedProviderError("transient", context, {
        transientCause: "rate_limited",
        retryAfterSec,
      });
    }
    // 사용자 키가 아니면 "사용자 계정의 한도 소진"이라는 분류 자체가 성립하지 않습니다 —
    // 공용 키의 일당 소진은 우리 원장 문제이므로 `transient`로 두고 4단계가 `paused`로 보냅니다.
    if (context.fundingSource !== "byok") {
      return new NormalizedProviderError("transient", context, {
        transientCause: "rate_limited",
        retryAfterSec,
      });
    }
    return new NormalizedProviderError("key_quota_exhausted", context, { retryAfterSec });
  }

  if (status === 408 || status === 504 || TIMEOUT_MARKERS.some((m) => haystack.includes(m))) {
    return new NormalizedProviderError("transient", context, { transientCause: "timeout" });
  }

  const looksPermanent =
    (status !== undefined && status >= 400 && status < 500 && status !== 409) ||
    PERMANENT_MARKERS.some((marker) => haystack.includes(marker));
  if (looksPermanent) {
    return new NormalizedProviderError("permanent", context);
  }

  // 5xx·네트워크 단절·분류 불명은 `transient`입니다. 애매한 것을 여기에 두는 이유는 규칙 1과
  // 같습니다 — 멀쩡한 호출을 영구 실패로 신고하는 쪽이 한 번 더 재시도하는 쪽보다 훨씬 나쁩니다.
  return new NormalizedProviderError("transient", context, { transientCause: "failed" });
}

export function isNormalizedProviderError(value: unknown): value is NormalizedProviderError {
  return value instanceof NormalizedProviderError;
}
