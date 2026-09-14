import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/api/errors";
import {
  toSessionSummaryDto,
  type SessionRow,
  type SessionSummaryDto,
  type SummaryScore,
} from "@/lib/api/serialize";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 목록·대시보드의 `SessionSummary` 조립 (`05_api_contract.md` 12절).
 *
 * **점수는 세션 행에 없습니다.** `evaluations.overall_score`와 채점된 축 수를 따로 읽어 붙이며,
 * **N+1을 만들지 않도록 페이지 전체를 두 번의 `in (...)` 쿼리로 가져옵니다.**
 *
 * 읽기는 전부 **`server.ts`(anon + 쿠키)** 로 합니다 — `evaluations`·`evaluation_scores`에는
 * select 정책이 있어 RLS가 남의 세션 점수를 걸러 줍니다. 여기서 `admin.ts`를 쓰면 그 그물을
 * 스스로 걷어내는 셈이고, 목록 라우트는 쓰기가 없어 우회할 이유가 없습니다.
 */

type UserClient = SupabaseClient<Database>;

const NO_SCORE: SummaryScore = { overallScore: null, scoredAxisCount: null };

export async function toSessionSummaries(
  supabase: UserClient,
  rows: SessionRow[],
): Promise<SessionSummaryDto[]> {
  if (rows.length === 0) return [];

  const scores = await loadScores(
    supabase,
    rows.map((row) => row.id),
  );

  return rows.map((row) => toSessionSummaryDto(row, scores.get(row.id) ?? NO_SCORE));
}

/**
 * 세션별 총점과 **채점된 축 수**를 모읍니다.
 *
 * `scoredAxisCount`는 DB 컬럼이 아니라 **`is_insufficient_evidence = false`인 축의 수**입니다
 * (계약 9.1절 — 인용이 없는 축은 가중치 합에서 빠지므로, 이 수가 총점의 분모를 설명합니다).
 * 평가가 아직 없거나 실패한 세션은 맵에 들어오지 않고 두 값 모두 `null`로 남습니다.
 */
async function loadScores(
  supabase: UserClient,
  sessionIds: string[],
): Promise<Map<string, SummaryScore>> {
  const evaluations = await supabase
    .from("evaluations")
    .select("id, session_id, overall_score")
    .in("session_id", sessionIds)
    .eq("status", "succeeded");

  if (evaluations.error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", {
      cause: evaluations.error,
    });
  }

  const rows = evaluations.data;
  if (rows.length === 0) return new Map();

  const axes = await supabase
    .from("evaluation_scores")
    .select("evaluation_id")
    .in(
      "evaluation_id",
      rows.map((row) => row.id),
    )
    .eq("is_insufficient_evidence", false);

  if (axes.error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: axes.error });
  }

  const scoredByEvaluation = new Map<string, number>();
  for (const axis of axes.data) {
    scoredByEvaluation.set(axis.evaluation_id, (scoredByEvaluation.get(axis.evaluation_id) ?? 0) + 1);
  }

  const bySession = new Map<string, SummaryScore>();
  for (const row of rows) {
    bySession.set(row.session_id, {
      overallScore: row.overall_score,
      scoredAxisCount: scoredByEvaluation.get(row.id) ?? 0,
    });
  }
  return bySession;
}
