"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";

/**
 * 브라우저가 지금 어떤 계정으로 붙어 있는가 (D35-2).
 *
 * **AppShell 하나를 위한 훅입니다.** 익명(데모) 사용자에게는 네비게이션을 그릴 수 없고
 * (`/dashboard`·`/sessions`·`/documents`·`/settings`가 전부 `/login`으로 튕깁니다),
 * 그 판정에 필요한 값이 `user.is_anonymous` 하나뿐입니다.
 *
 * **API 라우트를 새로 만들지 않습니다** — 익명 사용자는 `/api/account`를 부를 수 없고(403),
 * Supabase 브라우저 클라이언트가 이미 쿠키에서 같은 사실을 읽을 수 있습니다.
 * 프록시는 `is_anonymous`를, 라우트·DB는 `profiles.account_type`을 봅니다 — 둘은 가입 시점에
 * 확정되는 같은 값의 사본입니다.
 */
export function useIsAnonymousUser() {
  const query = useQuery({
    queryKey: ["authUser"],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      return { isAnonymous: data.user?.is_anonymous === true };
    },
    staleTime: 5 * 60_000,
    retry: 0,
  });

  // 모르는 동안은 **실계정으로 봅니다** — 헤더가 깜빡이며 네비게이션이 사라지는 것보다
  // 낫고, 익명 사용자가 잘못 눌러도 프록시가 `/login`으로 보냅니다.
  return query.data?.isAnonymous === true;
}
