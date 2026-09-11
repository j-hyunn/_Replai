import { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { handle, readJson, requireJobSecret } from "@/lib/api/route";
import { sessionStatusOf, type SessionRow } from "@/lib/api/serialize";
import { failSession, settleEvaluatedSession } from "@/lib/session/lifecycle";
import { applyTransition } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * I2 `POST /api/internal/jobs/evaluate` — **유일한 평가 워커**입니다 (D31).
 *
 * 한 호출 안에서 **평가자 → 코치를 순차 실행**합니다. 별도의 코치 워커(구 I3)는 삭제됐고,
 * `/api/internal/jobs/coach` 경로는 404입니다 — 옛 경로를 남겨 두면 `JOB_SECRET`만 알면
 * 코치를 단독 호출할 수 있는 문이 하나 더 열린 채로 남습니다.
 *
 * **1단계와 2단계는 서로 다른 try/catch 블록이며 한 트랜잭션으로 묶지 않습니다.** 코치에서
 * 던져진 예외가 평가 결과를 되돌리면 안 됩니다 — 점수·인용은 이미 커밋됐고, 코치 실패의
 * 정의는 "`summary`가 `null`인 채로 `evaluated`"입니다.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⚙️ **`ai-interview-architect`의 연결 지점입니다.**
 * `runEvaluatorPasses()`·`runCoachPass()` 두 자리에 `_workspace/02_prompts/{evaluator,coach}.md`의
 * 호출과 저장(`evaluation_scores`·`evaluation_citations`·`coach_payload`)이 들어갑니다.
 * **상태 머신·재시도·반납 배선은 이미 계약대로이며 손대지 않아도 됩니다** — 특히
 * `settleEvaluatedSession()`(반납 6지점 #2, 정산 반납)의 호출 위치를 옮기지 마세요.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

/** 상한 240초와의 차이 30초는 **실패를 기록할 시간**입니다. 상한에 잘리면 catch도 finally도 돕니다. */
const SOFT_DEADLINE_MS = 210_000;
/** `evaluations.attempt_count`는 **평가자 시도만** 셉니다. 코치는 이 컬럼을 건드리지 않습니다. */
const MAX_EVALUATOR_ATTEMPTS = 3;

const bodySchema = z.object({
  sessionId: z.uuid(),
  evaluationId: z.uuid(),
  attempt: z.number().int().min(1).max(MAX_EVALUATOR_ATTEMPTS).default(1),
  stage: z.enum(["full", "coach_only"]).default("full"),
});

export function POST(request: Request) {
  return handle(async () => {
    requireJobSecret(request);
    const body = await readJson(request, bodySchema);
    const startedAt = Date.now();

    // RLS 우회가 필요한 이유: 내부 워커에는 사용자 쿠키가 없고 평가 계열 쓰기 정책도 없습니다.
    const admin = createAdminClient();

    // **같은 평가가 두 번 실행되지 않게 선점합니다.** 조건부 UPDATE의 갱신 행 수가 0이면
    // 다른 호출이 이미 집은 것이므로 즉시 끝냅니다.
    const { data: claimed } = await admin
      .from("evaluations")
      .update({ started_at: new Date().toISOString() })
      .eq("id", body.evaluationId)
      .eq("status", "running")
      .select("id, attempt_count")
      .maybeSingle();

    if (!claimed) return ok();

    const session = await loadSession(admin, body.sessionId);
    if (sessionStatusOf(session) !== "evaluating") return ok();

    // ── 1단계: 평가 (stage='coach_only'이면 건너뜁니다) ─────────────────────
    if (body.stage === "full") {
      try {
        await runEvaluatorPasses();
      } catch (evaluatorError) {
        return handleEvaluatorFailure(session, claimed.attempt_count, evaluatorError, admin);
      }
    }

    // 소프트 데드라인 — 넘겼으면 **새 단계를 시작하지 않고** 함수를 정상 종료합니다.
    // `status='running'`으로 남은 평가는 게으른 워치독이 집습니다.
    if (Date.now() - startedAt > SOFT_DEADLINE_MS) return ok();

    // ── 2단계: 코치 ─────────────────────────────────────────────────────────
    // **성공·실패 어느 쪽이든** 세션은 `evaluated`가 됩니다. 코치 실패는 리포트 실패가 아닙니다.
    try {
      await runCoachPass();
    } catch (coachError) {
      console.error("[evaluate] 코치 단계가 실패했습니다", {
        sessionId: session.id,
        coachError,
      });
    }

    await admin
      .from("evaluations")
      .update({ status: "succeeded", finished_at: new Date().toISOString() })
      .eq("id", body.evaluationId);

    // **반납 6지점 #2 — 정산 반납.** `→ completed`의 부분 반납이 남긴 6을 여기서 가져갑니다.
    // 이 호출을 건너뛰면 세션당 6이 그날 내내 묶이고, 크론의 만료 스윕에서야 회수됩니다.
    await settleEvaluatedSession(session, admin);

    return ok();
  });
}

type Admin = ReturnType<typeof createAdminClient>;

async function loadSession(admin: Admin, sessionId: string): Promise<SessionRow> {
  const { data, error } = await admin
    .from("interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !data) throw new ApiError("not_found", "세션을 찾을 수 없습니다.");
  return data;
}

/**
 * 평가 실패의 처리 — 재시도 잔여가 있으면 `completed`로 되돌리고, 소진되면 `failed`입니다.
 *
 * **되돌리기는 `enqueueEvaluation`을 부르지 않습니다.** 워커의 내부 되돌림이 등록을 다시
 * 트리거하면 `attempt_count`가 리셋되며 무한 루프가 됩니다.
 */
async function handleEvaluatorFailure(
  session: SessionRow,
  attemptCount: number,
  error: unknown,
  admin: Admin,
): Promise<ReturnType<typeof ok>> {
  console.error("[evaluate] 평가 단계가 실패했습니다", { sessionId: session.id, error });

  if (attemptCount < MAX_EVALUATOR_ATTEMPTS) {
    await admin
      .from("evaluations")
      .update({ attempt_count: attemptCount + 1 })
      .eq("session_id", session.id)
      .eq("status", "running");

    await applyTransition({
      sessionId: session.id,
      from: "evaluating",
      to: "completed",
      trigger: "system_error",
      eventName: "evaluation_retry_scheduled",
      patch: {},
      admin,
    });
    return ok();
  }

  await admin
    .from("evaluations")
    .update({ status: "failed", finished_at: new Date().toISOString() })
    .eq("session_id", session.id)
    .eq("status", "running");

  // 반납 6지점 #5 — 전량. 재시도가 소진됐으므로 남은 여력을 붙들고 있을 이유가 없습니다.
  await failSession(session, "evaluation_failed", "system_error", "evaluation_failed", admin);
  return ok();
}

// ── AI 단계 (다음 라운드 연결 지점) ──────────────────────────────────────────

/**
 * 평가자 패스 A + 패스 B → `evaluations`·`evaluation_scores`·`evaluation_citations` 저장.
 *
 * 아직 프롬프트가 연결되지 않았습니다. **여기서 던지면 위의 재시도·`failed` 경로가 그대로
 * 돌아가므로 예약이 방치되지 않습니다** — 점수를 지어내 저장하는 것보다 정확한 실패가 낫습니다.
 * 인용 오프셋은 **JS UTF-16 기준**이며, 저장 전 `quote_start`를 Postgres 문자 함수에 넣지 마세요.
 */
async function runEvaluatorPasses(): Promise<void> {
  await Promise.resolve();
  throw new Error("evaluator_not_wired");
}

/** 코치 → `summary`/`improvements`/`coach_payload` + 축별 `improvement` UPDATE. */
async function runCoachPass(): Promise<void> {
  await Promise.resolve();
  throw new Error("coach_not_wired");
}
