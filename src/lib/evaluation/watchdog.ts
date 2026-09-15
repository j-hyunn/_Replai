import "server-only";

import { after } from "next/server";

import { sessionStatusOf, type SessionRow } from "@/lib/api/serialize";
import { publicEnv } from "@/lib/env.public";
import { serverEnv } from "@/lib/env.server";
import { failSession, settleEvaluatedSession } from "@/lib/session/lifecycle";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Admin } from "@/lib/session/store";

/**
 * 게으른 워치독 (계약 6.5절 **1겹**).
 *
 * `01_state_machine.md`는 "`evaluating`에 10분 이상 머문 세션은 워치독이 `failed`로 내린다"고
 * 규정하지만 무료 플랜에는 분 단위 크론이 없습니다. 그래서 **두 겹**으로 근사하고, 이 파일이
 * 그중 **1순위**입니다 — `GET /api/sessions/[sessionId]`(#4)와 `GET .../evaluation`(#17)이
 * 불릴 때마다 판정합니다.
 *
 * **1순위인 이유:** 이 판정이 필요한 유일한 순간은 사용자가 결과를 기다리는 순간이고, 그때는
 * 반드시 조회 요청이 들어옵니다. 크론(2겹, C1)을 1순위로 두면 요청이 없는 세션을 위해 하루치
 * 지연을 감수하게 됩니다.
 *
 * **조회 라우트를 막지 않습니다.** 여기서 던지는 예외는 전부 삼키고 원래 세션을 돌려줍니다 —
 * 워치독이 실패했다고 리포트 화면이 오류로 덮이면 사용자는 아무것도 할 수 없게 됩니다.
 * 그때는 C1이 같은 규칙으로 다시 집습니다.
 */

/** `evaluations.attempt_count`는 **평가자 시도만** 셉니다(계약 6.4절 · `04_data_layer.md` 3.7절). */
export const MAX_EVALUATOR_ATTEMPTS = 3;

type RunningEvaluation = { id: string; attempt_count: number; started_at: string };

export function evaluationCutoffIso(): string {
  const minutes = serverEnv().WATCHDOG_EVALUATING_TIMEOUT_MIN;
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

/**
 * I2를 띄웁니다. **응답을 기다리지 않습니다** — 기다리는 순간 평가자의 25~50초가 조회 라우트의
 * 실행 시간에 들어옵니다. `after()`로 감싸지 않으면 await하지 않은 promise가 함수 종료와 함께
 * 잘려 나갑니다.
 */
export async function startEvaluationWorker(input: {
  sessionId: string;
  evaluationId: string;
  attempt: number;
  stage: "full" | "coach_only";
  delayMs?: number;
}): Promise<boolean> {
  try {
    const response = await fetch(`${publicEnv.siteUrl}/api/internal/jobs/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-job-secret": serverEnv().JOB_SECRET,
      },
      body: JSON.stringify({
        sessionId: input.sessionId,
        evaluationId: input.evaluationId,
        attempt: Math.min(Math.max(input.attempt, 1), MAX_EVALUATOR_ATTEMPTS),
        stage: input.stage,
        delayMs: input.delayMs ?? 0,
      }),
    });
    return response.ok;
  } catch (error) {
    console.error("[watchdog] 평가 워커 호출에 실패했습니다", { sessionId: input.sessionId, error });
    return false;
  }
}

/**
 * 조회 라우트가 부르는 판정 한 줄. **부작용이 있으면 갱신된 세션 행**을, 없으면 받은 행을 그대로
 * 돌려줍니다.
 *
 * | 상황 | 동작 |
 * |---|---|
 * | `evaluating`이 아님 | 아무것도 하지 않습니다 |
 * | 10분을 넘지 않음 | 아무것도 하지 않습니다 |
 * | `running` 평가 없음 + `succeeded` 평가 있음 | 빠진 28행(`evaluating → evaluated`)만 대신 밟습니다 |
 * | `running` 평가 없음 + 성공 기록도 없음 | `failed`(30행) |
 * | 재시도 잔여 있음 | I2 재기동 |
 * | 재시도 소진 | `evaluations`를 `failed`로 닫고 세션도 `failed` |
 */
export async function applyLazyWatchdog(
  session: SessionRow,
  admin: Admin = createAdminClient(),
): Promise<SessionRow> {
  if (sessionStatusOf(session) !== "evaluating") return session;

  const cutoff = evaluationCutoffIso();
  // 세션 `updated_at`에도 시한 가드를 겁니다(크론 워치독 3과 같은 형태 · QA R10). I2는
  // `evaluations`를 `succeeded`로 닫은 **직후** 정산 전이를 하므로, 그 사이 수 ms 동안
  // "`evaluating` + `running` 없음"이 성립합니다. 이 창을 그대로 훑으면 **방금 평가에 성공한
  // 세션이 `failed`로 떨어집니다.**
  if (session.updated_at > cutoff) return session;

  try {
    const running = await loadRunningEvaluation(admin, session.id);

    if (!running) {
      // 평가는 이미 성공했는데 정산 전이만 못 돈 세션입니다(I2가 그 사이에 죽음).
      // 여기서 `failed`로 내리면 **이미 저장된 점수·인용을 버리는 셈**입니다.
      const settled = await settleIfSucceeded(session, admin);
      if (settled) return settled;

      return await failSession(
        session,
        "evaluation_failed",
        "timeout",
        "evaluation_failed",
        admin,
      );
    }

    if (running.started_at > cutoff) return session;

    if (running.attempt_count >= MAX_EVALUATOR_ATTEMPTS) {
      await admin
        .from("evaluations")
        .update({ status: "failed", finished_at: new Date().toISOString() })
        .eq("id", running.id)
        .eq("status", "running");

      return await failSession(
        session,
        "evaluation_failed",
        "timeout",
        "evaluation_failed",
        admin,
      );
    }

    // 재시도 잔여가 있으면 다시 띄웁니다. 못 띄워도 `failed`로 내리지 않습니다 —
    // 잔여가 있는 세션을 플랫폼 사정만으로 죽이게 됩니다. 다음 조회나 C1이 다시 집습니다.
    after(() =>
      startEvaluationWorker({
        sessionId: session.id,
        evaluationId: running.id,
        attempt: running.attempt_count,
        stage: "full",
      }),
    );

    return session;
  } catch (error) {
    // **조회를 막지 않습니다.** 경합으로 409가 나는 것은 정상입니다(다른 경로가 먼저 처리).
    console.error("[watchdog] 게으른 판정을 건너뜁니다", { sessionId: session.id, error });
    return session;
  }
}

export async function loadRunningEvaluation(
  admin: Admin,
  sessionId: string,
): Promise<RunningEvaluation | null> {
  const { data } = await admin
    .from("evaluations")
    .select("id, attempt_count, started_at")
    .eq("session_id", sessionId)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

/** 최신 평가가 `succeeded`면 정산 전이(28행)를 대신 밟습니다. 밟았으면 갱신된 행. */
async function settleIfSucceeded(session: SessionRow, admin: Admin): Promise<SessionRow | null> {
  const { data } = await admin
    .from("evaluations")
    .select("id")
    .eq("session_id", session.id)
    .eq("status", "succeeded")
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return settleEvaluatedSession(session, admin);
}
