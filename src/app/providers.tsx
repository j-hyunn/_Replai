"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { isApiClientError } from "@/lib/api/fetch-json";

/**
 * 서버 상태는 TanStack Query가 담당합니다 (06_ui_plan.md 2.3절).
 * 데이터 페칭 라이브러리이며 **렌더링하는 DOM이 하나도 없으므로** shadcn-only 제약과 무관합니다.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry(failureCount, error) {
              // 4xx는 다시 불러도 같은 답입니다. 401은 로그인 유도가 답이고,
              // 409는 정상 동작인 경우가 있어(계약 13절) 재시도가 의미 없습니다.
              if (isApiClientError(error) && error.status < 500) return false;
              return failureCount < 2;
            },
          },
          mutations: {
            // 뮤테이션은 부작용이 있으므로 자동 재시도하지 않습니다.
            retry: 0,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
