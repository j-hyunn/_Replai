import "server-only";

import { after } from "next/server";

import { ApiError } from "@/lib/api/errors";
import { sessionStatusOf, type SessionRow } from "@/lib/api/serialize";
import { publicEnv } from "@/lib/env.public";
import { serverEnv } from "@/lib/env.server";
import { releaseSessionQuota } from "@/lib/quota/gate";
import { FUNDING_SOURCES, type FundingSource } from "@/lib/session/status";
import { applyTransition, type Admin } from "@/lib/session/store";
import type { TransitionTrigger } from "@/lib/session/transitions";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 세션 종료 계열 전이와 **예약 반납**을 한곳에 모읍니다 (`05_api_contract.md` 4.7.3절).
 *
 * ## 반납 6지점 — 빠뜨리면 여력이 새고, 두 번 부르면 여력이 부풀어 오릅니다
 *
 * | # | 지점 | 이 파일의 함수 |
 * |---|---|---|
 * | 1 | `→ completed` (#15 · #9 종료 조건 · C1) | `completeSession()` — **부분 반납(6을 남김)** |
 * | 2 | I2 코치 단계 완료 → `evaluated` | `settleEvaluatedSession()` — 잔여 전부(정산) |
 * | 3 | #33 `cancel` (7개 전이 전부) | `cancelSession()` |
 * | 4 | C1 `paused → abandoned` | `abandonSession()` |
 * | 5 | I2 재시도 소진·I1 플래너 실패·#35 | `failSession()` |
 * | 6 | C1 만료 예약 스윕 | 크론이 직접(`reason: 'expired'`) |
 *
 * **1번과 2번은 같은 세션에서 순서대로 둘 다 일어납니다.** 1번이 일어났다고 2번을 건너뛰면
 * 세션당 6이 영구히 샙니다 — 1번은 행을 `held`로 남기고 `reserved`를 `consumed + 6`으로
 * 줄일 뿐이며, 그 6을 마저 가져가는 것이 2번입니다.
 *
 * **행 삭제(#23 · #31)에는 반납 호출을 두지 않습니다.** `before delete` 트리거가 이미 반납하므로
 * 라우트가 한 번 더 부르면 이중 반납이 됩니다.
 */

/** DB의 `text` 컬럼을 재원 유니온으로 좁힙니다. 게이트의 진입부 가드가 이 값을 봅니다. */
export function fundingSourceOf(session: Pick<SessionRow, "funding_source">): FundingSource {
  const found = FUNDING_SOURCES.find((candidate) => candidate === session.funding_source);
  if (!found) {
    // 여기 오면 CHECK 제약이 뚫렸다는 뜻입니다. 추측해서 `trial_shared`로 떨어뜨리면
    // BYOK 세션이 공용 원장을 갉아먹기 시작합니다.
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", {
      cause: `계약에 없는 funding_source 값입니다: ${session.funding_source}`,
    });
  }
  return found;
}

const statusOf = sessionStatusOf;

// ── 1번 · 부분 반납 + 평가 등록 ───────────────────────────────────────────────

export type CompleteTrigger = Extract<
  TransitionTrigger,
  "user_action" | "ai_completion" | "scheduler"
>;

/**
 * `→ completed` (#15 · #9 종료 조건 · C1 1단계).
 *
 * 순서가 중요합니다.
 * 1. `completed`로 전이 + `ended_at` 기록
 * 2. **부분 반납** — `flash_lite`에서 `reserved − consumed − 6`. 6은 평가자 4 + 코치 2의 몫이라
 *    남깁니다. 전량 반납하면 완주한 세션이 **리포트를 만들 여력을 잃습니다**(D34).
 * 3. `enqueueEvaluation` — `completed → evaluating`. **두 전이 모두 `session_events`에 남깁니다.**
 *
 * 반환되는 세션의 `status`는 정상 경로에서 **`evaluating`** 입니다(D18). 프론트가 `completed`를
 * 기대하는 분기를 두면 깨집니다.
 */
export async function completeSession(
  session: SessionRow,
  trigger: CompleteTrigger,
  eventName: string,
  admin: Admin = createAdminClient(),
): Promise<SessionRow> {
  const fundingSource = fundingSourceOf(session);

  const completed = await applyTransition({
    sessionId: session.id,
    from: statusOf(session),
    to: "completed",
    trigger,
    eventName,
    patch: { ended_at: session.ended_at ?? new Date().toISOString() },
    admin,
  });

  // 반납 6지점 #1 — **부분 반납**입니다(`reason: 'completed'`가 게이트에서 `p_keep = 6`이 됩니다).
  await releaseSessionQuota(session.id, fundingSource, ["flash_lite"], "completed", admin);

  return enqueueEvaluation(completed, trigger, admin);
}

// ── 평가 등록 (`completed → evaluating`) ──────────────────────────────────────

const ENQUEUE_MAX_ATTEMPTS = 3;

/**
 * 평가 등록 — **`→ completed` 전이의 서버 부작용**입니다 (D18, 계약 6.2절).
 *
 * 클라이언트가 시작하지 않습니다. `paused` 7일 자동 종료 경로에는 **클라이언트가 아예 존재하지
 * 않기 때문**입니다 — 그 세션들이 영원히 `completed`에 갇히는 것을 막는 것이 이 설계입니다.
 *
 * **멱등입니다.** 진입 시 상태가 `completed`(또는 #16 경로의 `failed`)가 아니면 아무것도 하지
 * 않고 돌아옵니다. #9의 종료 판정과 #15가 경합해도 평가는 한 번만 등록됩니다.
 */
export async function enqueueEvaluation(
  session: SessionRow,
  trigger: CompleteTrigger,
  admin: Admin = createAdminClient(),
): Promise<SessionRow> {
  const from = statusOf(session);
  if (from !== "completed" && from !== "failed") return session;

  const { data: evaluation, error } = await admin
    .from("evaluations")
    .insert({
      session_id: session.id,
      status: "running",
      attempt_count: 1,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !evaluation) {
    // 등록 실패는 세션을 `completed`에 방치하지 않습니다 — `failed`로 내려 재시도(#16) 진입점을 줍니다.
    return failSession(
      session,
      "evaluation_enqueue_failed",
      trigger === "scheduler" ? "scheduler" : "system_error",
      "evaluation_enqueue_failed",
      admin,
    );
  }

  const evaluating = await applyTransition({
    sessionId: session.id,
    from,
    to: "evaluating",
    trigger,
    eventName: "evaluation_enqueued",
    patch: {},
    admin,
  });

  // **응답을 기다리지 않습니다.** 이 fetch는 사용자 요청과 분리된 새 함수 호출을 띄울 뿐이며,
  // 기다리는 순간 평가자의 25~50초가 이 라우트의 실행 시간에 들어와 설계가 무너집니다.
  // `after()`로 감싸지 않으면 await하지 않은 promise가 함수 종료와 함께 잘려 나갑니다.
  after(() => startEvaluationWorker(session.id, evaluation.id));

  return evaluating;
}

/** 남은 **유일한** 유실 지점입니다. 실패하면 게으른 워치독과 일 1회 크론이 다시 집습니다. */
async function startEvaluationWorker(sessionId: string, evaluationId: string): Promise<void> {
  for (let attempt = 1; attempt <= ENQUEUE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${publicEnv.siteUrl}/api/internal/jobs/evaluate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-job-secret": serverEnv().JOB_SECRET,
        },
        body: JSON.stringify({ sessionId, evaluationId, attempt: 1, stage: "full" }),
      });
      if (response.ok) return;
    } catch (error) {
      console.error("[lifecycle] 평가 워커 기동에 실패했습니다", { sessionId, attempt, error });
    }
  }
  // 여기까지 왔으면 `evaluations.status='running'`이 큐 역할을 하고 워치독이 이어받습니다.
  console.error("[lifecycle] 평가 워커를 띄우지 못했습니다 — 워치독이 이어받습니다", { sessionId });
}

// ── 2번 · 정산 반납 ──────────────────────────────────────────────────────────

/**
 * `evaluating → evaluated` — **I2 코치 단계가 끝나는 시점**(성공·실패 무관)입니다.
 * 코치 실패는 리포트 실패가 아닙니다 — 점수·인용은 이미 커밋돼 있고 `summary`만 `null`입니다.
 *
 * 여기서 **잔여 전량을 정산 반납**합니다(반납 6지점 #2). 1번의 부분 반납이 남긴 6을 가져가는
 * 유일한 지점이며, 건너뛰면 세션당 6이 그날 내내 묶입니다.
 */
export async function settleEvaluatedSession(
  session: SessionRow,
  admin: Admin = createAdminClient(),
): Promise<SessionRow> {
  const fundingSource = fundingSourceOf(session);

  const evaluated = await applyTransition({
    sessionId: session.id,
    from: statusOf(session),
    to: "evaluated",
    trigger: "ai_completion",
    eventName: "evaluation_completed",
    patch: {},
    admin,
  });

  // 반납 6지점 #2 — 전량(정산). `p_keep = 0`이라 1번이 남긴 6까지 돌아옵니다.
  await releaseSessionQuota(session.id, fundingSource, null, "settled", admin);

  return evaluated;
}

// ── 3번 · 취소 ───────────────────────────────────────────────────────────────

/**
 * #33 `POST .../cancel` — **종료 상태로 보냅니다.** 삭제(#23)와 다른 경로입니다(D19).
 * 행은 남고 `turns`·`questions`도 유지되며 평가는 등록하지 않습니다.
 */
export async function cancelSession(
  session: SessionRow,
  admin: Admin = createAdminClient(),
): Promise<SessionRow> {
  const fundingSource = fundingSourceOf(session);

  const canceled = await applyTransition({
    sessionId: session.id,
    from: statusOf(session),
    to: "canceled",
    trigger: "user_action",
    eventName: "session_canceled",
    // **`ended_at`은 비어 있을 때만 채웁니다.** `failed`·`abandoned`처럼 종료 시각이 이미 있는
    // 세션을 취소하며 덮어쓰면 지표 1의 세션 길이가 실제보다 길게 기록됩니다.
    patch: session.ended_at ? {} : { ended_at: new Date().toISOString() },
    admin,
  });

  // 반납 6지점 #3 — 전량. 멱등이므로 `failed → canceled`처럼 이미 반납된 세션에서도 안전합니다
  // (DB 함수가 `status='held'` 행만 대상으로 합니다).
  await releaseSessionQuota(session.id, fundingSource, null, "canceled", admin);

  return canceled;
}

// ── 4번 · 자동 중단 ──────────────────────────────────────────────────────────

/** C1 `paused → abandoned` (7일 경과 · 답변한 주질문 = 0). */
export async function abandonSession(
  session: SessionRow,
  admin: Admin = createAdminClient(),
): Promise<SessionRow> {
  const fundingSource = fundingSourceOf(session);

  const abandoned = await applyTransition({
    sessionId: session.id,
    from: statusOf(session),
    to: "abandoned",
    trigger: "scheduler",
    eventName: "session_abandoned",
    patch: { ended_at: session.ended_at ?? new Date().toISOString() },
    admin,
  });

  // 반납 6지점 #4 — 전량.
  await releaseSessionQuota(session.id, fundingSource, null, "abandoned", admin);

  return abandoned;
}

// ── 5번 · 실패 ───────────────────────────────────────────────────────────────

/** `failureReason` 값 목록은 계약 12.1절입니다. DB CHECK가 없으므로 **이 타입이 계약**입니다. */
export type FailureReason =
  | "document_extraction_failed"
  | "evaluation_enqueue_failed"
  | "evaluation_failed"
  | "provider_permanent_error"
  | "context_corrupted";

/** I2 재시도 소진 · I1 플래너 실패 · #35 `abandon-preparation` · 평가 등록 실패. */
export async function failSession(
  session: SessionRow,
  failureReason: FailureReason,
  trigger: TransitionTrigger,
  eventName: string,
  admin: Admin = createAdminClient(),
): Promise<SessionRow> {
  const fundingSource = fundingSourceOf(session);

  const failed = await applyTransition({
    sessionId: session.id,
    from: statusOf(session),
    to: "failed",
    trigger,
    eventName,
    patch: {
      failure_reason: failureReason,
      ended_at: session.ended_at ?? new Date().toISOString(),
    },
    admin,
  });

  // 반납 6지점 #5 — 전량. 예약이 잡혀 있지 않았다면(=`prepare` 전) 0행을 지나갑니다.
  await releaseSessionQuota(session.id, fundingSource, null, "failed", admin);

  return failed;
}
