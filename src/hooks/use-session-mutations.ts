"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api/fetch-json";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  ClientEventName,
  ModalitySwitchReason,
  Modality,
  PauseReason,
  PreparationState,
  Question,
  Session,
  SessionConfigPatch,
  Turn,
} from "@/lib/api/types";

/**
 * 세션 변경 훅 (06_ui_plan.md 3.2절).
 *
 * ⚠️ **`useCancelSession`(#33)과 `useDeleteSession`(#23)을 같은 버튼에 연결하지 마세요** (D19).
 * 취소는 행이 남는 종료 상태이고, 삭제는 대화 기록까지 사라집니다.
 */

function invalidateSession(client: QueryClient, sessionId: string): void {
  void client.invalidateQueries({ queryKey: queryKeys.session(sessionId) });
  void client.invalidateQueries({ queryKey: queryKeys.sessionsRoot() });
  void client.invalidateQueries({ queryKey: queryKeys.dashboard() });
}

// #3 POST /api/sessions → 201 { session }
export function useCreateSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sourceSessionId?: string | null } = {}) => {
      const { session } = await fetchJson<{ session: Session }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ sourceSessionId: input.sourceSessionId ?? null }),
      });
      return session;
    },
    onSuccess: (session) => invalidateSession(client, session.id),
  });
}

// #5 PATCH /api/sessions/[sessionId]/config → { session }
export function useUpdateSessionConfig(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (patch: SessionConfigPatch) => {
      const { session } = await fetchJson<{ session: Session }>(
        `/api/sessions/${sessionId}/config`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      return session;
    },
    onSuccess: () => invalidateSession(client, sessionId),
  });
}

// #6 POST /api/sessions/[sessionId]/prepare → 202 { sessionId, status, preparation }
export type PrepareAccepted = {
  sessionId: string;
  /** 즉시 응답의 status는 **아직 `configuring`** 입니다. `ready`를 기대하면 깨집니다. */
  status: "configuring";
  preparation: PreparationState;
};

export function usePrepareSession(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchJson<PrepareAccepted>(`/api/sessions/${sessionId}/prepare`, {
        method: "POST",
      }),
    onSuccess: () => invalidateSession(client, sessionId),
  });
}

// #7 POST /api/sessions/[sessionId]/back-to-config → { session }
export function useBackToConfig(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { session } = await fetchJson<{ session: Session }>(
        `/api/sessions/${sessionId}/back-to-config`,
        { method: "POST" },
      );
      return session;
    },
    onSuccess: () => invalidateSession(client, sessionId),
  });
}

// #8 POST /api/sessions/[sessionId]/start → { session, openingQuestion }
export type StartSessionResponse = { session: Session; openingQuestion: Question };

export function useStartSession(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { micReady: boolean }) =>
      fetchJson<StartSessionResponse>(`/api/sessions/${sessionId}/start`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateSession(client, sessionId),
  });
}

// #11 PATCH /api/sessions/[sessionId]/turns/[turnId] → { turn }
export function useCorrectTurn(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { turnId: string; transcriptText: string }) => {
      const { turn } = await fetchJson<{ turn: Turn }>(
        `/api/sessions/${sessionId}/turns/${input.turnId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ transcriptText: input.transcriptText }),
        },
      );
      return turn;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.turns(sessionId) });
      void client.invalidateQueries({ queryKey: queryKeys.transcript(sessionId) });
    },
  });
}

// #12 POST /api/sessions/[sessionId]/modality → { session }
export function useSwitchModality(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      modality: Modality;
      reason: ModalitySwitchReason;
    }) => {
      const { session } = await fetchJson<{ session: Session }>(
        `/api/sessions/${sessionId}/modality`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return session;
    },
    onSuccess: () => invalidateSession(client, sessionId),
  });
}

// #13 POST /api/sessions/[sessionId]/pause → { session }
export function usePauseSession(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { pauseReason: PauseReason }) => {
      const { session } = await fetchJson<{ session: Session }>(
        `/api/sessions/${sessionId}/pause`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return session;
    },
    onSuccess: () => invalidateSession(client, sessionId),
  });
}

// #14 POST /api/sessions/[sessionId]/resume → { session, currentQuestion, lastInterviewerTurn }
export type ResumeSessionResponse = {
  session: Session;
  currentQuestion: Question | null;
  lastInterviewerTurn: Turn | null;
};

export function useResumeSession(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchJson<ResumeSessionResponse>(`/api/sessions/${sessionId}/resume`, {
        method: "POST",
      }),
    onSuccess: () => invalidateSession(client, sessionId),
  });
}

// #15 POST /api/sessions/[sessionId]/complete → { session }
export function useCompleteSession(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { session } = await fetchJson<{ session: Session }>(
        `/api/sessions/${sessionId}/complete`,
        { method: "POST" },
      );
      // ⚠️ 정상 경로에서 `session.status`는 `completed`가 아니라 **`evaluating`**입니다 (D18).
      return session;
    },
    onSuccess: () => invalidateSession(client, sessionId),
  });
}

// #22 POST /api/sessions/[sessionId]/events → { ok: true }
export function useReportEvent(sessionId: string) {
  return useMutation({
    // 감사 로그가 실패했다고 면접이 멈추면 안 됩니다. 1회만 재시도합니다.
    retry: 1,
    mutationFn: (input: {
      eventName: ClientEventName;
      detail?: Record<string, unknown>;
    }) =>
      fetchJson<{ ok: true }>(`/api/sessions/${sessionId}/events`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

// #23 DELETE /api/sessions/[sessionId] → { ok: true } — **실제 삭제**
export function useDeleteSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      await fetchJson<{ ok: true }>(`/api/sessions/${sessionId}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_data, sessionId) => invalidateSession(client, sessionId),
  });
}

// #32 POST /api/sessions/[sessionId]/prewarm → 204 (본문 없음)
export function usePrewarm(sessionId: string) {
  return useMutation({
    mutationFn: () =>
      fetchJson<void>(`/api/sessions/${sessionId}/prewarm`, { method: "POST" }),
  });
}

// #33 POST /api/sessions/[sessionId]/cancel → { session } — **취소. 행은 남습니다**
export function useCancelSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { session } = await fetchJson<{ session: Session }>(
        `/api/sessions/${sessionId}/cancel`,
        { method: "POST" },
      );
      return session;
    },
    // 낙관적 제거를 하지 않습니다 — 취소된 세션은 토글에 따라 다시 나타납니다.
    onSuccess: (session) => invalidateSession(client, session.id),
  });
}

// #35 POST /api/sessions/[sessionId]/abandon-preparation → { session }
export function useAbandonPreparation(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { session } = await fetchJson<{ session: Session }>(
        `/api/sessions/${sessionId}/abandon-preparation`,
        { method: "POST" },
      );
      return session;
    },
    onSuccess: () => invalidateSession(client, sessionId),
  });
}
