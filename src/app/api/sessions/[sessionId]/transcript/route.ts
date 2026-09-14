import { compound } from "@/lib/api/respond";
import { handle, loadOwnedSession } from "@/lib/api/route";
import { loadTranscript } from "@/lib/session/transcript";

/**
 * #19 `GET /api/sessions/[sessionId]/transcript` — 전사 전체 (계약 4절 19행).
 *
 * **#10과 응답 모양이 같습니다**(`{ turns, questions }`). 다른 것은 용도뿐입니다 — #10은
 * 면접 중 재동기화(부분, `afterSeq`)이고 이쪽은 끝난 세션의 전체 읽기입니다. 훅도 두 개이며
 * 캐시 키가 다릅니다(`['turns', id]` vs `['transcript', id]`).
 *
 * **전사 텍스트가 대화 로그의 진실의 원천입니다**(고정 제약). 음성 원본은 저장하지 않습니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export function GET(
  _request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/transcript">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    // 소유권 확인이 먼저입니다 — 없는 세션과 남의 세션을 똑같이 404로 답합니다(계약 7.3절).
    const { session, supabase } = await loadOwnedSession(sessionId);

    return compound(await loadTranscript(supabase, session.id));
  });
}
