import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle, loadOwnedSession } from "@/lib/api/route";
import { sessionStatusOf, toSessionDto } from "@/lib/api/serialize";
import { MIN_ANSWERED_MAIN_FOR_COMPLETE } from "@/lib/session/persona";
import { completeSession } from "@/lib/session/lifecycle";
import { loadSessionDerived } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #15 `POST /api/sessions/[sessionId]/complete` — 전이 표 18행·22행(`→ completed`).
 *
 * ⚠️ **응답의 `session.status`는 정상 경로에서 `completed`가 아니라 `evaluating`입니다** (D18).
 * 이 라우트는 세션을 `completed`로 옮긴 **직후 같은 요청 안에서** 평가를 등록하기 때문입니다.
 * 프론트는 `completed`와 `evaluating`을 **둘 다 "리포트 준비 중" 화면**으로 처리해야 하고,
 * 어느 쪽에서도 `POST .../evaluate`(#16)를 부르지 않습니다 — 부르면 409입니다.
 *
 * 반납 6지점 #1(부분 반납, 6을 남김)이 `completeSession()` 안에서 일어납니다. 잔여 6은
 * `evaluating → evaluated` 시점의 정산 반납(#2)이 마저 가져갑니다 — **둘 다 일어나야 합니다.**
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 평가 등록은 트랜잭션 1회 + 워커를 띄우는 fetch 1회이고 **워커의 응답을 기다리지 않습니다.**
// 기다리는 순간 평가자의 25~50초가 이 라우트의 실행 시간에 들어와 설계 전체가 무너집니다.
export const maxDuration = 15;

export function POST(
  _request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/complete">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { session } = await loadOwnedSession(sessionId);

    const from = sessionStatusOf(session);
    const admin = createAdminClient();

    // 전이 표 18·22행의 가드: **답변한 주질문 ≥ 1**. 0개인 세션은 평가할 근거가 없어
    // `completed`가 아니라 `abandoned`로 가야 합니다(크론이 담당).
    const derived = await loadSessionDerived(session.id, from, admin);
    if (derived.answeredMainQuestionCount < MIN_ANSWERED_MAIN_FOR_COMPLETE) {
      throw new ApiError("guard_failed", "아직 답변한 질문이 없어 면접을 종료할 수 없습니다.", {
        details: { guard: "no_answered_main_question" },
      });
    }

    const updated = await completeSession(session, "user_action", "session_completed", admin);

    const finalDerived = await loadSessionDerived(updated.id, sessionStatusOf(updated), admin);
    return single("session", toSessionDto(updated, finalDerived));
  });
}
