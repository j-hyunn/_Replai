import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/api/errors";
import {
  toQuestionDto,
  toTurnDto,
  type QuestionDto,
  type TurnDto,
} from "@/lib/api/serialize";
import type { Database } from "@/lib/supabase/database.types";

/**
 * #10(재동기화)·#19(전사)가 함께 쓰는 조회 (계약 4절 · 5.5절).
 *
 * **복합 봉투입니다** — `{ turns, questions }`. 두 리소스를 자기 이름의 키로 나란히 두며,
 * 훅은 언랩하지 않습니다(키가 둘이라 꺼낼 "하나"가 없습니다).
 *
 * **LLM을 호출하지 않습니다.** 스트림이 끊겼을 때 클라이언트는 #9를 재요청하지 않고 이 경로로
 * 복구합니다 — 다시 호출하면 무료 티어 쿼터를 두 번 쓰고, 확정분은 이미 `turns`에 있습니다.
 */

type UserClient = SupabaseClient<Database>;

export type TranscriptPayload = { turns: TurnDto[]; questions: QuestionDto[] };

export async function loadTranscript(
  supabase: UserClient,
  sessionId: string,
  options: { afterSeq?: number } = {},
): Promise<TranscriptPayload> {
  let turnQuery = supabase
    .from("turns")
    .select("*")
    .eq("session_id", sessionId)
    .order("seq", { ascending: true });

  // `afterSeq`는 **초과**입니다(이상이 아닙니다). 마지막으로 받은 seq를 그대로 보내면
  // 그 다음 것부터 옵니다 — 같은 값으로 판정하면 이미 그린 발화가 한 번 더 그려집니다.
  if (options.afterSeq !== undefined) turnQuery = turnQuery.gt("seq", options.afterSeq);

  const [turns, questions] = await Promise.all([
    turnQuery,
    // **질문은 자르지 않습니다.** `afterSeq`로 걸러낸 턴이 참조하는 질문이 그보다 앞에 있을 수
    // 있고, 질문이 빠지면 화면이 "무엇에 대한 답인지" 모르는 발화를 그리게 됩니다.
    supabase
      .from("questions")
      .select("*")
      .eq("session_id", sessionId)
      .order("order_index", { ascending: true }),
  ]);

  if (turns.error || questions.error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", {
      cause: turns.error ?? questions.error,
    });
  }

  return {
    turns: (turns.data ?? []).map(toTurnDto),
    questions: (questions.data ?? []).map(toQuestionDto),
  };
}
