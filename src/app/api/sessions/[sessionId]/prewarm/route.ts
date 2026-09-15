import { NextResponse } from "next/server";

import { handle, loadOwnedSession } from "@/lib/api/route";
import { sessionStatusOf } from "@/lib/api/serialize";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #32 `POST /api/sessions/[sessionId]/prewarm` — 서버 프리워밍 (`03_voice_pipeline.md` C4·P6).
 *
 * ## **LLM을 호출하지 않습니다**
 *
 * 이것이 이 라우트의 존재 이유 전부입니다. 침묵 1,200ms 시점(카운트다운 시작)에 컨텍스트 조립을
 * 미리 돌려 "서버 전처리 150ms"를 임계 경로에서 빼는 것이지, 답변을 미리 만드는 것이 아닙니다 —
 * **취소된 LLM 호출도 쿼터를 소모하므로**(P6) 사용자가 말을 이으면 그 호출은 그대로 손실입니다.
 * 여기서 하는 일은 세션·질문·최근 턴을 읽어 **연결과 캐시를 데우는 것**뿐입니다.
 *
 * ## 응답은 204이며 본문이 없습니다
 *
 * 돌려줄 것이 없습니다. 프리워밍의 성패는 사용자에게 보이지 않아야 하고, 화면이 이 응답을
 * 기다리거나 분기하면 그 순간 프리워밍이 임계 경로로 들어옵니다. 실패해도 조용히 지나갑니다 —
 * 이어질 #9가 필요한 것을 스스로 다시 읽습니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export function POST(
  _request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/prewarm">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { session } = await loadOwnedSession(sessionId);

    // 면접 중이 아니면 데울 것이 없습니다. **오류로 만들지 않습니다** — 사용자가 일시정지를
    // 누른 직후 프리워밍 요청이 도착하는 것은 정상적인 경합입니다.
    if (sessionStatusOf(session) === "in_progress") {
      // RLS 우회가 필요한 이유: #9가 실제로 읽는 것과 **같은 클라이언트·같은 쿼리**여야
      // 연결과 쿼리 플랜이 데워집니다. 사용자 문맥으로 데우면 #9의 경로는 여전히 차갑습니다.
      const admin = createAdminClient();

      await Promise.all([
        admin
          .from("questions")
          .select("id")
          .eq("session_id", session.id)
          .order("order_index", { ascending: false })
          .limit(1),
        admin
          .from("turns")
          .select("id")
          .eq("session_id", session.id)
          .order("seq", { ascending: false })
          .limit(1),
      ]);
    }

    // 본문 없음. `fetchJson`이 204를 `undefined`로 돌려주므로 훅이 읽을 것도 없습니다.
    return new NextResponse(null, { status: 204 });
  });
}
