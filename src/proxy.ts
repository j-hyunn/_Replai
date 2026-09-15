import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env.public";

/**
 * 인증 미들웨어 (05_api_contract.md 7.2절 · D35-2).
 *
 * 하는 일: 세션 쿠키 갱신 + 보호 라우트 판정 + **익명(데모) 사용자의 통과 범위 제한**.
 * **하지 않는 일: 리소스 소유권 확인.** 미들웨어는 "로그인했는가"와 "익명인가"만 봅니다 —
 * "이 세션의 주인인가"는 각 라우트가 `server.ts`로 다시 확인합니다 (7.3절).
 *
 * ## D35 이후 판정이 2차원입니다
 *
 * 예전에는 "로그인했는가" 하나였지만, 이제 **로그인한 사용자 중에도 익명(`account_type='demo'`)이
 * 있습니다.** 익명 사용자가 `POST /api/sessions`에 닿으면 `trial_shared` 세션을 만들어 하루
 * 12세션의 체험 정원을 먹으므로, 통과 범위를 **데모 여정으로만** 좁힙니다.
 *
 * | | 미인증 | 익명(데모) | 실계정 |
 * |---|---|---|---|
 * | `/`, `/login`, `/demo` | 통과 | 통과 | 통과(`/login`은 `/dashboard`로) |
 * | `/sessions/{id}/ready\|interview\|report\|transcript` | → `/login` | **통과** | 통과 |
 * | `/dashboard` · `/sessions` · `/sessions/new` · `/documents` · `/settings/*` | → `/login` | **→ `/login`** | 통과 |
 * | `GET /api/demo/capacity` | 통과 | 통과 | 통과 |
 * | `POST /api/demo/sessions` | 401 | 통과 | 403(라우트) |
 * | `/api/sessions/{id}/…` | 401 | **통과**(소유권은 라우트가 봄) | 통과 |
 * | `POST /api/sessions` · `/api/account/*` · `/api/documents/*` · `/api/dashboard` | 401 | **403** | 통과 |
 *
 * **익명 판정은 `user.is_anonymous`로 합니다** — 미들웨어에서 `profiles`를 읽으면 전 요청에
 * DB 왕복이 하나 붙습니다. `profiles.account_type`은 같은 값의 사본이며(가입 트리거가 복사),
 * 라우트·DB 가드가 그쪽을 봅니다. **두 값이 갈라질 수 없는 이유는 둘 다 가입 시점에 확정되고
 * 이후 바뀌지 않기 때문입니다**(D35-2가 계정 승격을 `[later]`로 둔 것이 이 성질을 지킵니다).
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

/**
 * **미인증으로 열려 있는 유일한 API**입니다. `/demo`는 로그인 전 화면이고, 방문자가 시작 버튼을
 * 누르기 전에는 익명 계정조차 없습니다. 여기에 라우트를 더 추가하기 전에 "미인증 호출자에게
 * 이 응답을 줘도 되는가"에 먼저 답해야 합니다.
 */
const PUBLIC_API_PREFIXES = ["/api/demo/capacity"];

/**
 * 익명(데모) 사용자가 볼 수 있는 화면. `/sessions/{id}/…`는 **세션 상세 4화면만** 열고
 * `/sessions`(목록)·`/sessions/new`(설정)는 닫습니다 — 데모에는 목록도 설정 화면도 없습니다.
 */
const DEMO_SESSION_PAGE_PATTERN =
  /^\/sessions\/[^/]+\/(ready|interview|report|transcript)\/?$/u;

/** 익명 사용자가 부를 수 있는 API. 세션 하위 API는 **소유권을 라우트가 다시 검사**합니다. */
const DEMO_ALLOWED_API_PATTERNS = [
  /^\/api\/demo\//u,
  // `POST /api/sessions`(정확히 이 경로)는 **제외**입니다 — 아래 판정에서 걸러집니다.
  /^\/api\/sessions\/[^/]+(\/.*)?$/u,
  /^\/api\/trial-consent\/?$/u,
];

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

  // `is_anonymous`가 `true`인 진짜 사용자입니다 — 로그인하지 않은 것이 아닙니다(D35-2).
  const isDemoUser = user?.is_anonymous === true;

  if (pathname.startsWith("/api/")) {
    if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return response;
    }

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

    if (isDemoUser && !isDemoAllowedApi(pathname)) {
      // **403이지 401이 아닙니다** — 로그인은 돼 있고, 이 계정이 못 하는 일입니다.
      return NextResponse.json(
        {
          error: {
            code: "forbidden",
            message: "데모 체험 중에는 사용할 수 없는 기능입니다.",
          },
        },
        { status: 403 },
      );
    }

    return response;
  }

  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // 익명 사용자는 데모 여정 4화면만 봅니다. 나머지는 **미인증과 같은 취급**으로 `/login`입니다 —
  // 화면 코드가 "익명 사용자가 대시보드에 들어온 경우"를 분기할 필요가 없어집니다(도달 불가).
  if (isProtectedPage && isDemoUser && !DEMO_SESSION_PAGE_PATTERN.test(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  if (isProtectedPage && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // **익명 사용자는 `/login`에 머물러야 합니다.** 여기서 `/dashboard`로 보내면 위 규칙이 다시
  // `/login`으로 돌려보내 무한 루프가 되고, `/login`은 데모 방문자가 계정을 만드는 유일한 출구입니다.
  if (pathname === "/login" && user && !isDemoUser) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

/**
 * 익명 사용자가 부를 수 있는 API인가.
 *
 * **`POST /api/sessions`(정확히 `/api/sessions`)는 여기서 반드시 거짓이어야 합니다** —
 * `/api/sessions/{id}/…`(세션 하위)와 한 글자 차이이고, 정규식을 `^\/api\/sessions/`로 느슨하게
 * 쓰면 체험 정원을 먹는 경로가 그대로 열립니다. 메서드를 보지 않는 이유는 `GET /api/sessions`
 * (목록)도 익명에게 줄 것이 없기 때문입니다.
 */
function isDemoAllowedApi(pathname: string): boolean {
  if (pathname === "/api/sessions" || pathname === "/api/sessions/") return false;
  return DEMO_ALLOWED_API_PATTERNS.some((pattern) => pattern.test(pathname));
}

export const config = {
  matcher: [
    // 정적 자산과 이미지 최적화를 제외한 전부
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
