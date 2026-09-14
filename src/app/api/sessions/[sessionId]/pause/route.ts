import { z } from "zod";

import { single } from "@/lib/api/respond";
import { handle, loadOwnedSession, readJson } from "@/lib/api/route";
import { sessionStatusOf, toSessionDto } from "@/lib/api/serialize";
import type { PauseReason } from "@/lib/session/status";
import { applyTransition, loadSessionDerived } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #13 `POST /api/sessions/[sessionId]/pause` — 전이 표 13행·17행(`in_progress → paused`).
 *
 * 클라이언트가 부르는 사유는 `user_requested`와 `connection_lost`(`sendBeacon`) 둘입니다.
 * `rate_limited`·`byok_*` 3종은 **#9의 스트림 안에서** 서버가 판정해 전이시킵니다 —
 * 클라이언트가 보내오는 값을 그대로 믿으면 지표가 오염됩니다(완주율에서 분리 집계해야 하는
 * 사유들입니다).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * 클라이언트가 보낼 수 있는 사유는 2종뿐입니다. 나머지는 서버가 정합니다.
 * `satisfies`가 오타와 `PauseReason` 목록 이탈을 컴파일 시점에 잡습니다.
 */
const CLIENT_PAUSE_REASONS = [
  "user_requested",
  "connection_lost",
] as const satisfies readonly PauseReason[];

const bodySchema = z.object({
  pauseReason: z.enum(CLIENT_PAUSE_REASONS),
});

export function POST(
  request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/pause">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { session } = await loadOwnedSession(sessionId);
    const body = await readJson(request, bodySchema);

    const admin = createAdminClient();
    const updated = await applyTransition({
      sessionId: session.id,
      from: sessionStatusOf(session),
      to: "paused",
      trigger: "user_action",
      eventName: "session_paused",
      patch: {
        pause_reason: body.pauseReason,
        paused_at: new Date().toISOString(),
        // 사용자 요청·연결 유실에는 재개 가능 시각이 없습니다 — 지금 바로 이어서 할 수 있습니다.
        resumable_after: null,
      },
      admin,
    });

    const derived = await loadSessionDerived(updated.id, "paused", admin);
    return single("session", toSessionDto(updated, derived));
  });
}
