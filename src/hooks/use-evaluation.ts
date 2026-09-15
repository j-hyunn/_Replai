"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api/fetch-json";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  Evaluation,
  EvaluationJobAccepted,
  ReasonCode,
  ReportFeedback,
  ScoreDispute,
} from "@/lib/api/types";

/**
 * 평가·리포트 훅 (06_ui_plan.md 3.1·3.2절).
 *
 * `useEvaluation` 호출 자체가 서버의 게으른 워치독과 `report_first_viewed_at` 기록을
 * 겸합니다(계약 6.5·6.6절). **리포트 화면에서 이 훅을 건너뛰는 최적화를 하면 안 됩니다.**
 */

// #17 GET /api/sessions/[sessionId]/evaluation → { evaluation: Evaluation | null }
export function useEvaluation(
  sessionId: string,
  options: { refetchInterval?: number | false } = {},
) {
  return useQuery({
    queryKey: queryKeys.evaluation(sessionId),
    queryFn: async () => {
      const { evaluation } = await fetchJson<{ evaluation: Evaluation | null }>(
        `/api/sessions/${sessionId}/evaluation`,
      );
      // `null`은 오류가 아닙니다 — 아직 `evaluations` 행이 없을 뿐입니다(계약 3절).
      return evaluation;
    },
    refetchInterval: options.refetchInterval ?? false,
  });
}

/**
 * #16 POST /api/sessions/[sessionId]/evaluate → 202 `EvaluationJobAccepted`
 *
 * ⚠️ **`failed` 재시도 전용입니다** (D18). `completed`·`evaluating`·`evaluated`에서 부르면
 * 언제나 409이므로, 리포트 화면 진입 시 자동 호출하지 않습니다.
 * 이 즉시 응답에는 `axes`도 `overallScore`도 **물리적으로 없습니다.**
 */
export function useRetryEvaluation(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchJson<EvaluationJobAccepted>(`/api/sessions/${sessionId}/evaluate`, {
        method: "POST",
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.session(sessionId) });
      void client.invalidateQueries({ queryKey: queryKeys.evaluation(sessionId) });
    },
  });
}

// #18 POST /api/sessions/[sessionId]/coach/retry → 202 { sessionId, evaluationId, coachStatus }
export type CoachRetryAccepted = {
  sessionId: string;
  evaluationId: string;
  coachStatus: "running";
};

export function useRetryCoach(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchJson<CoachRetryAccepted>(`/api/sessions/${sessionId}/coach/retry`, {
        method: "POST",
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.evaluation(sessionId) });
    },
  });
}

// #20 PUT /api/sessions/[sessionId]/feedback → { feedback }
export function useReportFeedback(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { isHelpful: boolean; comment?: string | null }) => {
      const { feedback } = await fetchJson<{ feedback: ReportFeedback }>(
        `/api/sessions/${sessionId}/feedback`,
        { method: "PUT", body: JSON.stringify(input) },
      );
      return feedback;
    },
    // 응답을 캐시에 직접 써넣지 않습니다 — 서버가 준 `myFeedback`이 단일 진실입니다.
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.evaluation(sessionId) });
    },
  });
}

// #21 POST /api/sessions/[sessionId]/disputes → 201 { dispute }
export function useCreateDispute(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      scoreId: string;
      citationId?: string | null;
      reasonCode: ReasonCode;
      comment?: string | null;
    }) => {
      const { dispute } = await fetchJson<{ dispute: ScoreDispute }>(
        `/api/sessions/${sessionId}/disputes`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return dispute;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.evaluation(sessionId) });
    },
  });
}
