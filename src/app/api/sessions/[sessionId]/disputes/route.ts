import { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle, loadOwnedSession, readJson } from "@/lib/api/route";
import { REASON_CODES, toScoreDisputeDto } from "@/lib/api/serialize";

/**
 * #21 `POST /api/sessions/[sessionId]/disputes` — 축·인용 단위 이의 제기 (지표 5).
 *
 * **수집만 하고 재평가를 유발하지 않습니다** (D4). 점수도 `evaluations`도 건드리지 않습니다.
 *
 * ## 중복은 409입니다
 *
 * DB에 부분 unique 인덱스 두 개가 있습니다 — 축 단위(`citation_id is null`)와 인용 단위.
 * 같은 대상에 두 번 제기하면 그것이 걸리고, 라우트는 그 위반을 **409**로 번역합니다.
 * 이 방어가 없으면 새로고침·더블클릭이 지표 5를 중복으로 오염시킵니다(D20이 `myDisputes`를
 * #17 응답에 실은 것과 같은 이유입니다).
 *
 * **`admin.ts`를 쓰지 않습니다** (계약 8절) — insert 정책 WITH CHECK가 `user_id`와 세션 소유를
 * 둘 다 봅니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** `score_disputes_comment_len` CHECK와 **같은 값**입니다 (`04_data_layer.md` 3.11절). */
const MAX_COMMENT_CHARS = 1000;

const bodySchema = z.object({
  /** `evaluation_scores.id` — 리포트의 `EvaluationAxis.id`입니다. */
  scoreId: z.uuid(),
  /** 값이 있으면 인용 단위, 없으면 축 단위 이의입니다. */
  citationId: z.uuid().nullish(),
  reasonCode: z.enum(REASON_CODES),
  comment: z.string().max(MAX_COMMENT_CHARS).nullish(),
});

export function POST(
  request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/disputes">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { user, session, supabase } = await loadOwnedSession(sessionId);
    const body = await readJson(request, bodySchema);

    // 대상이 **이 세션의** 점수인지 확인합니다. FK만으로는 남의 세션 점수 id에 이의를 달 수
    // 있고(자기 `session_id`를 함께 넣으면 RLS의 insert 정책도 통과합니다), 그러면 지표 5에
    // 서로 다른 세션이 뒤섞인 행이 생깁니다.
    const { data: score, error: scoreError } = await supabase
      .from("evaluation_scores")
      .select("id")
      .eq("id", body.scoreId)
      .eq("session_id", session.id)
      .maybeSingle();

    if (scoreError) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: scoreError });
    }
    if (!score) throw new ApiError("not_found", "이의를 제기할 항목을 찾을 수 없습니다.");

    if (body.citationId) {
      const { data: citation } = await supabase
        .from("evaluation_citations")
        .select("id")
        .eq("id", body.citationId)
        .eq("score_id", body.scoreId)
        .maybeSingle();

      // 인용은 **그 축의 것**이어야 합니다. 다른 축의 인용을 붙이면 리포트 화면의
      // "이의 접수됨" 배지가 엉뚱한 카드에 달립니다.
      if (!citation) throw new ApiError("not_found", "인용을 찾을 수 없습니다.");
    }

    const { data, error } = await supabase
      .from("score_disputes")
      .insert({
        score_id: body.scoreId,
        citation_id: body.citationId ?? null,
        session_id: session.id,
        user_id: user.id,
        reason_code: body.reasonCode,
        comment: body.comment ?? null,
      })
      .select("*")
      .single();

    if (error) {
      // 23505 = unique 위반. 부분 unique 인덱스 2종(`uq_disputes_axis`·`uq_disputes_citation`)이
      // 같은 대상의 두 번째 제기를 막습니다.
      if (error.code === "23505") {
        throw new ApiError("guard_failed", "이미 이의를 제기한 항목입니다.", {
          details: { guard: "dispute_already_exists" },
        });
      }
      throw new ApiError("internal_error", "이의를 접수하지 못했습니다.", { cause: error });
    }

    return single("dispute", toScoreDisputeDto(data), { status: 201 });
  });
}
