import { ApiError } from "@/lib/api/errors";
import { ok, single } from "@/lib/api/respond";
import { handle, loadOwnedSession } from "@/lib/api/route";
import { sessionStatusOf, toSessionDto } from "@/lib/api/serialize";
import { loadSessionDerived } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #4 `GET /api/sessions/[sessionId]` — 세션 단건.
 * #23 `DELETE /api/sessions/[sessionId]` — **실제 삭제**. 취소(#33)와 다른 경로입니다(D19).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export function GET(
  _request: Request,
  context: RouteContext<"/api/sessions/[sessionId]">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { session } = await loadOwnedSession(sessionId);

    const status = sessionStatusOf(session);
    const derived = await loadSessionDerived(session.id, status);

    return single("session", toSessionDto(session, derived));
  });
}

export function DELETE(
  _request: Request,
  context: RouteContext<"/api/sessions/[sessionId]">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { session } = await loadOwnedSession(sessionId);

    // RLS 우회가 필요한 이유: interview_sessions에는 클라이언트 delete 정책이 없습니다(04 5.1절).
    const admin = createAdminClient();

    // ⚠️ **여기에 예약 반납 호출을 두지 않습니다** (`05_api_contract.md` 4.7.3절).
    //    `release_quota_before_delete()`가 `before delete` 트리거로 이미 반납하므로,
    //    라우트가 한 번 더 부르면 트리거와 겹쳐 **이중 반납**이 되고 원장이 부풀어 오릅니다.
    //    이중 반납은 쓰지 않은 여력을 되돌려 놓아 오늘 정원을 실제보다 크게 만듭니다.
    const { error } = await admin.from("interview_sessions").delete().eq("id", session.id);

    if (error) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
    }

    // 돌려줄 리소스가 없습니다 — 행이 사라졌습니다.
    return ok();
  });
}
