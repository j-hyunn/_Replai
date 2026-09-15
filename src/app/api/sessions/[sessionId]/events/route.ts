import { z } from "zod";

import { ok } from "@/lib/api/respond";
import { handle, loadOwnedSession, readJson } from "@/lib/api/route";
import { sessionStatusOf } from "@/lib/api/serialize";
import { recordObservationEvent } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #22 `POST /api/sessions/[sessionId]/events` — **관측 이벤트 전용** (계약 4.5절, QA F6).
 *
 * ## 클라이언트는 상태를 보내지 않습니다
 *
 * `session_events.to_status`는 not null + 11값 CHECK인데, 여기 쌓이는 이벤트는 **상태 전이가
 * 아닙니다.** 규약은 하나입니다 — **`from_status = to_status = 그 시점 세션의 `status``**.
 * 그 값은 소유권 확인을 위해 이미 읽은 세션 행에서 그대로 가져오므로 **DB 왕복이 늘지 않습니다.**
 *
 * `to_status`를 nullable로 완화하지 않은 이유: 지표 1·2 쿼리가 매번 `is not null`을 챙겨야 하고,
 * 한 번 빠뜨리면 **조용히 틀린 숫자**가 나옵니다. 어느 이벤트가 상태를 옮겼는지는 `event_name`이
 * 이미 구분합니다.
 *
 * > **지표를 셀 때는 반드시 `event_name`으로 먼저 거르세요.** `to_status`만으로 전이를 세면
 * > 여기 쌓인 비전이 이벤트가 섞여 지표 1·2가 부풀어 오릅니다.
 *
 * **허용 목록 밖의 이름은 400입니다.** 열어 두면 이 라우트가 임의 로그 주입구가 되고,
 * `session_events`는 지표의 원천이라 한 번 오염되면 되돌릴 수 없습니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** 계약 12절 `ClientEventName` — 5종이 전부입니다. */
const CLIENT_EVENT_NAMES = [
  "score_card_viewed",
  "report_viewed",
  "modality_switched",
  "voice_precheck",
  "rate_limit_fallback",
] as const;

const bodySchema = z.object({
  eventName: z.enum(CLIENT_EVENT_NAMES),
  // 자유 jsonb입니다. 모양은 이벤트마다 다르므로 강제하지 않되, **JSON으로 표현 가능한
  // 값만** 받습니다 — `undefined`·함수가 섞이면 `session_events.detail` INSERT가 조용히
  // 다른 모양으로 저장됩니다.
  detail: z.record(z.string(), z.json()).optional(),
});

export function POST(
  request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/events">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { session } = await loadOwnedSession(sessionId);
    const body = await readJson(request, bodySchema);

    // RLS 우회가 필요한 이유: `session_events`에는 클라이언트 쓰기 정책이 없습니다.
    const admin = createAdminClient();

    await recordObservationEvent(
      session.id,
      // **그 시점 세션의 상태**를 그대로 씁니다. 클라이언트가 보낸 값이 아닙니다.
      sessionStatusOf(session),
      body.eventName,
      "user_action",
      body.detail ?? null,
      admin,
    );

    // 남길 리소스가 없습니다 — 감사 로그 한 줄이 전부입니다.
    return ok();
  });
}
