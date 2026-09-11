/**
 * 오류 응답 계약 (05_api_contract.md 13절).
 *
 * 성공 바디와 오류 바디는 **절대 섞이지 않습니다.** `error` 키가 있으면 다른 키는 없습니다.
 */

/** 계약 13절 표의 `code` 전수. 여기에 없는 문자열을 응답에 넣지 않습니다. */
export const API_ERROR_CODES = [
  "validation_failed",
  "unauthenticated",
  "forbidden",
  "not_found",
  "invalid_transition",
  "turn_seq_conflict",
  "extraction_in_progress",
  "guard_failed",
  "trial_consent_required",
  "consent_version_stale",
  "trial_reservation_exists",
  "byok_key_invalid",
  "byok_quota_exhausted",
  "payload_too_large",
  "unsupported_media_type",
  "rate_limited",
  "internal_error",
  "provider_unavailable",
  "capacity_unavailable",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** 각 `code`의 기본 HTTP 상태. 라우트에서 개별로 덮어쓸 수 있습니다. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_transition: 409,
  turn_seq_conflict: 409,
  extraction_in_progress: 409,
  guard_failed: 409,
  trial_consent_required: 409,
  consent_version_stale: 409,
  trial_reservation_exists: 409,
  byok_key_invalid: 409,
  byok_quota_exhausted: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  internal_error: 500,
  provider_unavailable: 503,
  capacity_unavailable: 503,
};

/** 오류 응답 바디 — `{ error: { code, message, details? } }` */
export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    /** 사용자에게 그대로 보일 수 있는 **한국어** 문구입니다. */
    message: string;
    details?: Record<string, unknown>;
  };
};

/**
 * 라우트 안에서 던지고 최상위 핸들러가 오류 응답으로 바꿉니다.
 * `message`는 한국어이며, 서버 내부 사정을 담지 않습니다.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  /** `Retry-After` 헤더를 붙일 초 단위 값 (429 · 503에서만). */
  readonly retryAfterSec?: number;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: {
      status?: number;
      details?: Record<string, unknown>;
      retryAfterSec?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.code = code;
    this.status = options.status ?? API_ERROR_STATUS[code];
    this.details = options.details;
    this.retryAfterSec = options.retryAfterSec;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
