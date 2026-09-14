import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle, loadOwnedSession } from "@/lib/api/route";
import { sessionStatusOf, toSessionDto } from "@/lib/api/serialize";
import { applyTransition, loadSessionDerived } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #7 `POST /api/sessions/[sessionId]/back-to-config` — 전이 표 9행(`ready → configuring`).
 *
 * ⚠️ **예약은 반납하지 않고 유지합니다.** 같은 세션이 다시 `ready`로 갈 때 재예약하면 여력을
 * 이중으로 먹습니다. 재예약은 `(session_id, model_bucket)` unique로 멱등이므로, 예약을 들고
 * 있는 편이 정확합니다(`01_state_machine.md` 2절 9행).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export function POST(
  _request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/back-to-config">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { session } = await loadOwnedSession(sessionId);

    const from = sessionStatusOf(session);
    // RLS 우회가 필요한 이유: questions·interview_sessions에 클라이언트 쓰기 정책이 없습니다.
    const admin = createAdminClient();

    const updated = await applyTransition({
      sessionId: session.id,
      from,
      to: "configuring",
      trigger: "user_action",
      eventName: "back_to_config",
      patch: {
        // 스냅샷 2개를 비웁니다 — `sessions_snapshot_required_after_ready`의 면제 4개에
        // `configuring`이 들어 있어 허용되고, 설정이 바뀌면 스냅샷도 다시 떠야 합니다.
        resume_text_snapshot: null,
        jd_text_snapshot: null,
        context_summary: null,
      },
      admin,
    });

    // 생성된 질문은 **실제로 삭제**합니다. 남겨 두면 바뀐 설정으로 만든 질문과 섞입니다.
    const { error } = await admin.from("questions").delete().eq("session_id", session.id);
    if (error) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
    }

    const derived = await loadSessionDerived(updated.id, "configuring", admin);
    return single("session", toSessionDto(updated, derived));
  });
}
