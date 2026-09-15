"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api/fetch-json";
import { queryKeys } from "@/lib/api/query-keys";
import type { DemoCapacity, JobRole, Modality, Session } from "@/lib/api/types";
import { signInAnonymouslyForDemo } from "@/lib/auth/sign-in";

/**
 * 데모 훅 2종 (06_ui_plan.md 4.15절 · 계약 #42·#43 · D35).
 *
 * | 훅 | 엔드포인트 | 응답 |
 * |---|---|---|
 * | `useDemoCapacity` | `GET /api/demo/capacity` (#43, **미인증 공개**) | `{ demoCapacity: DemoCapacity }` |
 * | `useStartDemo` | 익명 로그인 → `POST /api/demo/sessions` (#42) | `{ session: Session }` |
 *
 * **`useCapacity`(#36)와 섞지 않습니다.** `DemoCapacity`에는 `keyStatus`·`trialStatus`·
 * `requiresTrialConsent`가 없습니다 — 익명 사용자는 키를 연결할 수 없고 체험 1회를 갖지도
 * 않습니다. 두 타입을 합치려 하면 익명 사용자에게 키 연결 CTA를 그리는 분기가 따라옵니다.
 */

/** #43 `GET /api/demo/capacity` → `{ demoCapacity }` */
export function useDemoCapacity() {
  return useQuery({
    queryKey: queryKeys.demoCapacity(),
    queryFn: async () => {
      const { demoCapacity } = await fetchJson<{ demoCapacity: DemoCapacity }>(
        "/api/demo/capacity",
      );
      return demoCapacity;
    },
    staleTime: 30_000,
    // 여력 조회 실패가 화면을 덮지 않도록 재시도를 1회로 줄입니다 — 권위는 #42의 응답입니다.
    retry: 1,
  });
}

export type StartDemoInput = {
  jobRole: JobRole;
  modality: Modality;
  /** **`useDemoCapacity` 응답의 값을 그대로** 되돌려 보냅니다. 하드코딩하면 409입니다. */
  consentVersion: string;
};

/**
 * #42 `POST /api/demo/sessions` → `{ session: Session }`
 *
 * **익명 로그인이 이 뮤테이션 안에 들어 있습니다.** 두 단계를 화면이 나눠 들면 로그인만 성공하고
 * 세션 생성이 실패한 상태를 화면이 직접 관리해야 합니다 — 여기서는 한 번의 `mutate`입니다.
 * 쿠키가 살아 있으면 `signInAnonymouslyForDemo()`가 **같은 계정을 재사용**합니다(D35-2).
 *
 * ⚠️ 응답 봉투는 **한 겹**이고 이동할 id는 **`session.id`** 입니다 — 별도 `sessionId` 필드가
 * 없습니다. 그리고 `session.status`는 **항상 `ready`** 입니다(라우트가 예약·플래너까지
 * 한 요청에서 끝냅니다). `configuring`이 오면 버그이며, `routeForStatus()`에 넘기면 데모
 * 방문자가 쓰지 않는 `/sessions/new`로 떨어집니다. **`usePrepareSession`(#6)을 따로 부르지
 * 마세요** — 이중 예약입니다.
 */
export function useStartDemo() {
  return useMutation({
    // 8~20초가 걸리는 요청이고 실패는 전부 분기해야 하는 값입니다 — 자동 재시도 금지.
    retry: 0,
    mutationFn: async (input: StartDemoInput): Promise<Session> => {
      const failure = await signInAnonymouslyForDemo();
      if (failure) throw new Error(failure.error);

      const { session } = await fetchJson<{ session: Session }>("/api/demo/sessions", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return session;
    },
  });
}
