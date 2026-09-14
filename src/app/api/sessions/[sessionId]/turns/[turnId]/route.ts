import { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle, loadOwnedSession, readJson } from "@/lib/api/route";
import { toTurnDto } from "@/lib/api/serialize";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #11 `PATCH /api/sessions/[sessionId]/turns/[turnId]` — STT 전사 정정.
 *
 * **원문을 버리지 않습니다.** 첫 정정에서만 `transcript_raw`에 STT 원문을 옮겨 두고, 이후
 * 정정은 `transcript_text`만 갱신합니다. 두 번째 정정에서 원문을 덮어쓰면 "STT가 무엇을
 * 들었는가"가 사라지고, 이의 제기 사유 `transcription_error`를 확인할 근거가 없어집니다.
 *
 * **후보 발화만 고칠 수 있습니다.** 면접관 발화를 사용자가 고치면 평가의 근거 인용이 실제
 * 대화와 달라지고, 리포트가 하지 않은 말을 인용하게 됩니다.
 *
 * 상태 전이가 아닙니다 — 정정은 어느 상태에서나 가능합니다(끝난 세션의 전사도 고칩니다).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const patchSchema = z.object({
  transcriptText: z.string().min(1).max(4000),
});

export function PATCH(
  request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/turns/[turnId]">,
) {
  return handle(async () => {
    const { sessionId, turnId } = await context.params;
    const { session } = await loadOwnedSession(sessionId);
    const body = await readJson(request, patchSchema);

    // RLS 우회가 필요한 이유: `turns`에는 클라이언트 쓰기 정책이 없습니다(04 5.1절 3항).
    // **그래서 소유권 검사를 위에서 먼저 했습니다.**
    const admin = createAdminClient();

    const { data: turn, error } = await admin
      .from("turns")
      .select("*")
      // `session_id`를 함께 거는 것이 소유권 검사의 마지막 한 칸입니다 — 남의 세션의 턴 id를
      // 이 세션 경로에 넣어도 여기서 걸립니다.
      .eq("id", turnId)
      .eq("session_id", session.id)
      .maybeSingle();

    if (error) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
    }
    if (!turn) throw new ApiError("not_found", "발화를 찾을 수 없습니다.");

    if (turn.role !== "candidate") {
      throw new ApiError("guard_failed", "면접관 발화는 수정할 수 없습니다.", {
        details: { guard: "not_candidate_turn" },
      });
    }

    const { data, error: updateError } = await admin
      .from("turns")
      .update({
        transcript_text: body.transcriptText,
        // 첫 정정에서만 원문을 보존합니다. 이미 값이 있으면 그대로 둡니다.
        transcript_raw: turn.transcript_raw ?? turn.transcript_text,
        is_corrected: true,
      })
      .eq("id", turn.id)
      .select("*")
      .single();

    if (updateError || !data) {
      throw new ApiError("internal_error", "수정 내용을 저장하지 못했습니다.", {
        cause: updateError,
      });
    }

    return single("turn", toTurnDto(data));
  });
}
