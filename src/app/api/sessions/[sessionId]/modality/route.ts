import { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle, loadOwnedSession, readJson } from "@/lib/api/route";
import { sessionStatusOf, toSessionDto } from "@/lib/api/serialize";
import { MODALITIES } from "@/lib/session/persona";
import { applyTransition, loadSessionDerived } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #12 `POST /api/sessions/[sessionId]/modality` — 음성 ↔ 텍스트 전환 (전이 표 **12행**).
 *
 * ## 상태는 바뀌지 않지만 **전이입니다**
 *
 * `in_progress → in_progress` 자기 전이이며(`01_state_machine.md` 2절 12행 · 5절), 바뀌는 것은
 * `current_modality` 하나입니다. `modality`(사용자가 고른 기본값)는 **건드리지 않습니다** —
 * 마이크가 잠깐 죽어서 텍스트로 넘어간 것이 "이 사람은 텍스트 면접을 골랐다"가 되면 안 됩니다.
 *
 * **"상태가 안 바뀌니 전이가 아니다"라고 판단해 UPDATE로 바로 쓰지 않습니다.** 그러면
 * `session_events`에 `modality_switched`가 남지 않아 `03_voice_pipeline.md`의 폴백 사다리가
 * 실제로 얼마나 발동했는지 알 수 없게 됩니다. 그래서 `applyTransition()`을 그대로 통과시키고,
 * 세션 UPDATE와 이벤트 기록을 **한 지점**에서 함께 합니다(계약 8절 #12 — "한 트랜잭션").
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * `reason`은 **영어 식별자 그대로**입니다 (`src/lib/api/types.ts`의 `ModalitySwitchReason`).
 * 한국어 문구를 받으면 `session_events.detail`에 번역문이 쌓여 지표 집계가 불가능해집니다.
 */
const MODALITY_SWITCH_REASONS = [
  "mic_permission_denied",
  "mic_unavailable",
  "stt_error",
  "rate_limit_fallback",
  "user_requested_after_delay",
  "user_requested",
] as const;

const bodySchema = z.object({
  modality: z.enum(MODALITIES),
  reason: z.enum(MODALITY_SWITCH_REASONS),
});

export function POST(
  request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/modality">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { session } = await loadOwnedSession(sessionId);
    const body = await readJson(request, bodySchema);

    const from = sessionStatusOf(session);
    if (from !== "in_progress") {
      // 전이 표 12행의 출발 상태는 `in_progress` 하나뿐입니다. `paused`에서 모드를 바꾸려는
      // 요청은 재개(#14) 시점에 처리할 일이지 여기서 조용히 통과시킬 일이 아닙니다.
      throw new ApiError("invalid_transition", "지금 상태에서는 할 수 없는 동작입니다.", {
        details: { from, to: "in_progress" },
      });
    }

    // RLS 우회가 필요한 이유: `interview_sessions`·`session_events`에 클라이언트 쓰기 정책이
    // 없습니다(04_data_layer.md 5.1절 3항).
    const admin = createAdminClient();

    const updated = await applyTransition({
      sessionId: session.id,
      from,
      to: "in_progress",
      trigger: "user_action",
      eventName: "modality_switched",
      detail: { from: session.current_modality, to: body.modality, reason: body.reason },
      // `modality`(기본값)가 아니라 `current_modality`만 바꿉니다.
      patch: { current_modality: body.modality },
      admin,
    });

    const derived = await loadSessionDerived(updated.id, sessionStatusOf(updated), admin);
    return single("session", toSessionDto(updated, derived));
  });
}
