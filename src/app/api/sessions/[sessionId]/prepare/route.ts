import { after } from "next/server";

import { ApiError } from "@/lib/api/errors";
import { accepted } from "@/lib/api/respond";
import { handle, loadOwnedSession } from "@/lib/api/route";
import { sessionStatusOf, type PreparationState } from "@/lib/api/serialize";
import { CURRENT_TRIAL_CONSENT_VERSION } from "@/lib/consent/trial-consent";
import { publicEnv } from "@/lib/env.public";
import { serverEnv } from "@/lib/env.server";
import { reserveSessionQuota } from "@/lib/quota/gate";
import { fundingSourceOf } from "@/lib/session/lifecycle";
import { recordObservationEvent } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #6 `POST /api/sessions/[sessionId]/prepare` — 확정 예약 + 플래너 체이닝.
 *
 * **전이는 여기서 일어나지 않습니다.** `configuring → ready`는 플래너 워커(I1)가 스냅샷과
 * 오프닝 질문을 커밋한 뒤에 수행합니다. 이 라우트는 202를 돌려주고 끝납니다.
 *
 * 가드 순서는 계약 4.9.2절 순서도 그대로이며 **바꾸면 안 됩니다**:
 *
 * ```
 * 1. 설정·추출 가드            → 409 guard_failed
 * 2. (trial_shared) 동의 — 현재 버전 → 409 trial_consent_required
 * 3. (byok) 키 유효성           → 409 byok_key_invalid
 * 4. 확정 예약                  → 409 trial_reservation_exists / 503 capacity_unavailable
 * 5. quota_reserved 이벤트 → I1 체이닝 → 202
 * ```
 *
 * 어느 단계에서 막히든 **전이하지 않고 세션은 `configuring`에 남으며 설정이 보존됩니다** —
 * 내일 그대로 이어서 준비할 수 있습니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// `byok`일 때 키 확인이 붙지만 플래너는 **기다리지 않고 체이닝**합니다.
export const maxDuration = 15;

export type PrepareAccepted = {
  sessionId: string;
  status: "configuring";
  preparation: PreparationState;
};

export function POST(
  _request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/prepare">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { user, session, supabase } = await loadOwnedSession(sessionId);

    const from = sessionStatusOf(session);
    if (from !== "configuring") {
      throw new ApiError("invalid_transition", "지금 상태에서는 할 수 없는 동작입니다.", {
        details: { from, to: "ready" },
      });
    }

    // ── 1. 설정·추출 가드 ────────────────────────────────────────────────────
    await assertPreparable(session, supabase);

    const fundingSource = fundingSourceOf(session);
    // RLS 우회가 필요한 이유: trial_consents는 select만 정책이 있고 user_api_keys는 정책이
    // 0개이며, 원장 함수 4종은 service_role 전용입니다(04 5.2절·3.15절).
    const admin = createAdminClient();

    if (fundingSource === "trial_shared") {
      // ── 2. 동의 — **현재 문구 버전까지 대조합니다 (R9)** ────────────────────
      //
      // DB 트리거는 **동의 행의 존재만** 봅니다 — 현재 버전이 애플리케이션 상수라 DB가 알 수
      // 없기 때문입니다. 문구를 올린 뒤 **옛 버전 동의만 가진 사용자는 DB 층을 통과합니다.**
      // 여기서 버전을 대조하지 않으면 D29가 실질적으로 깨집니다.
      // **DB는 마지막 방어선이지 유일한 방어선이 아닙니다.**
      const { data: consent } = await admin
        .from("trial_consents")
        .select("id")
        .eq("user_id", user.id)
        .eq("consent_version", CURRENT_TRIAL_CONSENT_VERSION)
        .maybeSingle();

      if (!consent) {
        throw new ApiError(
          "trial_consent_required",
          "체험 면접을 시작하기 전에 데이터 처리 동의가 필요합니다.",
          { details: { requiredConsentVersion: CURRENT_TRIAL_CONSENT_VERSION } },
        );
      }
    } else {
      // ── 3. 키 유효성 ────────────────────────────────────────────────────────
      // 실패해도 **전이하지 않고 세션은 `configuring`에 남습니다** — 면접 전이라
      // `paused(byok_key_invalid)`로 가지 않습니다(전이 표 15행의 담당은 #9입니다).
      const { data: key } = await admin
        .from("user_api_keys")
        .select("key_last4, status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!key || key.status !== "connected") {
        throw new ApiError("byok_key_invalid", "연결하신 키로 접속할 수 없었어요.", {
          details: { keyLast4: key?.key_last4 ?? null },
        });
      }
    }

    // ── 4. 확정 예약 — **원자적이며 권위입니다** ─────────────────────────────
    // `byok` 세션은 게이트 진입부에서 NO_OP으로 통과합니다(원장을 읽지도 잡지도 않습니다).
    // 실패는 `ApiError`로 올라오며(409 `trial_reservation_exists` / 503 `capacity_unavailable`)
    // 잡지 않고 그대로 응답합니다.
    const reservation = await reserveSessionQuota(session.id, fundingSource, { admin });

    // ── 5. 관측 + 체이닝 ─────────────────────────────────────────────────────
    if (reservation.applicable) {
      await recordObservationEvent(
        session.id,
        "configuring",
        "quota_reserved",
        "user_action",
        { quotaDate: reservation.quotaDate },
        admin,
      );
    }

    // 플래너가 도는 8~20초 동안 화면이 "준비 중"을 보여야 합니다. 새 상태 값도 새 컬럼도
    // 만들지 않고 이 이벤트에서 파생합니다(계약 12.2절).
    await recordObservationEvent(
      session.id,
      "configuring",
      "planner_started",
      "user_action",
      null,
      admin,
    );

    // **응답을 기다리지 않습니다.** 기다리면 플래너의 8~20초가 이 라우트의 실행 시간이 됩니다.
    after(() => startPlannerWorker(session.id));

    const body: PrepareAccepted = {
      sessionId: session.id,
      // 즉시 응답의 status는 **아직 `configuring`** 입니다. `ready`를 기대하는 분기를 두면 깨집니다.
      status: "configuring",
      preparation: { state: "running", errorCode: null, updatedAt: new Date().toISOString() },
    };

    return accepted(body);
  });
}

type OwnedSession = Awaited<ReturnType<typeof loadOwnedSession>>;

/**
 * 전이 표 5행의 가드: 직군·페르소나·모달리티·이력서·JD가 **모두 있고** 두 문서의
 * `extraction_status = 'succeeded'`.
 *
 * 못 채우면 409 `guard_failed` + `details.guard`입니다 — 무엇이 빠졌는지 프론트가 알아야
 * 사용자를 정확한 입력 칸으로 보낼 수 있습니다.
 */
async function assertPreparable(
  session: OwnedSession["session"],
  supabase: OwnedSession["supabase"],
): Promise<void> {
  const missing = (
    [
      ["job_role", session.job_role],
      ["persona", session.persona],
      ["resume_document_id", session.resume_document_id],
      ["jd_document_id", session.jd_document_id],
    ] as const
  ).find(([, value]) => value === null);

  if (missing) {
    throw new ApiError("guard_failed", "면접 준비에 필요한 설정이 아직 비어 있습니다.", {
      details: { guard: `missing:${missing[0]}` },
    });
  }

  const documentIds = [session.resume_document_id, session.jd_document_id].filter(
    (id): id is string => id !== null,
  );

  const { data: documents, error } = await supabase
    .from("documents")
    .select("id, extraction_status")
    .in("id", documentIds);

  if (error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
  }

  if (documents.length !== documentIds.length) {
    throw new ApiError("guard_failed", "선택한 문서를 찾을 수 없습니다.", {
      details: { guard: "document_missing" },
    });
  }

  const unfinished = documents.find((doc) => doc.extraction_status !== "succeeded");
  if (unfinished) {
    throw new ApiError("guard_failed", "문서 텍스트 추출이 아직 끝나지 않았습니다.", {
      details: { guard: "extraction_not_succeeded", documentId: unfinished.id },
    });
  }
}

/** I1 체이닝. 실패하면 `preparation.state`가 `running`에 머물고 사용자가 다시 준비를 누릅니다. */
async function startPlannerWorker(sessionId: string): Promise<void> {
  try {
    await fetch(`${publicEnv.siteUrl}/api/internal/jobs/plan`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-job-secret": serverEnv().JOB_SECRET,
      },
      body: JSON.stringify({ sessionId }),
    });
  } catch (error) {
    console.error("[prepare] 플래너 워커 기동에 실패했습니다", { sessionId, error });
  }
}
