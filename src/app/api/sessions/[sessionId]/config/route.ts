import { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle, loadOwnedSession, readJson } from "@/lib/api/route";
import { sessionStatusOf, toSessionDto } from "@/lib/api/serialize";
import { JOB_ROLES, MODALITIES, PERSONA_BUDGET, PERSONAS } from "@/lib/session/persona";
import { applyTransition, loadSessionDerived, type SessionPatch } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #5 `PATCH /api/sessions/[sessionId]/config` — 부분 설정 저장.
 *
 * 전이 표 2행(`created → configuring`)과 4행(`configuring → configuring`)을 담당합니다.
 * **부분 저장이 정상 경로**이므로 요청 필드는 전부 선택입니다 — 한 항목만 고르고 나가는
 * 사용자가 다수입니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const bodySchema = z
  .object({
    jobRole: z.enum(JOB_ROLES).optional(),
    persona: z.enum(PERSONAS).optional(),
    modality: z.enum(MODALITIES).optional(),
    resumeDocumentId: z.uuid().nullish(),
    jdDocumentId: z.uuid().nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "변경할 항목이 없습니다.",
  });

export function PATCH(
  request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/config">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { session, supabase } = await loadOwnedSession(sessionId);
    const body = await readJson(request, bodySchema);

    const from = sessionStatusOf(session);
    if (from !== "created" && from !== "configuring") {
      // 전이 표에 `ready → configuring`은 있지만 그 진입점은 #7입니다. 설정 화면으로 돌아가지
      // 않은 채 설정만 고치는 경로를 열면 이미 만들어진 질문과 설정이 어긋납니다.
      throw new ApiError("invalid_transition", "지금 상태에서는 할 수 없는 동작입니다.", {
        details: { from, to: "configuring" },
      });
    }

    // 문서는 **사용자 문맥으로** 확인합니다 — RLS가 남의 문서를 세션에 붙이는 경로를 막습니다.
    await assertOwnedDocument(supabase, body.resumeDocumentId, "resume");
    await assertOwnedDocument(supabase, body.jdDocumentId, "job_description");

    const patch: Omit<SessionPatch, "status"> = {};
    if (body.jobRole !== undefined) patch.job_role = body.jobRole;
    if (body.modality !== undefined) {
      patch.modality = body.modality;
      // 아직 면접 전이므로 진행 중 모드도 함께 맞춥니다. 진행 중 전환은 #12의 몫입니다.
      patch.current_modality = body.modality;
    }
    if (body.resumeDocumentId !== undefined) patch.resume_document_id = body.resumeDocumentId;
    if (body.jdDocumentId !== undefined) patch.jd_document_id = body.jdDocumentId;

    if (body.persona !== undefined) {
      patch.persona = body.persona;
      // **페르소나 예산을 함께 씁니다** (`01_state_machine.md` 3절). DB 기본값은 `deep_pressure`
      // 기준이므로, 여기서 덮어쓰지 않으면 기술 검증형 세션이 주질문 4개에서 끝나
      // 페르소나 차이가 사라집니다.
      const budget = PERSONA_BUDGET[body.persona];
      patch.main_question_budget = budget.mainQuestionBudget;
      patch.max_follow_up_depth = budget.maxFollowUpDepth;
      patch.max_turns = budget.maxTurns;
      patch.max_duration_min = budget.maxDurationMin;
    }

    const admin = createAdminClient();
    const updated = await applyTransition({
      sessionId: session.id,
      from,
      to: "configuring",
      trigger: "user_action",
      eventName: from === "created" ? "config_started" : "config_updated",
      patch,
      admin,
    });

    const derived = await loadSessionDerived(updated.id, "configuring", admin);
    return single("session", toSessionDto(updated, derived));
  });
}

async function assertOwnedDocument(
  supabase: Awaited<ReturnType<typeof loadOwnedSession>>["supabase"],
  documentId: string | null | undefined,
  docType: "resume" | "job_description",
): Promise<void> {
  if (!documentId) return;

  const { data } = await supabase
    .from("documents")
    .select("id, doc_type")
    .eq("id", documentId)
    .maybeSingle();

  // 없는 문서와 남의 문서를 똑같이 404로 답합니다(7.3절과 같은 이유).
  if (!data) throw new ApiError("not_found", "문서를 찾을 수 없습니다.");

  if (data.doc_type !== docType) {
    throw new ApiError("validation_failed", "요청 내용을 확인해 주세요.", {
      details: { fields: { [docType === "resume" ? "resumeDocumentId" : "jdDocumentId"]: "문서 종류가 맞지 않습니다." } },
    });
  }
}
