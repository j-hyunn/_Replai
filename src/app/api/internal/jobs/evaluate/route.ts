import { after } from "next/server";
import { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { handle, readJson, requireJobSecret } from "@/lib/api/route";
import { sessionStatusOf, type SessionRow } from "@/lib/api/serialize";
import { publicEnv } from "@/lib/env.public";
import { serverEnv } from "@/lib/env.server";
import { failSession, settleEvaluatedSession } from "@/lib/session/lifecycle";
import { applyTransition, type Admin } from "@/lib/session/store";
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
 * ## 재시도 구동자는 **이 파일 안에 있습니다** (QA R1)
 *
 * 계약 6.2절은 "I2의 되돌림은 `enqueueEvaluation`을 부르지 않는다"고 못박습니다 —
 * 부르면 `attempt_count`가 리셋되며 무한 루프가 됩니다. 그래서 되돌림만 하고 아무도 다시
 * 집지 않으면 **세션이 `completed`에 영구 정지**합니다. 재시도는 **I2가 직접** 합니다(6.4절):
 *
 * | 경로 | 동작 |
 * |---|---|
 * | 백오프 ≤ 15초 · 소프트 데드라인 여유 있음 | **같은 호출 안에서** `sleep` 후 `completed → evaluating`으로 되집어 이어서 돌립니다 |
 * | 그 외(대기가 길거나 남은 시간이 부족) | **자기 재호출**(`after()` + `JOB_SECRET` fetch)로 넘깁니다. 새 호출이 되집습니다 |
 * | 자기 재호출마저 실패 | **`failed`로 내립니다.** `completed`에 방치하는 경로를 남기지 않습니다 |
 * | 위 어느 것도 못 돌았을 때(함수가 통째로 죽음) | C1 크론의 워치독이 같은 규칙으로 다시 집습니다 |
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
/** 계약 6.4절 — attempt 1 실패 → 2초, attempt 2 실패 → 8초. */
const RETRY_BACKOFF_MS = [2_000, 8_000];
/** 6.4절 — 이보다 긴 대기는 **함수 안에서 자지 않습니다.** 실행 시간을 그대로 태우는 짓입니다. */
const INLINE_SLEEP_MAX_MS = 15_000;
/** 재시도 1회에 필요한 최악 시간(평가자 50초). 소프트 데드라인 안에 들어가는지 판단할 때 씁니다. */
const EVALUATOR_BUDGET_MS = 60_000;

const bodySchema = z.object({
  sessionId: z.uuid(),
  evaluationId: z.uuid(),
  attempt: z.number().int().min(1).max(MAX_EVALUATOR_ATTEMPTS).default(1),
  stage: z.enum(["full", "coach_only"]).default("full"),
  /** 자기 재호출이 넘겨 주는 백오프 잔여 대기(ms). 15초를 넘기지 않습니다. */
  delayMs: z.number().int().min(0).max(INLINE_SLEEP_MAX_MS).default(0),
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

    // 자기 재호출이 넘긴 백오프 잔여분. 15초 상한이라 실행 시간을 의미 있게 갉아먹지 않습니다.
    if (body.delayMs > 0) await sleep(body.delayMs);

    let session = await loadSession(admin, body.sessionId);

    // **재시도 재진입점입니다.** 이전 호출이 29행(`evaluating → completed`)으로 되돌려 둔
    // 세션을 여기서 다시 집습니다. `enqueueEvaluation`을 부르지 않으므로 `evaluations` 행도
    // `attempt_count`도 그대로입니다(6.2절 주의 문단).
    session = await resumeEvaluating(session, admin);
    if (sessionStatusOf(session) !== "evaluating") return ok();

    // ── 1단계: 평가 (stage='coach_only'이면 건너뜁니다) ─────────────────────
    if (body.stage === "full") {
      const outcome = await runEvaluatorWithRetries({
        session,
        attemptCount: claimed.attempt_count,
        evaluationId: body.evaluationId,
        startedAt,
        admin,
      });
      // 재시도를 넘겼거나(handed_off) 소진해 `failed`로 내린 경우, 이 호출은 여기서 끝입니다.
      if (outcome.kind !== "succeeded") return ok();
      session = outcome.session;
    }

    // 소프트 데드라인 — 넘겼으면 **새 단계를 시작하지 않고** 함수를 정상 종료합니다.
    // `status='running'`으로 남은 평가는 게으른 워치독과 C1이 집습니다.
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

async function loadSession(admin: Admin, sessionId: string): Promise<SessionRow> {
  const { data, error } = await admin
    .from("interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !data) throw new ApiError("not_found", "세션을 찾을 수 없습니다.");
  return data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `completed`로 되돌려 둔 재시도 대기 세션을 다시 `evaluating`으로 집습니다 (전이 표 26행).
 *
 * **`enqueueEvaluation`이 아닙니다.** 새 `evaluations` 행을 만들지 않고 `attempt_count`도
 * 건드리지 않습니다 — 그 둘이 리셋되면 재시도 상한이 의미를 잃고 무한 루프가 됩니다.
 * 이미 `evaluating`이면 아무것도 하지 않습니다(정상 최초 진입).
 */
async function resumeEvaluating(session: SessionRow, admin: Admin): Promise<SessionRow> {
  if (sessionStatusOf(session) !== "completed") return session;

  return applyTransition({
    sessionId: session.id,
    from: "completed",
    to: "evaluating",
    trigger: "system_error",
    eventName: "evaluation_retry_started",
    patch: {},
    admin,
  });
}

type EvaluatorOutcome =
  | { kind: "succeeded"; session: SessionRow }
  /** 다음 호출로 넘겼습니다. 이 호출은 여기서 끝냅니다. */
  | { kind: "handed_off" }
  /** 재시도 3회 소진 — 세션을 `failed`로 내렸습니다. */
  | { kind: "failed" };

/**
 * 평가자 단계 + **재시도 구동** (계약 6.4절 · QA R1).
 *
 * 실패할 때마다 29행(`evaluating → completed`)으로 되돌리고 `attempt_count`를 올립니다.
 * **되돌린 뒤 반드시 다음 구동자를 남깁니다** — 같은 호출 안의 재개, 자기 재호출, 그마저
 * 실패하면 `failed`. 되돌리기만 하고 끝나는 경로는 존재하지 않습니다.
 */
async function runEvaluatorWithRetries(input: {
  session: SessionRow;
  attemptCount: number;
  evaluationId: string;
  startedAt: number;
  admin: Admin;
}): Promise<EvaluatorOutcome> {
  const { evaluationId, startedAt, admin } = input;
  let session = input.session;
  let attempt = input.attemptCount;

  for (;;) {
    try {
      await runEvaluatorPasses();
      return { kind: "succeeded", session };
    } catch (evaluatorError) {
      console.error("[evaluate] 평가 단계가 실패했습니다", {
        sessionId: session.id,
        attempt,
        evaluatorError,
      });

      if (attempt >= MAX_EVALUATOR_ATTEMPTS) {
        await exhaust(session, evaluationId, admin);
        return { kind: "failed" };
      }

      const next = attempt + 1;
      const delay = RETRY_BACKOFF_MS[next - 2] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];

      await admin
        .from("evaluations")
        .update({ attempt_count: next })
        .eq("id", evaluationId)
        .eq("status", "running");

      // 전이 표 29행 — 되돌림. `session_events`에 남겨야 지표 2의 분모가 유지됩니다.
      session = await applyTransition({
        sessionId: session.id,
        from: "evaluating",
        to: "completed",
        trigger: "system_error",
        eventName: "evaluation_retry_scheduled",
        detail: { attempt: next, delayMs: delay },
        patch: {},
        admin,
      });

      const fitsInThisCall =
        delay <= INLINE_SLEEP_MAX_MS &&
        Date.now() - startedAt + delay + EVALUATOR_BUDGET_MS <= SOFT_DEADLINE_MS;

      if (!fitsInThisCall) {
        handOffRetry(session, evaluationId, next, delay, admin);
        return { kind: "handed_off" };
      }

      await sleep(delay);
      session = await resumeEvaluating(session, admin);
      attempt = next;
    }
  }
}

/** 재시도 소진 — `evaluations`를 닫고 세션을 `failed`로 내립니다(반납 6지점 #5, 전량). */
async function exhaust(session: SessionRow, evaluationId: string, admin: Admin): Promise<void> {
  await admin
    .from("evaluations")
    .update({ status: "failed", finished_at: new Date().toISOString() })
    .eq("id", evaluationId)
    .eq("status", "running");

  await failSession(session, "evaluation_failed", "system_error", "evaluation_failed", admin);
}

/**
 * 다음 시도를 **새 함수 호출**로 넘깁니다.
 *
 * **`after()`로 띄웁니다** — 이 응답을 돌려준 뒤에 돌아야 다음 호출의 실행 시간이 이 호출의
 * 실행 시간 안으로 들어오지 않습니다(`enqueueEvaluation`과 같은 이유이며, await하지 않은
 * promise는 함수 종료와 함께 잘립니다). **띄우지 못하면 `failed`로 내립니다**: 되돌아온 세션을
 * 아무도 집지 않는 상태로 두는 것이 R1이 지적한 영구 정지이며, 정확한 실패가 침묵보다 낫습니다
 * (사용자는 리포트 화면의 재시도 버튼 #16으로 다시 시작할 수 있습니다).
 */
function handOffRetry(
  session: SessionRow,
  evaluationId: string,
  attempt: number,
  delayMs: number,
  admin: Admin,
): void {
  after(async () => {
    const started = await startEvaluationRetry(session.id, evaluationId, attempt, delayMs);
    if (started) return;

    console.error("[evaluate] 재시도 호출을 띄우지 못했습니다 — failed로 내립니다", {
      sessionId: session.id,
      attempt,
    });
    await exhaust(session, evaluationId, admin);
  });
}

const HANDOFF_MAX_ATTEMPTS = 3;

async function startEvaluationRetry(
  sessionId: string,
  evaluationId: string,
  attempt: number,
  delayMs: number,
): Promise<boolean> {
  for (let tries = 1; tries <= HANDOFF_MAX_ATTEMPTS; tries += 1) {
    try {
      const response = await fetch(`${publicEnv.siteUrl}/api/internal/jobs/evaluate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-job-secret": serverEnv().JOB_SECRET,
        },
        body: JSON.stringify({
          sessionId,
          evaluationId,
          attempt,
          stage: "full",
          delayMs: Math.min(delayMs, INLINE_SLEEP_MAX_MS),
        }),
      });
      if (response.ok) return true;
    } catch (error) {
      console.error("[evaluate] 재시도 호출에 실패했습니다", { sessionId, tries, error });
    }
  }
  return false;
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
