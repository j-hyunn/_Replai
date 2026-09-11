import { compound } from "@/lib/api/respond";
import { handle, requireCronSecret } from "@/lib/api/route";
import { sessionStatusOf, type SessionRow } from "@/lib/api/serialize";
import { publicEnv } from "@/lib/env.public";
import { serverEnv } from "@/lib/env.server";
import { currentQuotaDate } from "@/lib/quota/quota-date";
import {
  abandonSession,
  completeSession,
  enqueueEvaluation,
  failSession,
  releaseExpiredReservation,
} from "@/lib/session/lifecycle";
import { applyTransition, loadSessionDerived, type Admin } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * C1 `GET /api/cron/daily` — 일 1회 워치독 **5종** (계약 4.1절 · `05_deploy.md` 5절).
 *
 * `Authorization: Bearer ${CRON_SECRET}` 검사가 **이 라우트의 유일한 인증**입니다(미들웨어는
 * 크론 경로를 통과시킵니다). Hobby 크론은 하루 1회가 상한이고 ±59분 오차가 있습니다.
 *
 * | # | 워치독 | 하는 일 |
 * |---|---|---|
 * | 1 | `paused` 7일 | 답변한 주질문 ≥ 1이면 `completed`(24행, **평가 등록까지**), 0이면 `abandoned`(23행) |
 * | 2 | `in_progress` 방치 | `updated_at`이 `max_duration_min + 30분`보다 오래면 `paused(connection_lost)`(17행) |
 * | 3 | `evaluating` 지연 | `evaluations.started_at`이 10분보다 오래면 재시도 잔여 시 I2 재기동, 소진 시 `failed`(30행) |
 * | 4 | `completed` 고아 | 평가가 등록됐는데(또는 등록조차 안 됐는데) 아무도 집지 않은 세션을 다시 굴립니다 |
 * | 5 | 만료 예약 | 어제 이전 날짜의 `held` 예약 행을 `expired`로 반납합니다(반납 6지점 #6) |
 *
 * **3·4번이 QA R1의 마지막 안전망입니다.** I2는 자기 재시도와 자기 재호출로 스스로 굴러가지만,
 * 함수가 통째로 죽으면(배포 중 종료·플랫폼 상한) 그 자리에 구동자가 없습니다. 그때 세션이
 * `completed`/`evaluating`에 영구히 머무르지 않게 하는 것이 이 두 워치독입니다.
 *
 * **멱등입니다.** 같은 날 두 번 돌아도 각 전이는 조건부 UPDATE(`where status = from`)라
 * 두 번째 호출은 대상 0건을 지나갑니다. 못 끝낸 잔여는 다음 날 이어서 처리됩니다.
 */

// 05_api_contract.md 11.1절 — 전 라우트 nodejs
export const runtime = "nodejs";
// 인증 응답이 캐시되면 남의 데이터가 보입니다.
export const dynamic = "force-dynamic";
// vercel.json 과 **같은 값**으로 둡니다. 한쪽만 두면 파일이 옮겨졌을 때
// 조용히 기본값으로 떨어집니다 (05_deploy.md 2.2절).
export const maxDuration = 240;

/** 한 번에 처리하는 배치 크기. 못 끝낸 잔여는 다음 날 이어서 처리합니다(멱등). */
const BATCH = 200;
/** 상한 240초와의 여유. 넘기면 **새 항목을 시작하지 않고** 지금까지의 결과를 반환합니다. */
const SOFT_DEADLINE_MS = 210_000;
const MAX_EVALUATOR_ATTEMPTS = 3;

type WatchdogReport = {
  pausedAutoClosed: number;
  pausedAbandoned: number;
  connectionLost: number;
  evaluationRedriven: number;
  evaluationFailed: number;
  reservationsExpired: number;
};

export function GET(request: Request) {
  return handle(async () => {
    requireCronSecret(request);
    const startedAt = Date.now();
    const admin = createAdminClient();

    const report: WatchdogReport = {
      pausedAutoClosed: 0,
      pausedAbandoned: 0,
      connectionLost: 0,
      evaluationRedriven: 0,
      evaluationFailed: 0,
      reservationsExpired: 0,
    };

    const overdue = (): boolean => Date.now() - startedAt > SOFT_DEADLINE_MS;

    if (!overdue()) await sweepPausedSessions(admin, report);
    if (!overdue()) await sweepStaleInProgress(admin, report);
    if (!overdue()) await sweepEvaluating(admin, report);
    if (!overdue()) await sweepOrphanCompleted(admin, report);
    if (!overdue()) await sweepExpiredReservations(admin, report);

    return compound({ ok: true as const, watchdogs: report });
  });
}

// ── 1 · `paused` 7일 (전이 표 23·24행) ───────────────────────────────────────

async function sweepPausedSessions(admin: Admin, report: WatchdogReport): Promise<void> {
  const days = serverEnv().PAUSED_AUTO_CLOSE_DAYS;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await admin
    .from("interview_sessions")
    .select("*")
    .eq("status", "paused")
    .lt("updated_at", cutoff)
    .limit(BATCH);

  for (const session of data ?? []) {
    try {
      const derived = await loadSessionDerived(session.id, "paused", admin);
      if (derived.answeredMainQuestionCount >= 1) {
        // 24행 — **평가 등록까지 함께 일어납니다**(D18). 이 경로에는 클라이언트가 없으므로
        // 여기서 등록하지 않으면 그 세션들은 영원히 리포트를 받지 못합니다.
        await completeSession(session, "scheduler", "session_auto_completed", admin);
        report.pausedAutoClosed += 1;
      } else {
        await abandonSession(session, admin);
        report.pausedAbandoned += 1;
      }
    } catch (error) {
      logSkip("paused", session.id, error);
    }
  }
}

// ── 2 · `in_progress` 방치 (전이 표 17행) ────────────────────────────────────

/**
 * 하트비트가 없으므로 **시간 상한 + 30분**으로 근사합니다(계약 14절 2번).
 * 정상적으로 진행 중인 세션은 턴마다 `updated_at`이 갱신되므로 여기 걸리지 않습니다.
 */
async function sweepStaleInProgress(admin: Admin, report: WatchdogReport): Promise<void> {
  const { data } = await admin
    .from("interview_sessions")
    .select("*")
    .eq("status", "in_progress")
    .limit(BATCH);

  for (const session of data ?? []) {
    const staleAfterMs = (session.max_duration_min + 30) * 60 * 1000;
    if (Date.now() - Date.parse(session.updated_at) < staleAfterMs) continue;

    try {
      await applyTransition({
        sessionId: session.id,
        from: "in_progress",
        to: "paused",
        trigger: "scheduler",
        eventName: "session_connection_lost",
        patch: {
          pause_reason: "connection_lost",
          paused_at: new Date().toISOString(),
          resumable_after: null,
        },
        admin,
      });
      report.connectionLost += 1;
    } catch (error) {
      logSkip("in_progress", session.id, error);
    }
  }
}

// ── 3 · `evaluating` 지연 (전이 표 30행 · 계약 6.5절 2겹) ────────────────────

async function sweepEvaluating(admin: Admin, report: WatchdogReport): Promise<void> {
  const cutoff = evaluationCutoffIso();

  const { data } = await admin
    .from("interview_sessions")
    .select("*")
    .eq("status", "evaluating")
    .limit(BATCH);

  for (const session of data ?? []) {
    const running = await loadRunningEvaluation(admin, session.id);
    // 실행 중 평가가 없는데 `evaluating`이면 워커가 죽은 것입니다 — 재등록 대상입니다.
    if (!running) {
      await redriveOrFail(admin, session, null, report);
      continue;
    }
    if (running.started_at > cutoff) continue;

    await redriveOrFail(admin, session, running, report);
  }
}

// ── 4 · `completed` 고아 ─────────────────────────────────────────────────────

/**
 * `completed`에 머물러 있는 세션 — R1이 지적한 영구 정지 자리입니다.
 *
 * I2의 재시도 되돌림(29행)도 이 상태를 거치므로, **되돌린 직후의 세션까지 크론이 낚아채지
 * 않도록** `updated_at`이 워치독 시한보다 오래된 것만 봅니다.
 */
async function sweepOrphanCompleted(admin: Admin, report: WatchdogReport): Promise<void> {
  const cutoff = evaluationCutoffIso();

  const { data } = await admin
    .from("interview_sessions")
    .select("*")
    .eq("status", "completed")
    .lt("updated_at", cutoff)
    .limit(BATCH);

  for (const session of data ?? []) {
    const running = await loadRunningEvaluation(admin, session.id);

    if (!running) {
      // 평가가 아예 등록되지 않았습니다(등록 트랜잭션이 깨졌거나 워커 기동 전에 죽음).
      try {
        await enqueueEvaluation(session, "scheduler", admin);
        report.evaluationRedriven += 1;
      } catch (error) {
        logSkip("completed", session.id, error);
      }
      continue;
    }

    await redriveOrFail(admin, session, running, report);
  }
}

// ── 5 · 만료 예약 스윕 (반납 6지점 #6) ───────────────────────────────────────

async function sweepExpiredReservations(admin: Admin, report: WatchdogReport): Promise<void> {
  const { data } = await admin
    .from("ai_quota_reservations")
    .select("session_id")
    .eq("status", "held")
    .lt("quota_date", currentQuotaDate())
    .limit(BATCH);

  const sessionIds = [...new Set((data ?? []).map((row) => row.session_id))];

  for (const sessionId of sessionIds) {
    try {
      const { data: session } = await admin
        .from("interview_sessions")
        .select("status")
        .eq("id", sessionId)
        .maybeSingle();
      if (!session) continue;

      await releaseExpiredReservation(sessionId, sessionStatusOf(session), admin);
      report.reservationsExpired += 1;
    } catch (error) {
      logSkip("reservation", sessionId, error);
    }
  }
}

// ── 공통 ─────────────────────────────────────────────────────────────────────

type EvaluationRow = { id: string; attempt_count: number; started_at: string };

function evaluationCutoffIso(): string {
  const minutes = serverEnv().WATCHDOG_EVALUATING_TIMEOUT_MIN;
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

async function loadRunningEvaluation(
  admin: Admin,
  sessionId: string,
): Promise<EvaluationRow | null> {
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

/**
 * 재시도 잔여가 있으면 **I2를 다시 띄우고**, 소진됐으면 `failed`로 내립니다 (계약 6.5절 1겹과
 * 같은 규칙입니다 — 게으른 워치독이 아직 없는 지금은 이 크론이 유일한 구동자입니다).
 */
async function redriveOrFail(
  admin: Admin,
  session: SessionRow,
  evaluation: EvaluationRow | null,
  report: WatchdogReport,
): Promise<void> {
  try {
    if (!evaluation) {
      await failSession(session, "evaluation_failed", "scheduler", "evaluation_failed", admin);
      report.evaluationFailed += 1;
      return;
    }

    if (evaluation.attempt_count >= MAX_EVALUATOR_ATTEMPTS) {
      await admin
        .from("evaluations")
        .update({ status: "failed", finished_at: new Date().toISOString() })
        .eq("id", evaluation.id)
        .eq("status", "running");
      await failSession(session, "evaluation_failed", "scheduler", "evaluation_failed", admin);
      report.evaluationFailed += 1;
      return;
    }

    const started = await startEvaluationWorker(session.id, evaluation.id, evaluation.attempt_count);
    if (started) {
      report.evaluationRedriven += 1;
      return;
    }

    // 띄우지 못했으면 다음 날 다시 시도합니다 — 여기서 `failed`로 내리면 재시도 잔여가 있는
    // 세션을 플랫폼 사정만으로 죽이게 됩니다.
    console.error("[cron] 평가 워커 재기동에 실패했습니다", { sessionId: session.id });
  } catch (error) {
    logSkip("evaluation", session.id, error);
  }
}

async function startEvaluationWorker(
  sessionId: string,
  evaluationId: string,
  attempt: number,
): Promise<boolean> {
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
        attempt: Math.min(Math.max(attempt, 1), MAX_EVALUATOR_ATTEMPTS),
        stage: "full",
      }),
    });
    return response.ok;
  } catch (error) {
    console.error("[cron] 평가 워커 호출에 실패했습니다", { sessionId, error });
    return false;
  }
}

/**
 * **한 세션의 실패가 배치를 멈추지 않습니다.** 크론은 아무도 보지 않는 세션들의 안전망이라,
 * 하나가 경합으로 409를 맞았다고 나머지를 버리면 그날치 회수가 통째로 사라집니다.
 */
function logSkip(kind: string, id: string, error: unknown): void {
  console.error(`[cron] ${kind} 처리를 건너뜁니다`, { id, error });
}
