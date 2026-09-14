import { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { compound } from "@/lib/api/respond";
import { handle, loadOwnedSession, readJson } from "@/lib/api/route";
import {
  sessionStatusOf,
  toQuestionDto,
  toSessionDto,
  type QuestionDto,
  type SessionDto,
} from "@/lib/api/serialize";
import { applyTransition, loadSessionDerived } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #8 `POST /api/sessions/[sessionId]/start` — 전이 표 8행(`ready → in_progress`).
 *
 * 응답은 복합 봉투입니다: `{ session, openingQuestion }`. 프론트는 **두 키를 모두 언랩**합니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const bodySchema = z.object({
  /** 음성 모드에서는 마이크 권한 확인이 가드입니다(전이 표 8행). */
  micReady: z.boolean(),
});

export type StartSessionResponse = { session: SessionDto; openingQuestion: QuestionDto };

export function POST(
  request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/start">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { session } = await loadOwnedSession(sessionId);
    const body = await readJson(request, bodySchema);

    const from = sessionStatusOf(session);

    // **`ready`에서만 시작합니다** (전이 표 8행 · 계약 4.6절 8행).
    //
    // 전이 표에는 `paused → in_progress`(21행)도 있으므로 `assertTransition`은 `paused` 세션의
    // `start`도 통과시킵니다. 그러나 그 행의 담당은 **#14 `resume`뿐**이며, 거기에만 재개 가드
    // 3종(7일 시한 · `rate_limited`의 `resumable_after` 경과 · `byok_key_invalid`의 키 재검증)이
    // 있습니다. 여기서 막지 않으면 `paused` 세션에 `start`를 보내는 것만으로 그 셋이 전부
    // 우회되고, `pause_reason`이 지워지며 `started_at`이 덮어써져 시간 상한까지 리셋됩니다.
    // **"전이 표에 있는 조합"과 "이 라우트가 담당하는 행"은 다릅니다.**
    if (from !== "ready") {
      throw new ApiError("invalid_transition", "지금 상태에서는 할 수 없는 동작입니다.", {
        details: { from, to: "in_progress" },
      });
    }

    if (session.current_modality === "voice" && !body.micReady) {
      // 마이크 없이 음성 세션을 시작하면 사용자는 답할 길이 없는 질문을 듣습니다.
      // 텍스트로 진행할 생각이라면 #12로 모달리티를 먼저 바꾸는 것이 정확한 경로입니다.
      throw new ApiError("guard_failed", "마이크 권한 확인이 필요합니다.", {
        details: { guard: "mic_not_ready" },
      });
    }

    // RLS 우회가 필요한 이유: interview_sessions·questions에 클라이언트 쓰기 정책이 없습니다.
    const admin = createAdminClient();

    const { data: opening, error } = await admin
      .from("questions")
      .select("*")
      .eq("session_id", session.id)
      .order("order_index", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
    }
    if (!opening) {
      // `ready`인데 오프닝 질문이 없으면 플래너 커밋이 깨진 것입니다. 시작해도 물어볼 것이
      // 없으므로 전이하지 않습니다.
      throw new ApiError("guard_failed", "오프닝 질문이 아직 준비되지 않았습니다.", {
        details: { guard: "opening_question_missing" },
      });
    }

    const startedAt = new Date().toISOString();
    const updated = await applyTransition({
      sessionId: session.id,
      from,
      to: "in_progress",
      trigger: "user_action",
      eventName: "session_started",
      patch: { started_at: startedAt },
      admin,
    });

    // 오프닝 질문 발화 시각. `asked_at`은 종료 판정과 지표 6이 함께 보는 값입니다.
    const { data: asked } = await admin
      .from("questions")
      .update({ asked_at: startedAt })
      .eq("id", opening.id)
      .select("*")
      .single();

    const derived = await loadSessionDerived(updated.id, "in_progress", admin);

    const response: StartSessionResponse = {
      session: toSessionDto(updated, derived),
      openingQuestion: toQuestionDto(asked ?? opening),
    };
    return compound(response);
  });
}
