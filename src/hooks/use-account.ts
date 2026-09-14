"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api/fetch-json";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  AccountStats,
  ApiKeyStatus,
  Capacity,
  Profile,
  TrialConsent,
} from "@/lib/api/types";

/**
 * 계정·여력·키 훅 (06_ui_plan.md 3.1·3.2절).
 *
 * `['capacity']`와 `['apiKey']`는 **같은 서버 사실의 두 창**입니다. 키를 바꾸는 뮤테이션
 * 3종(#38·#39·#40)은 성공 시 **두 키를 모두** invalidate 합니다 — 한쪽만 무효화하면
 * 키를 연결한 직후에도 "시작할 수 없어요"가 남습니다.
 */

// #30 GET /api/account → { profile, stats }
export type AccountResponse = { profile: Profile; stats: AccountStats };

export function useAccount() {
  return useQuery({
    queryKey: queryKeys.account(),
    queryFn: () => fetchJson<AccountResponse>("/api/account"),
  });
}

// #31 DELETE /api/account → { ok: true }
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async (input: { password: string }) => {
      await fetchJson<{ ok: true }>("/api/account", {
        method: "DELETE",
        body: JSON.stringify(input),
      });
    },
  });
}

/**
 * #36 GET /api/capacity → { capacity }
 *
 * **실패해도 화면을 오류로 덮지 않습니다** — 시작 버튼을 잠그는 부차 정보입니다.
 * 권위 있는 판정은 언제나 #3/#6의 응답이지 이 훅이 아닙니다(계약 4.7.1절).
 */
export function useCapacity() {
  return useQuery({
    queryKey: queryKeys.capacity(),
    queryFn: async () => {
      const { capacity } = await fetchJson<{ capacity: Capacity }>("/api/capacity");
      return capacity;
    },
    staleTime: 30_000,
  });
}

// #37 GET /api/account/api-key → { apiKey }
export function useApiKeyStatus() {
  return useQuery({
    queryKey: queryKeys.apiKey(),
    queryFn: async () => {
      const { apiKey } = await fetchJson<{ apiKey: ApiKeyStatus }>(
        "/api/account/api-key",
      );
      return apiKey;
    },
    staleTime: 30_000,
  });
}

function useInvalidateKeyAndCapacity() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.apiKey() });
    void client.invalidateQueries({ queryKey: queryKeys.capacity() });
  };
}

/**
 * #38 PUT /api/account/api-key → { apiKey }
 *
 * **연결과 교체가 같은 라우트**이며 부분 수정이 아니라 전체 교체입니다.
 * 키 원문이 존재하는 방향은 이 요청 body 하나뿐입니다 — 호출부는 성공·실패와 무관하게
 * 즉시 폼을 리셋하고, `variables`를 로그·토스트에 싣지 않습니다(D28 6.5.7절).
 */
export function useConnectApiKey() {
  const invalidate = useInvalidateKeyAndCapacity();
  return useMutation({
    retry: 0,
    mutationFn: async (input: { apiKey: string }) => {
      const { apiKey } = await fetchJson<{ apiKey: ApiKeyStatus }>(
        "/api/account/api-key",
        { method: "PUT", body: JSON.stringify(input) },
      );
      return apiKey;
    },
    onSuccess: invalidate,
  });
}

/** #39 DELETE /api/account/api-key → { apiKey } — ⚠️ `{ ok: true }`가 **아닙니다.** */
export function useDisconnectApiKey() {
  const invalidate = useInvalidateKeyAndCapacity();
  return useMutation({
    retry: 0,
    mutationFn: async () => {
      const { apiKey } = await fetchJson<{ apiKey: ApiKeyStatus }>(
        "/api/account/api-key",
        { method: "DELETE" },
      );
      return apiKey;
    },
    onSuccess: invalidate,
  });
}

// #40 POST /api/account/api-key/verify → { apiKey }
export function useVerifyApiKey() {
  const invalidate = useInvalidateKeyAndCapacity();
  return useMutation({
    retry: 0,
    mutationFn: async () => {
      const { apiKey } = await fetchJson<{ apiKey: ApiKeyStatus }>(
        "/api/account/api-key/verify",
        { method: "POST" },
      );
      return apiKey;
    },
    onSuccess: invalidate,
  });
}

/**
 * #41 POST /api/trial-consent → { consent }
 *
 * `consentVersion`은 **`useCapacity` 응답의 값을 그대로** 되돌려 보냅니다.
 * 응답의 `consent.sessionId`로 화면을 분기하지 마세요(멱등 재동의는 기존 행이 돌아옵니다).
 */
export function useGrantTrialConsent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      consentVersion: string;
      sessionId?: string | null;
    }) => {
      const { consent } = await fetchJson<{ consent: TrialConsent }>(
        "/api/trial-consent",
        { method: "POST", body: JSON.stringify(input) },
      );
      return consent;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.capacity() });
    },
  });
}
