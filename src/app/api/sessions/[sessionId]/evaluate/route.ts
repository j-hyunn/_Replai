import { ApiError } from "@/lib/api/errors";
import { accepted } from "@/lib/api/respond";
import { handle, loadOwnedSession } from "@/lib/api/route";
import { sessionStatusOf } from "@/lib/api/serialize";
import { EVALUATE_RETRY_CALLS, reserveRetryQuota } from "@/lib/quota/gate";
import { enqueueEvaluation, fundingSourceOf } from "@/lib/session/lifecycle";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #16 `POST /api/sessions/[sessionId]/evaluate` — **`failed` 재시도 전용**입니다 (D18, 계약 6.3절).
 *
 * 정상 경로의 평가 등록은 **서버 부작용**(`enqueueEvaluation`)이고, 클라이언트가 평가를 시작하는
 * 경로는 이 하나뿐입니다. 그래서 상태별 응답이 좁습니다.
 *
 * | 세션 status | 응답 |
 * |---|---|
 * | `failed` + `failureReason`이 평가 계열 + `turns` 존재 | **202 `EvaluationJobAccepted`** |
 * | `failed` + 그 외 사유(예: `document_extraction_failed`) | 409 `invalid_transition` |
 * | `completed`·`evaluating`·`evaluated`·그 외 전부 | 409 `invalid_transition` |
 *
 * > **UI는 리포트 화면 진입 시 이 라우트를 자동 호출하지 않습니다.** 자동 호출은 정상 경로에서
 * > **항상 409**를 받으므로 "실패하면 [평가 시작하기]" 같은 폴백은 언제나 죽은 버튼을 그립니다.
 * > 재시도 버튼은 `status === 'failed'`이고 `failureReason`이 평가 계열일 때만 그립니다.
 *
 * **즉시 응답과 최종 결과는 다른 타입입니다**(계약 3절). 이 응답에는 `axes`도 `overallScore`도
 * **물리적으로 없습니다** — 최종 결과는 #17로 따로 옵니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** 이 두 사유에서만 재시도가 의미를 갖습니다 (계약 12.1절). */
const RETRYABLE_FAILURE_REASONS = ["evaluation_failed", "evaluation_enqueue_failed"] as const;

/** Realtime이 죽었을 때의 폴백 폴링 간격(계약 3절 — 기본 3000ms, 지수 증가 상한 15000ms). */
const POLL_AFTER_MS = 3_000;

export function POST(
  _request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/evaluate">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { session } = await loadOwnedSession(sessionId);

    const from = sessionStatusOf(session);
    const invalid = () =>
      new ApiError("invalid_transition", "지금 상태에서는 할 수 없는 동작입니다.", {
        details: { from, to: "evaluating" },
      });

    // 전이 표 32행(`failed → evaluating`)이 이 라우트의 전부입니다. 31행(`evaluated → evaluating`)은
    // 전이 표 자신이 `[later]`로 적어 둔 행이라 여기서도 409입니다.
    if (from !== "failed") throw invalid();

    const reason = session.failure_reason;
    if (reason === null || !RETRYABLE_FAILURE_REASONS.some((value) => value === reason)) {
      // 예: `document_extraction_failed` — 평가를 다시 돌릴 대상이 아닙니다(계약 4.4절).
      throw invalid();
    }

    // RLS 우회가 필요한 이유: `interview_sessions`·`evaluations`·`session_events`에는
    // 클라이언트 쓰기 정책이 없습니다(04_data_layer.md 5.1절 3항).
    const admin = createAdminClient();

    // 평가할 대화가 없으면 재시도해도 같은 결과입니다.
    const { count } = await admin
      .from("turns")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id)
      .eq("role", "candidate");

    if ((count ?? 0) === 0) throw invalid();

    // 계약 4.7.4절 — 체험 세션이면 `flash_lite` 4를 **여기서 다시 예약**합니다.
    // 실패하면 503이 던져지고 **세션은 `failed`에 그대로 남습니다**(전이하지 않습니다).
    // `byok`은 게이트 진입부 가드에서 no-op이라 이 줄을 지나가기만 합니다.
    await reserveRetryQuota(
      session.id,
      fundingSourceOf(session),
      "flash_lite",
      EVALUATE_RETRY_CALLS,
      admin,
    );

    // `enqueueEvaluation`이 새 `evaluations` 행(`attempt_count = 1`)을 만들고 32행 전이를 수행한
    // 뒤 I2를 띄웁니다. **재시도 카운터가 여기서 초기화되는 것은 의도입니다** — 사용자가 누른
    // 재시도는 새로운 3회짜리 시도이고, I2 내부의 되돌림 재시도와는 다른 층위입니다.
    const updated = await enqueueEvaluation(session, "user_action", admin);

    if (sessionStatusOf(updated) !== "evaluating") {
      // 등록 자체가 실패해 `failed`로 되돌아온 경우입니다(`enqueueEvaluation`의 실패 경로).
      throw new ApiError("internal_error", "평가를 시작하지 못했습니다.");
    }

    const { data: evaluation } = await admin
      .from("evaluations")
      .select("id, attempt_count")
      .eq("session_id", updated.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!evaluation) {
      throw new ApiError("internal_error", "평가를 시작하지 못했습니다.");
    }

    return accepted({
      sessionId: updated.id,
      // `'evaluated'`가 여기 올 일은 없습니다 — 이 응답은 **작업 접수**이지 결과가 아닙니다.
      status: "evaluating" as const,
      evaluationId: evaluation.id,
      attempt: evaluation.attempt_count,
      pollAfterMs: POLL_AFTER_MS,
    });
  });
}
