import { z } from "zod";

import { isDemoProviderConfigured } from "@/lib/ai/credentials";
import { runPlanner } from "@/lib/ai/planner";
import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle, readJson, requireUser } from "@/lib/api/route";
import { IDLE_PREPARATION, toSessionDto, type SessionRow } from "@/lib/api/serialize";
import {
  CURRENT_DEMO_CONSENT_VERSION,
  DEMO_CONSENT_TEXT,
  trialConsentTextSha256,
} from "@/lib/consent/trial-consent";
import {
  assertDemoEnabled,
  DEMO_NEW_ACCOUNT_COOLDOWN_MS,
  DEMO_SESSION_PARAMS,
} from "@/lib/demo/policy";
import { peekCapacity, reserveSessionQuota } from "@/lib/quota/gate";
import { nextQuotaResetAt, secondsUntilQuotaReset } from "@/lib/quota/quota-date";
import { JOB_ROLES, MODALITIES } from "@/lib/session/persona";
import { translateFundingRuleError } from "@/lib/session/funding-errors";
import { applyTransition, recordObservationEvent, recordSessionCreated } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #42 `POST /api/demo/sessions` — 데모 진입 (D35 · `01_state_machine.md` 2절 ※데모).
 *
 * **이 라우트는 두 전이를 한 요청에서 연달아 수행하고 `ready`를 돌려줍니다.**
 *
 * ```
 * (없음) → configuring        1.1행 — 세션 행 + 시드 스냅샷 2개 + 동의 기록
 *        → [예약 17] flash_lite_demo
 *        → [플래너]  오프닝 주질문 1개
 * configuring → ready         5행
 * ```
 *
 * ## 왜 202가 아니라 동기인가
 *
 * `/demo`에는 설정 화면이 없습니다. `configuring`인 채로 응답하면 `route-for-status`가 방문자를
 * **쓰지 않는 `/sessions/new`로 보냅니다.** 그래서 플래너를 `after()`로 체이닝하지 않고
 * **기다립니다**(#6과 다른 점이며, 이것이 데모에만 있는 차이의 전부입니다).
 *
 * ## 실패하면 행을 남기지 않습니다
 *
 * 체험 경로는 설정 입력을 보존하려고 세션을 `configuring`에 남기지만(D27), 데모에는 보존할
 * 입력이 없습니다. 예약 실패·플래너 실패는 **세션 행을 지우고** 끝냅니다 —
 * 남겨 두면 `demo_consumed_at`도 아닌데 쓸모없는 행만 쌓이고, 재입장이 막힙니다.
 * 행 삭제는 `ai_quota_reservations`의 `before delete` 트리거가 **예약을 원장에 반납**하므로
 * 여기서 `releaseSessionQuota()`를 부르지 않습니다(부르면 이중 반납입니다).
 *
 * ## 가드 순서 (바꾸지 마세요)
 *
 * ```
 * 1. 데모 플래그            → 404 not_found
 * 2. 익명 계정인가          → 403 forbidden
 * 3. 24시간 재입장 제한     → 409 demo_already_consumed (+ existingSessionId)
 * 4. 동의 버전              → 409 trial_consent_required / consent_version_stale
 * 5. 데모 키 존재           → 503 provider_unavailable
 * 6. 여력 사전 조회         → 503 capacity_unavailable
 * 7. 세션 생성 → 예약 → 플래너 → ready
 * ```
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 플래너를 **기다립니다**(8~20초). `vercel.json`의 같은 경로 항목과 **같은 값**으로 둡니다.
export const maxDuration = 120;

const bodySchema = z.object({
  jobRole: z.enum(JOB_ROLES),
  modality: z.enum(MODALITIES),
  /** `null`이면 "동의하지 않았다"입니다 — 값 불일치(옛 번들)와 구분해 다른 오류를 돌려줍니다. */
  consentVersion: z.string().min(1).max(20).nullish(),
});

export function POST(request: Request) {
  return handle(async () => {
    // ── 1. 데모 플래그 ────────────────────────────────────────────────────────
    assertDemoEnabled();

    // 익명 로그인은 **프런트가 먼저** 끝냅니다(`supabase.auth.signInAnonymously()`).
    // 여기 오는 사용자는 이미 `auth.uid()`를 가진 진짜 사용자이며, 익명인지 여부는
    // `profiles.account_type`으로 판정합니다(D35-2).
    const { user } = await requireUser();
    const body = await readJson(request, bodySchema);

    // RLS 우회가 필요한 이유: `interview_sessions`·`session_events`·`questions`에는 클라이언트
    // 쓰기 정책이 없고, `trial_consents`는 select 정책만 있으며, 원장 함수는 service_role 전용입니다.
    const admin = createAdminClient();

    // ── 2·3. 계정 유형과 24시간 재입장 제한 ───────────────────────────────────
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("account_type, demo_consumed_at, created_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: profileError });
    }
    if (!profile || profile.account_type !== "demo") {
      // 실계정은 데모를 쓰지 않습니다 — 체험 1회가 이미 주어져 있습니다.
      // DB 트리거도 `account_funding_mismatch:registered`로 같은 것을 막습니다.
      throw new ApiError("forbidden", "데모는 로그인하지 않은 방문자를 위한 기능입니다.", {
        details: { reason: "registered_account" },
      });
    }

    if (profile.demo_consumed_at !== null) {
      throw await alreadyConsumedError(admin, user.id);
    }

    // 장치 ② — 신규 익명 계정의 쿨다운 (D35-2). `reserve_session_quota`의 D30 가드가 `held`
    // 예약 1건으로 대부분을 막으므로, 이것은 "반납시키고 새로 잡는" 패턴에 대한 보강입니다.
    if (Date.now() - Date.parse(profile.created_at) < DEMO_NEW_ACCOUNT_COOLDOWN_MS) {
      const { data: existing } = await admin
        .from("interview_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("funding_source", "demo")
        .limit(1)
        .maybeSingle();

      if (existing) throw await alreadyConsumedError(admin, user.id);
    }

    // ── 4. 동의 (D35-3) ───────────────────────────────────────────────────────
    if (!body.consentVersion) {
      throw new ApiError("trial_consent_required", "데모를 시작하기 전에 데이터 처리 동의가 필요합니다.", {
        details: { requiredConsentVersion: CURRENT_DEMO_CONSENT_VERSION },
      });
    }
    // 옛 번들이 **옛 문구를 띄워 놓고** 동의를 기록하는 것을 막습니다(#41과 같은 규칙).
    if (body.consentVersion !== CURRENT_DEMO_CONSENT_VERSION) {
      throw new ApiError("consent_version_stale", "동의 문구가 업데이트되었습니다.", {
        details: { currentVersion: CURRENT_DEMO_CONSENT_VERSION },
      });
    }

    // ── 5. 데모 키 ────────────────────────────────────────────────────────────
    // 키 없이 진입시키면 세션과 예약이 만들어진 뒤 플래너에서 터집니다. 롤백은 되지만
    // 원인이 "환경변수 누락"이라는 사실이 로그에만 남습니다.
    if (!isDemoProviderConfigured()) {
      console.error("[demo] GEMINI_API_KEY_DEMO가 설정되지 않아 데모를 시작할 수 없습니다");
      throw new ApiError("provider_unavailable", "지금은 데모 면접을 진행할 수 없습니다.");
    }

    // ── 6. 여력 사전 조회 — **비원자적이며 권위가 아닙니다**(권위는 7의 예약) ──
    const capacity = await peekCapacity(user.id, "demo", admin);
    if (!capacity.hasCapacity) {
      throw demoCapacityError(capacity.availableAtIso);
    }

    // ── 7. 시드 문서 → 세션 → 동의 → 예약 → 플래너 → ready ────────────────────
    const seed = await loadSeedDocuments(admin, body.jobRole);
    // 동의 행이 **세션 INSERT보다 먼저** 있어야 합니다 — `enforce_session_funding_rules`가
    // 동의 존재를 INSERT에서 검사하기 때문입니다(`04_data_layer.md` 15.4절).
    await recordDemoConsent(admin, user.id);

    const session = await insertDemoSession(admin, user.id, body, seed);

    try {
      await recordSessionCreated(
        session.id,
        { fundingSource: "demo", jobRole: body.jobRole, seedVersion: seed.seedVersion },
        admin,
        // 1.1행 — 데모는 `created`를 거치지 않습니다.
        "configuring",
      );

      // 동의 행에 세션을 연결합니다. 실패해도 세션을 되돌리지 않습니다 —
      // 동의 사실은 이미 기록돼 있고, `session_id`는 참조 편의 값입니다.
      await admin
        .from("trial_consents")
        .update({ session_id: session.id })
        .eq("user_id", user.id)
        .eq("consent_version", CURRENT_DEMO_CONSENT_VERSION)
        .is("session_id", null);

      // 예약 — **원자적이며 권위입니다.** 요청량은 `{ flash_lite_demo: 17 }` 하나뿐이라
      // 체험 원장(`flash_lite`) 행을 읽지도·만들지도·잠그지도 않습니다.
      const reservation = await reserveSessionQuota(session.id, "demo", { admin });
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

      await recordObservationEvent(
        session.id,
        "configuring",
        "planner_started",
        "user_action",
        null,
        admin,
      );

      const planned = await runPlanner({
        session,
        resumeText: seed.resumeText,
        jdText: seed.jdText,
      });

      // 스냅샷은 INSERT에서 이미 채웠습니다(데모의 `configuring → ready` 가드가 그것을 봅니다).
      const ready = await applyTransition({
        sessionId: session.id,
        from: "configuring",
        to: "ready",
        trigger: "ai_completion",
        eventName: "planner_succeeded",
        admin,
      });

      const { error: questionError } = await admin.from("questions").insert({
        session_id: session.id,
        question_kind: "main",
        depth: 0,
        order_index: 1,
        question_text: planned.question_text,
        target_axis: planned.target_axis,
        probe_hints: planned.probe_hints,
      });

      if (questionError) {
        throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", {
          cause: questionError,
        });
      }

      return single(
        "session",
        toSessionDto(ready, {
          preparation: IDLE_PREPARATION,
          answeredMainQuestionCount: 0,
          turnCount: 0,
        }),
        { status: 201 },
      );
    } catch (error) {
      // **전체 롤백** — 행을 남기지 않습니다. `before delete` 트리거가 예약을 반납합니다.
      await rollbackDemoSession(admin, session.id);
      throw asDemoFailure(error);
    }
  });
}

type Admin = ReturnType<typeof createAdminClient>;
type DemoBody = z.infer<typeof bodySchema>;
type Seed = { resumeText: string; jdText: string; seedVersion: string };

/**
 * 시드 이력서·JD를 읽습니다. `demo_documents`는 **사용자 데이터가 아니라 우리가 쓴 픽스처**이며
 * `unique (job_role, doc_type)`이 "직군당 정확히 2건"을 보장합니다(D35-3).
 */
async function loadSeedDocuments(admin: Admin, jobRole: string): Promise<Seed> {
  const { data, error } = await admin
    .from("demo_documents")
    .select("doc_type, body_text, seed_version")
    .eq("job_role", jobRole);

  if (error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
  }

  const resume = data.find((row) => row.doc_type === "resume");
  const jd = data.find((row) => row.doc_type === "job_description");

  if (!resume || !jd) {
    // 시드가 빠진 직군은 **사용자 잘못이 아닙니다.** 마이그레이션이 덜 적용된 상태이므로
    // 400이 아니라 503이고, 로그로 운영자에게 알립니다.
    console.error("[demo] 시드 문서가 없습니다", { jobRole });
    throw new ApiError("provider_unavailable", "지금은 데모 면접을 진행할 수 없습니다.");
  }

  return { resumeText: resume.body_text, jdText: jd.body_text, seedVersion: resume.seed_version };
}

/** 데모 동의를 기록합니다. 같은 버전 재동의는 멱등입니다(`(user_id, consent_version)` unique). */
async function recordDemoConsent(admin: Admin, userId: string): Promise<void> {
  const { data: existing } = await admin
    .from("trial_consents")
    .select("id")
    .eq("user_id", userId)
    .eq("consent_version", CURRENT_DEMO_CONSENT_VERSION)
    .maybeSingle();

  if (existing) return;

  // **해시는 서버가 계산합니다** — 클라이언트가 보내면 본 적 없는 문구에 대한 해시를 기록할 수
  // 있습니다. 대상은 애플리케이션 상수의 데모 문구(공백 정규화 후)입니다.
  const consentTextSha256 = await trialConsentTextSha256(DEMO_CONSENT_TEXT);

  const { error } = await admin.from("trial_consents").insert({
    user_id: userId,
    consent_version: CURRENT_DEMO_CONSENT_VERSION,
    consent_text_sha256: consentTextSha256,
    session_id: null,
  });

  if (error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
  }
}

/**
 * 데모 세션 INSERT. **`resume_document_id`·`jd_document_id`는 NULL이고 스냅샷 2개만 채웁니다** —
 * 예외 처리가 아니라 D6(문서는 스냅샷) 설계를 그대로 쓰는 것입니다.
 */
async function insertDemoSession(
  admin: Admin,
  userId: string,
  body: DemoBody,
  seed: Seed,
): Promise<SessionRow> {
  const { data, error } = await admin
    .from("interview_sessions")
    .insert({
      user_id: userId,
      funding_source: "demo",
      status: "configuring",
      job_role: body.jobRole,
      persona: DEMO_SESSION_PARAMS.persona,
      modality: body.modality,
      current_modality: body.modality,
      main_question_budget: DEMO_SESSION_PARAMS.mainQuestionBudget,
      max_follow_up_depth: DEMO_SESSION_PARAMS.maxFollowUpDepth,
      max_turns: DEMO_SESSION_PARAMS.maxTurns,
      max_duration_min: DEMO_SESSION_PARAMS.maxDurationMin,
      resume_document_id: null,
      jd_document_id: null,
      resume_text_snapshot: seed.resumeText,
      jd_text_snapshot: seed.jdText,
    })
    .select("*")
    .single();

  if (error || !data) {
    // 계정 유형↔재원 짝 위반은 **500으로 흘리지 않습니다**(D35-2 — 마지막 방어선).
    throw (
      translateFundingRuleError(error?.message) ??
      new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error })
    );
  }

  return data;
}

/** 실패 시 흔적을 남기지 않습니다. 삭제 실패는 로그만 남기고 원래 오류를 그대로 올립니다. */
async function rollbackDemoSession(admin: Admin, sessionId: string): Promise<void> {
  const { error } = await admin.from("interview_sessions").delete().eq("id", sessionId);
  if (error) {
    console.error("[demo] 세션 롤백에 실패했습니다", { sessionId, message: error.message });
  }
}

/**
 * 롤백 뒤 사용자에게 돌려줄 오류.
 *
 * 예약 실패(`capacity_unavailable`·`trial_reservation_exists`)는 **그대로 통과**시킵니다 —
 * 화면이 분기해야 하는 값입니다. 플래너 실패처럼 분류되지 않은 오류만 503으로 정규화합니다.
 * 데모에는 "다시 준비" 화면이 없으므로 `preparation.state = 'failed'`로 남길 자리가 없습니다.
 */
function asDemoFailure(error: unknown): unknown {
  if (error instanceof ApiError) return error;

  console.error("[demo] 데모 세션 준비에 실패했습니다", error);
  return new ApiError("provider_unavailable", "지금은 데모 면접을 진행할 수 없습니다.", {
    cause: error,
  });
}

/** 이미 데모를 쓴 계정 — **기존 세션 id를 실어** UI가 "받은 리포트 다시 보기"로 보냅니다(D35-2). */
async function alreadyConsumedError(admin: Admin, userId: string): Promise<ApiError> {
  const { data } = await admin
    .from("interview_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("funding_source", "demo")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return new ApiError("demo_already_consumed", "이미 데모를 체험하셨어요.", {
    // **폴백으로 아무 세션이나 고르지 않습니다**(D30에서 배운 것). 없으면 `null`입니다.
    details: { existingSessionId: data?.id ?? null },
  });
}

/** 데모 정원 소진. 체험과 달리 **키 연결 출구가 없습니다** — 익명 사용자는 키를 연결할 수 없습니다. */
function demoCapacityError(availableAtIso: string | null): ApiError {
  const retryAfterSec = secondsUntilQuotaReset();
  return new ApiError("capacity_unavailable", "지금은 데모를 시작할 수 없습니다.", {
    details: {
      availableAtIso: availableAtIso ?? nextQuotaResetAt().toISOString(),
      retryAfterSec,
    },
    retryAfterSec,
  });
}
