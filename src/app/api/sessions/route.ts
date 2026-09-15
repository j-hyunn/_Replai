import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { decodeCursor, encodeCursor, readLimit } from "@/lib/api/cursor";
import { ApiError } from "@/lib/api/errors";
import { list, single } from "@/lib/api/respond";
import { handle, readJson, requireUser } from "@/lib/api/route";
import { IDLE_PREPARATION, toSessionDto } from "@/lib/api/serialize";
import { assertNotDemoAccount } from "@/lib/demo/policy";
import { peekCapacity } from "@/lib/quota/gate";
import { nextQuotaResetAt, secondsUntilQuotaReset } from "@/lib/quota/quota-date";
import { translateFundingRuleError } from "@/lib/session/funding-errors";
import { SESSION_STATUSES, type FundingSource, type SessionStatus } from "@/lib/session/status";
import { recordSessionCreated } from "@/lib/session/store";
import { toSessionSummaries } from "@/lib/session/summary";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * #3 `POST /api/sessions` — 세션 생성. **`fundingSource`가 여기서 확정되고 이후 변경 불가입니다.**
 *
 * 전이 표 1행((없음) → `created`)의 재원 분기(D28)가 이 라우트에 그대로 들어옵니다.
 * ① 유효한 사용자 키가 있으면 `byok`로 **무조건 통과**(원장을 읽지 않습니다).
 * ② 아니면 체험 경로 — 체험 미소진 **이고** 문 앞 조회 통과여야 `trial_shared`.
 * ③ 둘 다 아니면 **행을 만들지 않고** 503 `capacity_unavailable`.
 *
 * **문 앞 조회는 원자적이지 않습니다.** 동시 요청이 함께 통과한 뒤 #6에서 한쪽이 거절될 수
 * 있고, 이는 설계에 포함된 사실입니다. 권위 있는 판정은 #6뿐입니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** 목록 1페이지 기본 20건. 상한 100은 한 번에 읽는 평가·축 쿼리의 크기를 묶어 둡니다. */
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const bodySchema = z.object({
  sourceSessionId: z.uuid().nullish(),
});

/** 설정을 물려받을 때 복사하는 컬럼 — 스냅샷·상태·시각 계열은 **복사하지 않습니다.** */
const INHERITED_COLUMNS = [
  "job_role",
  "persona",
  "modality",
  "resume_document_id",
  "jd_document_id",
] as const;

export function POST(request: Request) {
  return handle(async () => {
    const { user, supabase } = await requireUser();
    const body = await readJson(request, bodySchema);

    // RLS 우회가 필요한 이유: user_api_keys는 RLS를 켜고 정책이 0개입니다(04 5.2절).
    // 사용자 문맥 클라이언트로는 키의 존재 여부조차 읽을 수 없습니다.
    const admin = createAdminClient();

    // **익명(데모) 계정은 여기서 끝입니다** (D35-2). 막지 않으면 익명 사용자가 `trial_shared`
    // 세션을 만들어 하루 12세션의 체험 정원을 먹고, 증상은 "체험 정원이 왜인지 부족하다"로만
    // 보입니다. 프록시가 첫 겹, 이 가드가 둘째 겹, DB 트리거(`account_funding_mismatch:demo`)가
    // 마지막 겹입니다 — **한 겹이라도 빼면 안 됩니다.**
    await assertNotDemoAccount(user, admin);

    const fundingSource = await resolveFundingSource(user.id, admin);
    if (fundingSource === null) {
      throw trialExhaustedError();
    }

    if (fundingSource === "trial_shared") {
      const capacity = await peekCapacity(user.id, fundingSource, admin);
      if (!capacity.hasCapacity) {
        const retryAfterSec = secondsUntilQuotaReset();
        throw new ApiError("capacity_unavailable", "지금은 새 면접을 시작할 수 없습니다.", {
          details: {
            availableAtIso: capacity.availableAtIso ?? nextQuotaResetAt().toISOString(),
            retryAfterSec,
          },
          retryAfterSec,
        });
      }
    }

    // `sourceSessionId`는 **사용자 문맥으로** 읽습니다 — RLS가 남의 세션 설정을 물려받는 경로를 막습니다.
    const inherited = body.sourceSessionId
      ? await loadInheritedConfig(supabase, body.sourceSessionId)
      : {};

    const { data, error } = await admin
      .from("interview_sessions")
      .insert({
        user_id: user.id,
        // 기본값이 없는 것은 의도입니다 — 재원을 정하지 않은 INSERT는 not null 위반으로 실패합니다.
        funding_source: fundingSource,
        status: "created",
        source_session_id: body.sourceSessionId ?? null,
        ...inherited,
      })
      .select("*")
      .single();

    if (error || !data) {
      // 계정 유형↔재원 짝 위반(D35-2)은 **500으로 흘리지 않습니다** — 익명 계정이 체험 정원을
      // 노린 시도가 일반 오류에 섞이면 로그에서도 구분되지 않습니다.
      throw (
        translateFundingRuleError(error?.message) ??
        new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error })
      );
    }

    // 전이 표 1행. `from_status`는 `null`(행이 아직 없었음)이며 CHECK가 이를 허용합니다.
    await recordSessionCreated(data.id, { fundingSource }, admin);

    return single(
      "session",
      toSessionDto(data, {
        preparation: IDLE_PREPARATION,
        answeredMainQuestionCount: 0,
        turnCount: 0,
      }),
      { status: 201 },
    );
  });
}

type Admin = ReturnType<typeof createAdminClient>;

/**
 * 재원을 정합니다. `null`은 "체험도 소진됐고 키도 없다" — 세션을 만들지 않습니다.
 *
 * **키가 있으면 원장을 읽지 않습니다.** BYOK 사용자는 공용 여력과 무관하게 언제든 시작할 수
 * 있고, 그것이 D28의 유일한 이득입니다.
 */
async function resolveFundingSource(
  userId: string,
  admin: Admin,
): Promise<FundingSource | null> {
  const { data: key } = await admin
    .from("user_api_keys")
    .select("status")
    .eq("user_id", userId)
    .eq("status", "connected")
    .maybeSingle();

  if (key) return "byok";

  const { data: profile, error } = await admin
    .from("profiles")
    .select("trial_consumed_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
  }

  return profile?.trial_consumed_at ? null : "trial_shared";
}

/**
 * 체험 소진으로 막힌 경우입니다.
 *
 * **`availableAtIso`·`retryAfterSec`가 `null`이고 `Retry-After` 헤더도 보내지 않습니다** —
 * 기다려도 풀리지 않기 때문입니다. `null`을 "내일 오세요"로 렌더하면 거짓말이 됩니다.
 */
function trialExhaustedError(): ApiError {
  return new ApiError("capacity_unavailable", "지금은 새 면접을 시작할 수 없습니다.", {
    details: { availableAtIso: null, retryAfterSec: null },
  });
}

type InheritedColumn = (typeof INHERITED_COLUMNS)[number];
type InheritedConfig = Partial<Record<InheritedColumn, string>>;

async function loadInheritedConfig(
  supabase: SupabaseClient<Database>,
  sourceSessionId: string,
): Promise<InheritedConfig> {
  const { data } = await supabase
    .from("interview_sessions")
    .select("job_role, persona, modality, resume_document_id, jd_document_id")
    .eq("id", sourceSessionId)
    .maybeSingle();

  if (!data) {
    // 남의 세션이거나 없는 세션입니다. 설정 상속만 건너뛰고 생성은 계속합니다 —
    // 잘못된 `sourceSessionId` 하나 때문에 "새 면접 시작"이 막힐 이유가 없습니다.
    return {};
  }

  const inherited: InheritedConfig = {};
  for (const column of INHERITED_COLUMNS) {
    const value = data[column];
    if (value !== null) inherited[column] = value;
  }
  return inherited;
}

/**
 * #2 `GET /api/sessions` — 세션 목록 (계약 4.3절).
 *
 * **기본적으로 `canceled`를 제외합니다.** 규칙은 셋이며 순서가 있습니다.
 * ① `status=<값>`이 오면 그 상태만 — **명시 필터가 기본 제외 규칙을 이깁니다**
 *    (`status=canceled`는 `includeCanceled`와 무관하게 취소된 세션만 돌려줍니다).
 * ② `includeCanceled=true`면 전부.
 * ③ 아무것도 없으면 `status <> 'canceled'`.
 *
 * `includeCanceled`는 **문자열 `'true'`일 때만 참**입니다. 쿼리스트링 값은 전부 문자열이라
 * `Boolean(searchParams.get(...))`로 판정하면 `'false'`가 참이 됩니다.
 */
export function GET(request: Request) {
  return handle(async () => {
    const { user, supabase } = await requireUser();
    const params = new URL(request.url).searchParams;

    const status = readStatusFilter(params.get("status"));
    const includeCanceled = params.get("includeCanceled") === "true";
    const limit = readLimit(params.get("limit"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const rawCursor = params.get("cursor");

    // RLS가 이미 남의 세션을 가리지만, `user_id`를 함께 걸어 의도를 코드에도 남깁니다.
    let query = supabase
      .from("interview_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      // 다음 페이지 존재 여부를 알기 위해 **한 건 더** 읽고, 응답에서는 잘라냅니다.
      .limit(limit + 1);

    if (status !== null) query = query.eq("status", status);
    else if (!includeCanceled) query = query.neq("status", "canceled");

    if (rawCursor) {
      const cursor = decodeCursor(rawCursor);
      // 키셋 페이지네이션 — `(created_at, id)`가 커서보다 **엄격히 작은** 행만 봅니다.
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
    }

    const page = data.slice(0, limit);
    const last = page.at(-1);
    const nextCursor =
      data.length > limit && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;

    return list("sessions", await toSessionSummaries(supabase, page), nextCursor);
  });
}

/** 계약에 없는 `status` 값은 400입니다 — 조용히 무시하면 사용자가 전체 목록을 필터로 착각합니다. */
function readStatusFilter(raw: string | null): SessionStatus | null {
  if (raw === null) return null;

  const found = SESSION_STATUSES.find((candidate) => candidate === raw);
  if (found === undefined) {
    throw new ApiError("validation_failed", "요청 내용을 확인해 주세요.", {
      details: { fields: { status: "알 수 없는 세션 상태입니다." } },
    });
  }
  return found;
}
