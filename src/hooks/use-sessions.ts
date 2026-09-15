"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api/fetch-json";
import { queryKeys } from "@/lib/api/query-keys";
import type { Session, SessionStatus, SessionSummary } from "@/lib/api/types";

/**
 * 조회 훅 (06_ui_plan.md 3.1절).
 *
 * **제네릭은 주장이지 검사가 아닙니다.** 봉투 전체를 선언하고 훅이 명시적으로 꺼냅니다.
 */

// #1 GET /api/dashboard → { activeSessions, unreadReportCount, recentSessions }
export type DashboardResponse = {
  activeSessions: SessionSummary[];
  unreadReportCount: number;
  recentSessions: SessionSummary[];
};

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard(),
    queryFn: () => fetchJson<DashboardResponse>("/api/dashboard"),
  });
}

// #2 GET /api/sessions → { sessions, nextCursor }
export type SessionListResponse = {
  sessions: SessionSummary[];
  nextCursor: string | null;
};

export type SessionListFilters = {
  status?: SessionStatus;
  /** **문자열 `'true'`일 때만 참**입니다 (계약 4.3절). 훅이 그 변환을 책임집니다. */
  includeCanceled?: boolean;
  limit?: number;
  cursor?: string | null;
};

export function sessionListUrl(filters: SessionListFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.includeCanceled) params.set("includeCanceled", "true");
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.cursor) params.set("cursor", filters.cursor);
  const query = params.toString();
  return query ? `/api/sessions?${query}` : "/api/sessions";
}

export function useSessions(filters: SessionListFilters = {}) {
  return useQuery({
    // 토글을 바꾸면 커서가 무효가 되므로 키에 포함해 **처음부터 다시 조회**합니다(계약 4.3절).
    queryKey: queryKeys.sessions({
      status: filters.status,
      includeCanceled: filters.includeCanceled,
    }),
    queryFn: () => fetchJson<SessionListResponse>(sessionListUrl(filters)),
  });
}

// #4 GET /api/sessions/[sessionId] → { session }
export function useSession(
  sessionId: string | null,
  options: { refetchInterval?: number | false } = {},
) {
  return useQuery({
    queryKey: queryKeys.session(sessionId ?? ""),
    queryFn: async () => {
      const { session } = await fetchJson<{ session: Session }>(
        `/api/sessions/${sessionId}`,
      );
      return session;
    },
    enabled: sessionId !== null && sessionId.length > 0,
    refetchInterval: options.refetchInterval ?? false,
  });
}
