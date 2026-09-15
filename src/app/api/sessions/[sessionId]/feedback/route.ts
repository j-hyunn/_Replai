import { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle, loadOwnedSession, readJson } from "@/lib/api/route";
import { toReportFeedbackDto } from "@/lib/api/serialize";

/**
 * #20 `PUT /api/sessions/[sessionId]/feedback` — 리포트 도움 여부 (지표 4).
 *
 * **PUT인 이유는 세션당 1건이기 때문입니다.** `report_feedback.session_id`가 unique이고,
 * 사용자가 마음을 바꾸면 같은 행을 갱신합니다 — 누를 때마다 행이 쌓이면 지표 4가 클릭 수로
 * 부풀어 오릅니다. upsert의 충돌 키가 그 unique 제약입니다.
 *
 * **`admin.ts`를 쓰지 않습니다** (계약 8절). `report_feedback`의 insert 정책 WITH CHECK가
 * `user_id` **와** 세션 소유를 둘 다 보므로 **RLS가 오히려 더 안전합니다.**
 *
 * 응답을 프론트 캐시에 직접 써넣지 않습니다 — 단일 진실은 #17이 주는 `myFeedback`입니다(D20).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** `report_feedback_comment_len` CHECK와 **같은 값**입니다 (`04_data_layer.md` 3.10절). */
const MAX_COMMENT_CHARS = 1000;

const bodySchema = z.object({
  isHelpful: z.boolean(),
  comment: z.string().max(MAX_COMMENT_CHARS).nullish(),
});

export function PUT(
  request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/feedback">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    // 소유권 확인이 먼저입니다. RLS도 같은 것을 보지만, 남의 세션 id에 404를 주는 것은
    // 라우트의 일입니다(RLS만 믿으면 정책 위반이 500으로 나갑니다).
    const { user, session, supabase } = await loadOwnedSession(sessionId);
    const body = await readJson(request, bodySchema);

    const { data, error } = await supabase
      .from("report_feedback")
      .upsert(
        {
          session_id: session.id,
          user_id: user.id,
          is_helpful: body.isHelpful,
          comment: body.comment ?? null,
        },
        { onConflict: "session_id" },
      )
      .select("*")
      .single();

    if (error || !data) {
      throw new ApiError("internal_error", "의견을 저장하지 못했습니다.", { cause: error });
    }

    return single("feedback", toReportFeedbackDto(data));
  });
}
