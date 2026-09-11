import { single } from "@/lib/api/respond";
import { handle, loadOwnedSession } from "@/lib/api/route";
import { sessionStatusOf, toSessionDto } from "@/lib/api/serialize";
import { cancelSession } from "@/lib/session/lifecycle";
import { loadSessionDerived } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #33 `POST /api/sessions/[sessionId]/cancel` — `→ canceled` **7개 전이 전부**를 담당합니다(D19).
 *
 * **취소는 삭제가 아닙니다.** 행은 남고 `turns`·`questions`도 유지되며 평가는 등록하지
 * 않습니다. "이 세션 버리기"·"폐기" 문구는 **전부 이 라우트**이고, #23(실제 삭제)에 연결하면
 * 사용자가 확인 절차 없이 대화 기록을 영구히 잃습니다 — D19가 명시적으로 막으려 한 시나리오입니다.
 *
 * `completed`·`evaluating`·`evaluated`·`canceled`에 호출하면 409 `invalid_transition`입니다
 * (전이 표에 그 조합이 없습니다). 평가가 이미 시작된 세션은 취소가 아니라 삭제 대상입니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export function POST(
  _request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/cancel">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { session } = await loadOwnedSession(sessionId);

    const admin = createAdminClient();
    // 전이 표 검사와 반납 6지점 #3(전량)이 `cancelSession()` 안에 있습니다.
    const updated = await cancelSession(session, admin);

    const derived = await loadSessionDerived(updated.id, sessionStatusOf(updated), admin);
    return single("session", toSessionDto(updated, derived));
  });
}
