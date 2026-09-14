import { z } from "zod";

import { runPlanner } from "@/lib/ai/planner";
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { handle, readJson, requireJobSecret } from "@/lib/api/route";
import { sessionStatusOf } from "@/lib/api/serialize";
import { failSession } from "@/lib/session/lifecycle";
import { applyTransition, recordObservationEvent } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * I1 `POST /api/internal/jobs/plan` — 플래너 워커. **프론트가 호출하지 않습니다.**
 *
 * 전이 표 5행(`configuring → ready`)을 **실제로 수행하는 곳**입니다. #6은 예약만 잡고 202를
 * 돌려주며, 스냅샷 커밋과 오프닝 질문 생성이 끝난 뒤에야 세션이 `ready`가 됩니다.
 *
 * **플래너 실패는 상태 전이가 아닙니다** (계약 12.2절). 세션은 `configuring`에 남고 사용자는
 * "다시 준비"를 누르면 됩니다 — `configuring → failed`는 **문서 추출 실패 경로에만** 있고
 * 그 유일한 진입점은 #35입니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({ sessionId: z.uuid() });

export function POST(request: Request) {
  return handle(async () => {
    requireJobSecret(request);
    const body = await readJson(request, bodySchema);

    // RLS 우회가 필요한 이유: 내부 워커에는 사용자 쿠키가 없고, 세션·질문 쓰기 정책도 없습니다.
    const admin = createAdminClient();

    const { data: session, error } = await admin
      .from("interview_sessions")
      .select("*")
      .eq("id", body.sessionId)
      .maybeSingle();

    if (error || !session) {
      throw new ApiError("not_found", "세션을 찾을 수 없습니다.");
    }

    const from = sessionStatusOf(session);
    // 멱등 — 이미 `ready`로 옮겨졌거나 취소된 세션이면 아무것도 하지 않습니다.
    if (from !== "configuring") return ok();

    const snapshots = await loadSnapshots(admin, session.resume_document_id, session.jd_document_id);
    if (!snapshots) {
      // 문서가 사라졌습니다. 준비를 이어 갈 수 없으므로 예약을 반납하고 `failed`로 내립니다.
      await failSession(session, "document_extraction_failed", "system_error", "planner_failed", admin);
      return ok();
    }

    let planned;
    try {
      planned = await runPlanner({
        session,
        resumeText: snapshots.resumeText,
        jdText: snapshots.jdText,
      });
    } catch (plannerError) {
      // 전이하지 않습니다. `preparation.state`가 `failed`로 파생되고 사용자는 다시 준비합니다.
      // **예약도 반납하지 않습니다** — 같은 세션이 곧 다시 시도할 것이고, 여기서 반납하면
      // 재시도가 오늘 정원을 한 번 더 먹습니다.
      await recordObservationEvent(
        session.id,
        "configuring",
        "planner_failed",
        "system_error",
        { code: "planner_failed" },
        admin,
      );
      console.error("[plan] 플래너 호출이 실패했습니다", { sessionId: session.id, plannerError });
      return ok();
    }

    // 스냅샷 2개를 **같은 전이에서** 복사합니다 — `sessions_snapshot_required_after_ready`가
    // `ready` 이후의 두 컬럼을 not null로 요구하므로, 따로 쓰면 전이가 제약 위반으로 실패합니다.
    await applyTransition({
      sessionId: session.id,
      from: "configuring",
      to: "ready",
      trigger: "ai_completion",
      eventName: "planner_succeeded",
      patch: {
        resume_text_snapshot: snapshots.resumeText,
        jd_text_snapshot: snapshots.jdText,
      },
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
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: questionError });
    }

    return ok();
  });
}

type Admin = ReturnType<typeof createAdminClient>;

async function loadSnapshots(
  admin: Admin,
  resumeDocumentId: string | null,
  jdDocumentId: string | null,
): Promise<{ resumeText: string; jdText: string } | null> {
  if (!resumeDocumentId || !jdDocumentId) return null;

  const { data } = await admin
    .from("documents")
    .select("id, extracted_text")
    .in("id", [resumeDocumentId, jdDocumentId]);

  const resumeText = data?.find((doc) => doc.id === resumeDocumentId)?.extracted_text;
  const jdText = data?.find((doc) => doc.id === jdDocumentId)?.extracted_text;

  if (!resumeText || !jdText) return null;
  return { resumeText, jdText };
}
