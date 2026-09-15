/**
 * 클라이언트 fetch 래퍼 (06_ui_plan.md 2.1절).
 *
 * **언랩하지 않습니다.** 언랩은 훅의 일입니다 — `T`는 "봉투(envelope) 전체"의 타입이지
 * 리소스 타입이 아닙니다. `fetchJson<Session[]>(...)`처럼 쓰면 컴파일은 통과하고
 * 런타임에 깨집니다(계약 1절: 최상위 배열을 반환하는 엔드포인트는 하나도 없습니다).
 *
 * **SSE 응답(#9)에는 절대 쓰지 마세요.** 내부에서 `res.json()`을 부르므로 스트림을 삼킵니다.
 */

/** 서버가 준 `{ error: { code, message, details? } }`를 그대로 담습니다 (계약 13절). */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function isApiClientError(value: unknown): value is ApiClientError {
  return value instanceof ApiClientError;
}

/** `details`에서 문자열 필드를 안전하게 꺼냅니다. 없으면 `null`입니다. */
export function detailString(
  error: unknown,
  key: string,
): string | null {
  if (!isApiClientError(error)) return null;
  const value = error.details?.[key];
  return typeof value === "string" ? value : null;
}

export function detailNumber(error: unknown, key: string): number | null {
  if (!isApiClientError(error)) return null;
  const value = error.details?.[key];
  return typeof value === "number" ? value : null;
}

type ErrorBody = {
  error?: { code?: unknown; message?: unknown; details?: unknown };
};

function toApiError(status: number, body: unknown): ApiClientError {
  const envelope = (body ?? {}) as ErrorBody;
  const code =
    typeof envelope.error?.code === "string" ? envelope.error.code : "internal_error";
  const message =
    typeof envelope.error?.message === "string"
      ? envelope.error.message
      : "요청을 처리하지 못했습니다.";
  const details =
    envelope.error?.details && typeof envelope.error.details === "object"
      ? (envelope.error.details as Record<string, unknown>)
      : undefined;
  return new ApiClientError(status, code, message, details);
}

export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body === undefined ? {} : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });

  // 204 (#32 prewarm) — 본문이 없습니다.
  if (response.status === 204) return undefined as T;

  let body: unknown = null;
  const text = await response.text();
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      // 미들웨어가 아니라 플랫폼이 HTML 오류 페이지를 돌려준 경우입니다.
      throw new ApiClientError(
        response.status,
        "internal_error",
        "서버 응답을 이해하지 못했습니다.",
      );
    }
  }

  // **성공 바디와 오류 바디는 섞이지 않습니다** (계약 1절).
  if (!response.ok || (body !== null && typeof body === "object" && "error" in body)) {
    throw toApiError(response.status, body);
  }

  return body as T;
}
