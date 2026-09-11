import { NextResponse } from "next/server";

import { ApiError, isApiError, type ApiErrorBody } from "@/lib/api/errors";

/**
 * 응답 래핑 규칙 (05_api_contract.md 1절) — **타입으로 고정합니다.**
 *
 *   단건     : { "<resourceName>": T }
 *   목록     : { "<resourceNamePlural>": T[], "nextCursor": string | null }
 *   복합     : 각 리소스를 자기 이름의 키로 나란히
 *   즉시 응답 : { sessionId, status, ... }   (최종 결과와 **다른 타입**)
 *   부작용만  : { "ok": true }
 *   오류     : { "error": { code, message, details? } }
 *
 * **최상위 배열을 반환하는 엔드포인트는 하나도 없습니다.** 배열을 그대로 돌려주면
 * 나중에 `nextCursor`를 붙일 자리가 없어 응답 모양을 바꿔야 하고, 그 순간 모든 훅이
 * 런타임에서 깨집니다.
 */

/** 단건 봉투 — `{ session: Session }` */
export type SingleEnvelope<K extends string, T> = { [P in K]: T };

/** 목록 봉투 — `{ sessions: Session[], nextCursor: string | null }` */
export type ListEnvelope<K extends string, T> = {
  [P in K]: T[];
} & { nextCursor: string | null };

/** 부작용만 있는 응답 — 돌려줄 리소스가 없을 때만 씁니다. */
export type OkEnvelope = { ok: true };

type Init = { status?: number; headers?: HeadersInit };

/** 단건 리소스를 자기 이름의 키로 감싸 반환합니다. */
export function single<K extends string, T>(
  key: K,
  value: T,
  init: Init = {},
): NextResponse<SingleEnvelope<K, T>> {
  return NextResponse.json(
    { [key]: value } as SingleEnvelope<K, T>,
    { status: init.status ?? 200, headers: init.headers },
  );
}

/**
 * 목록을 반환합니다. 항목이 없으면 `[]`이고 `null`이 아닙니다.
 * `nextCursor`는 **항상 존재하며** 마지막 페이지에서 `null`입니다.
 */
export function list<K extends string, T>(
  key: K,
  items: T[],
  nextCursor: string | null = null,
  init: Init = {},
): NextResponse<ListEnvelope<K, T>> {
  return NextResponse.json(
    { [key]: items, nextCursor } as ListEnvelope<K, T>,
    { status: init.status ?? 200, headers: init.headers },
  );
}

/**
 * 복합 응답 — 각 리소스를 자기 이름의 키로 나란히 둡니다.
 * 예) `compound({ turns, questions })`
 */
export function compound<T extends Record<string, unknown>>(
  body: T,
  init: Init = {},
): NextResponse<T> {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: init.headers,
  });
}

/** 반환할 리소스가 없을 때만. 가능하면 갱신된 리소스를 돌려주세요. */
export function ok(init: Init = {}): NextResponse<OkEnvelope> {
  return NextResponse.json({ ok: true } as const, {
    status: init.status ?? 200,
    headers: init.headers,
  });
}

/**
 * 202 즉시 응답 — 최종 결과와 **다른 타입**입니다 (05_api_contract.md 3절).
 * 프론트가 이 응답에서 최종 결과 필드를 읽으면 런타임에 터집니다.
 */
export function accepted<T extends Record<string, unknown>>(
  body: T,
  init: Omit<Init, "status"> = {},
): NextResponse<T> {
  return NextResponse.json(body, { status: 202, headers: init.headers });
}

/** 오류 응답. `ApiError`가 아니면 500 `internal_error`로 정규화합니다. */
export function fail(error: unknown): NextResponse<ApiErrorBody> {
  const apiError = isApiError(error)
    ? error
    : new ApiError("internal_error", "요청을 처리하지 못했습니다.", {
        cause: error,
      });

  if (!isApiError(error)) {
    // 상세는 응답이 아니라 서버 로그로만 나갑니다 (계약 13절).
    console.error("[api] 처리되지 않은 오류", error);
  }

  const headers = new Headers();
  if (apiError.retryAfterSec !== undefined) {
    headers.set("Retry-After", String(apiError.retryAfterSec));
  }

  return NextResponse.json(apiError.toBody(), {
    status: apiError.status,
    headers,
  });
}
