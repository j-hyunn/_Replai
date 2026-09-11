import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { fail, single } from "@/lib/api/respond";
import { handle, readJson, requireUser } from "@/lib/api/route";
import { IDLE_PREPARATION, toSessionDto } from "@/lib/api/serialize";
import { peekCapacity } from "@/lib/quota/gate";
import { nextQuotaResetAt, secondsUntilQuotaReset } from "@/lib/quota/quota-date";
import type { FundingSource } from "@/lib/session/status";
import { recordSessionCreated } from "@/lib/session/store";
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
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
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

export function GET() {
  // #2 `GET /api/sessions`(목록)는 이번 라운드 범위 밖입니다.
  return fail(new ApiError("not_found", "아직 제공하지 않는 엔드포인트입니다."));
}
