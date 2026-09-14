import "server-only";

import type { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { ZodType } from "zod";

import { ApiError } from "@/lib/api/errors";
import { fail } from "@/lib/api/respond";
import type { SessionRow } from "@/lib/api/serialize";
import { serverEnv } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";

/**
 * 라우트 공통 골격 (`05_api_contract.md` 7.3절).
 *
 * **미들웨어 통과는 "로그인했다"일 뿐 "이 세션의 주인이다"가 아닙니다.** 쓰기는 `admin.ts`
 * (service_role)로 하는데 그 클라이언트는 RLS를 우회하므로, 소유권 검사가 빠지면 남의 세션을
 * 마음대로 고칠 수 있습니다 — 이 프로젝트에서 가장 비싼 버그입니다.
 */

/** 모든 핸들러를 감쌉니다. 던져진 `ApiError`는 계약 13절의 오류 바디로 나갑니다. */
export async function handle<T>(
  run: () => Promise<NextResponse<T>>,
): Promise<NextResponse<T> | ReturnType<typeof fail>> {
  try {
    return await run();
  } catch (error) {
    return fail(error);
  }
}

/** 라우트 안에서 **다시** 확인합니다. 미들웨어를 믿지 않습니다. */
export async function requireUser(): Promise<{
  user: User;
  supabase: Awaited<ReturnType<typeof createClient>>;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new ApiError("unauthenticated", "로그인이 필요합니다.");
  }

  return { user, supabase };
}

/**
 * 소유한 세션을 읽습니다.
 *
 * - 반드시 **`server.ts`(anon + 쿠키)로 읽습니다.** `admin.ts`로 읽으면 RLS가 꺼져 검사 자체가
 *   의미를 잃습니다.
 * - 존재하지 않는 세션과 남의 세션을 **똑같이 404**로 답합니다. 403을 쓰면 "그 id는 존재한다"가
 *   새어 나갑니다.
 */
export async function loadOwnedSession(sessionId: string): Promise<{
  user: User;
  session: SessionRow;
  supabase: Awaited<ReturnType<typeof createClient>>;
}> {
  const { user, supabase } = await requireUser();

  const { data, error } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
  }
  if (!data) {
    throw new ApiError("not_found", "세션을 찾을 수 없습니다.");
  }

  return { user, session: data, supabase };
}

/** #9 외 라우트의 본문 상한. #9는 64KB이며 자기 라우트에서 따로 정합니다(계약 13절 413). */
const DEFAULT_MAX_BODY_BYTES = 1_048_576;

/**
 * JSON 본문을 읽고 zod로 검증합니다.
 *
 * **요청 body도 camelCase로 받습니다** — 클라이언트가 snake_case를 보내는 경로는 없습니다.
 * 검증 실패의 `details.fields`에 **입력값을 되비추지 않습니다**(키가 샐 수 있는 경로입니다).
 */
export async function readJson<T>(
  request: Request,
  schema: ZodType<T>,
  options: { maxBytes?: number; allowEmpty?: boolean } = {},
): Promise<T> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES;

  const contentType = request.headers.get("content-type") ?? "";
  const hasBody = contentType.length > 0;
  if (hasBody && !contentType.includes("application/json")) {
    throw new ApiError("unsupported_media_type", "지원하지 않는 요청 형식입니다.");
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > maxBytes) {
    throw new ApiError("payload_too_large", "요청이 너무 큽니다.");
  }

  const source: unknown = raw.trim().length === 0 ? {} : safeParseJson(raw);
  const parsed = schema.safeParse(source);

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fields[issue.path.join(".") || "_"] = issue.message;
    }
    throw new ApiError("validation_failed", "요청 내용을 확인해 주세요.", {
      details: { fields },
    });
  }

  return parsed.data;
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError("validation_failed", "요청 내용을 확인해 주세요.", {
      details: { fields: { _: "JSON 형식이 아닙니다." } },
    });
  }
}

/**
 * 내부 워커 라우트(I1·I2)의 인증. 미들웨어는 이 경로를 통과시키므로 **라우트가 직접 검사**합니다.
 * 불일치는 403 `forbidden`입니다(401이 아닙니다 — 사용자 세션의 문제가 아닙니다).
 */
export function requireJobSecret(request: Request): void {
  const provided = request.headers.get("x-job-secret");
  if (!provided || !timingSafeEqual(provided, serverEnv().JOB_SECRET)) {
    throw new ApiError("forbidden", "요청을 처리할 수 없습니다.");
  }
}

/** 크론 라우트(C1)의 인증 — `Authorization: Bearer ${CRON_SECRET}`. */
export function requireCronSecret(request: Request): void {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !timingSafeEqual(token, serverEnv().CRON_SECRET)) {
    throw new ApiError("forbidden", "요청을 처리할 수 없습니다.");
  }
}

/** 길이가 다르면 즉시 false. 같으면 전 바이트를 비교해 조기 종료하지 않습니다. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
