import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env.public";

/**
 * 인증 미들웨어 (05_api_contract.md 7.2절).
 *
 * 하는 일: 세션 쿠키 갱신 + 보호 라우트 판정.
 * **하지 않는 일: 리소스 소유권 확인.** 미들웨어는 "로그인했는가"만 봅니다 —
 * "이 세션의 주인인가"는 각 라우트가 `server.ts`로 다시 확인합니다 (7.3절).
 */

/** 로그인이 필요한 화면 (`(app)` 라우트 그룹). */
const PROTECTED_PAGE_PREFIXES = [
  "/dashboard",
  "/sessions",
  "/documents",
  "/settings",
];

/** 미들웨어가 인증을 판정하지 않는 API — 라우트가 자기 시크릿을 직접 검사합니다. */
const SECRET_AUTH_API_PREFIXES = ["/api/internal/", "/api/cron/"];

export async function proxy(request: NextRequest) {
  // 이 응답 객체에 갱신된 쿠키가 실립니다. 그대로 반환해야 세션이 유지됩니다.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // ⚠️ getUser()를 매 요청 부르는 것이 토큰 갱신의 트리거입니다.
  //    빼면 "로그인했는데 로그아웃됨" 버그가 납니다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (SECRET_AUTH_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return response;
  }

  if (pathname.startsWith("/api/")) {
    if (!user) {
      // API는 언제나 JSON 401입니다. 302로 리다이렉트하면 fetch가 로그인 HTML을 받아
      // res.json()이 SyntaxError로 터지고 프론트에는 "알 수 없는 오류"만 보입니다.
      return NextResponse.json(
        {
          error: {
            code: "unauthenticated",
            message: "로그인이 필요합니다.",
          },
        },
        { status: 401 },
      );
    }
    return response;
  }

  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtectedPage && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && user) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // 정적 자산과 이미지 최적화를 제외한 전부
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
