import { after } from "next/server";

import { ApiError } from "@/lib/api/errors";
import { accepted } from "@/lib/api/respond";
import { handle, loadOwnedSession } from "@/lib/api/route";
import { sessionStatusOf } from "@/lib/api/serialize";
import { startEvaluationWorker } from "@/lib/evaluation/watchdog";
import { COACH_RETRY_CALLS, reserveRetryQuota } from "@/lib/quota/gate";
import { fundingSourceOf } from "@/lib/session/lifecycle";
import { recordObservationEvent } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #18 `POST /api/sessions/[sessionId]/coach/retry` — 코치 단계만 다시 돌립니다 (D31, 계약 4절 #18).
 *
 * ## 상태 전이가 없습니다
 *
 * 세션은 `evaluated`에 그대로 머뭅니다. 점수·인용은 이미 커밋돼 있고 이 경로가 채우는 것은
 * `summary`·`improvements`·`coach_payload`·축별 `improvement`뿐입니다 — **점수를 건드리는
 * UPDATE가 아닙니다.** 코치 실패는 리포트 실패가 아니고(판정 기준은 `summary` 하나),
 * 재시도가 실패해도 리포트는 계속 열람 가능합니다.
 *
 * ## 진입점은 I2입니다
 *
 * D31로 코치 워커(구 I3)가 삭제됐으므로 `{ stage: 'coach_only' }`로 **같은 워커**를 부릅니다.
 * `/api/internal/jobs/coach` 경로는 404이며, 그것이 의도입니다 — 옛 경로를 남겨 두면
 * `JOB_SECRET`만 알면 코치를 단독 호출할 수 있는 문이 하나 더 열린 채로 남습니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export function POST(
  _request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/coach/retry">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { session } = await loadOwnedSession(sessionId);

    const from = sessionStatusOf(session);
    if (from !== "evaluated") {
      // 코치를 다시 돌릴 수 있는 상태는 하나뿐입니다. `evaluating`이면 지금 돌고 있고,
      // `failed`면 점수 자체가 없어 코치가 읽을 것이 없습니다.
      throw new ApiError("invalid_transition", "지금 상태에서는 할 수 없는 동작입니다.", {
        details: { from, to: "evaluated" },
      });
    }

    // RLS 우회가 필요한 이유: `evaluations`·`session_events`에 클라이언트 쓰기 정책이 없습니다.
    const admin = createAdminClient();

    const { data: evaluation, error } = await admin
      .from("evaluations")
      .select("id, status")
      .eq("session_id", session.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
    }
    if (!evaluation) throw new ApiError("not_found", "리포트를 찾을 수 없습니다.");

    if (evaluation.status === "running") {
      // 이미 누가 돌리고 있습니다. 두 번 띄우면 같은 평가에 코치 두 벌이 붙습니다.
      throw new ApiError("guard_failed", "코치 분석이 이미 진행 중입니다.", {
        details: { guard: "coach_already_running" },
      });
    }

    // 계약 4.7.4절 — 체험 세션이면 `flash_lite` 2를 다시 예약합니다. 실패하면 503이고
    // **리포트는 계속 열람 가능합니다**(세션도 평가도 건드리지 않았습니다).
    await reserveRetryQuota(
      session.id,
      fundingSourceOf(session),
      "flash_lite",
      COACH_RETRY_CALLS,
      admin,
    );

    // I2는 `status='running'`인 행만 선점합니다(조건부 UPDATE). 되돌려 두지 않으면 워커가
    // 아무것도 집지 못하고 조용히 끝납니다. **`attempt_count`는 건드리지 않습니다** —
    // 그 컬럼은 **평가자 시도만** 셉니다(계약 6.4절).
    const claimed = await admin
      .from("evaluations")
      .update({ status: "running", finished_at: null })
      .eq("id", evaluation.id)
      .neq("status", "running")
      .select("id")
      .maybeSingle();

    if (!claimed.data) {
      throw new ApiError("guard_failed", "코치 분석이 이미 진행 중입니다.", {
        details: { guard: "coach_already_running" },
      });
    }

    // 코치 시도는 `session_events`로만 관측합니다(D10). 상태가 바뀌지 않으므로
    // `from_status = to_status = 'evaluated'`인 **비전이 이벤트**입니다(계약 4.5절).
    await recordObservationEvent(
      session.id,
      from,
      "coach_retry_started",
      "user_action",
      { evaluationId: evaluation.id },
      admin,
    );

    // **응답을 기다리지 않습니다.** 코치의 20~40초가 이 라우트의 15초 상한에 들어오면 안 됩니다.
    after(() =>
      startEvaluationWorker({
        sessionId: session.id,
        evaluationId: evaluation.id,
        attempt: 1,
        stage: "coach_only",
      }),
    );

    return accepted({
      sessionId: session.id,
      evaluationId: evaluation.id,
      coachStatus: "running" as const,
    });
  });
}
