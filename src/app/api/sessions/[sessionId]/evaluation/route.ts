import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle, loadOwnedSession } from "@/lib/api/route";
import { toEvaluationDto, type EvaluationDto } from "@/lib/api/serialize";
import { applyLazyWatchdog } from "@/lib/evaluation/watchdog";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #17 `GET /api/sessions/[sessionId]/evaluation` — 리포트 본문 (계약 3·6.5·6.6·12.3절).
 *
 * ## `evaluation: null`은 오류가 아닙니다
 *
 * 아직 `evaluations` 행이 없을 뿐입니다(=`completed`). **404를 쓰지 않습니다** — 세션은 존재하고
 * 평가만 아직 없기 때문입니다. 프론트는 `null`을 "리포트 준비 중" 화면으로 처리합니다.
 *
 * ## 이 호출은 조회만 하지 않습니다 — 두 가지 부작용이 있습니다
 *
 * 1. **게으른 워치독**(6.5절 1겹) — `evaluating`에 10분 넘게 머문 세션을 여기서 판정합니다.
 *    사용자가 대기 화면에 있으면 폴링·재조회가 이 검사를 자동으로 돌립니다.
 * 2. **`report_first_viewed_at`**(6.6절, 지표 2) — `evaluation != null`을 반환하는 **최초 1회**에만
 *    기록합니다. 별도 라우트를 두지 않은 이유는 UI가 호출을 잊으면 북극성 직전 지표가 통째로
 *    비기 때문입니다. **리포트 화면에서 이 훅을 건너뛰는 최적화를 하면 안 됩니다.**
 *
 * `myFeedback`·`myDisputes`는 **호출한 본인의 것만** 실립니다(D20, 12.3절). 이름이 `my*`인
 * 이유이며, 이것이 있어야 새로고침 뒤에도 "접수되었습니다"가 남아 지표 5가 중복으로 오염되지
 * 않습니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export function GET(
  _request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/evaluation">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { user, session, supabase } = await loadOwnedSession(sessionId);

    // RLS 우회가 필요한 이유: 워치독이 세션 상태를 옮기고 `report_first_viewed_at`을 쓰는데,
    // `interview_sessions`·`evaluations`에는 클라이언트 쓰기 정책이 없습니다(04 5.1절 3항).
    const admin = createAdminClient();
    const current = await applyLazyWatchdog(session, admin);

    // 읽기는 **`server.ts`(anon + 쿠키)** 로 합니다 — 평가 계열 3종에 select 정책이 있어
    // RLS가 소유권의 두 번째 그물이 됩니다.
    const { data: evaluation, error } = await supabase
      .from("evaluations")
      .select("*")
      .eq("session_id", current.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
    }
    if (!evaluation) {
      // `null`은 정상입니다. 세션은 존재하고 평가만 아직 없습니다.
      return single<"evaluation", EvaluationDto | null>("evaluation", null);
    }

    const [scores, citations, feedback, disputes] = await Promise.all([
      supabase.from("evaluation_scores").select("*").eq("evaluation_id", evaluation.id),
      supabase.from("evaluation_citations").select("*").eq("session_id", current.id),
      // RLS가 이미 본인 것만 보여주지만 `user_id`를 함께 걸어 의도를 코드에도 남깁니다.
      supabase
        .from("report_feedback")
        .select("*")
        .eq("session_id", current.id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("score_disputes")
        .select("*")
        .eq("session_id", current.id)
        .eq("user_id", user.id)
        // 계약 12.3절 — `myDisputes`는 `createdAt` 오름차순입니다.
        .order("created_at", { ascending: true }),
    ]);

    const failure = scores.error ?? citations.error ?? feedback.error ?? disputes.error;
    if (failure) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: failure });
    }

    await markReportViewed(admin, current.id, current.report_first_viewed_at);

    return single(
      "evaluation",
      toEvaluationDto({
        evaluation,
        scores: scores.data ?? [],
        citations: citations.data ?? [],
        feedback: feedback.data,
        disputes: disputes.data ?? [],
      }),
    );
  });
}

/**
 * 지표 2 — **최초 1회만** 기록합니다. 이미 값이 있으면 건드리지 않습니다.
 *
 * 조건부 UPDATE(`is('report_first_viewed_at', null)`)라 두 탭이 동시에 열어도 한 번만 기록됩니다.
 * 실패해도 던지지 않습니다 — 지표 한 줄 때문에 리포트가 안 열리는 편이 더 나쁩니다.
 */
async function markReportViewed(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string,
  current: string | null,
): Promise<void> {
  if (current !== null) return;

  const { error } = await admin
    .from("interview_sessions")
    .update({ report_first_viewed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("report_first_viewed_at", null);

  if (error) {
    console.error("[evaluation] 최초 열람 시각을 남기지 못했습니다", { sessionId, error });
  }
}
