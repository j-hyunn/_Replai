"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api/fetch-json";
import { queryKeys } from "@/lib/api/query-keys";
import type { Question, Turn } from "@/lib/api/types";

/** #10·#19 공용 봉투 — 키가 2개이므로 **언랩하지 않습니다.** */
export type TurnsResponse = { turns: Turn[]; questions: Question[] };

/**
 * #10 GET /api/sessions/[sessionId]/turns — 재접속·"다시 듣기" 재동기화.
 * **LLM을 호출하지 않습니다.** 스트림이 끊기면 재요청이 아니라 이 훅으로 재동기화합니다(계약 5.5절).
 */
export function useTurnsResync(
  sessionId: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.turns(sessionId),
    queryFn: () =>
      fetchJson<TurnsResponse>(`/api/sessions/${sessionId}/turns`),
    enabled: options.enabled ?? true,
    staleTime: 0,
  });
}

/** #19 GET /api/sessions/[sessionId]/transcript → { turns, questions } */
export function useTranscript(
  sessionId: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.transcript(sessionId),
    queryFn: () =>
      fetchJson<TurnsResponse>(`/api/sessions/${sessionId}/transcript`),
    enabled: options.enabled ?? true,
  });
}
