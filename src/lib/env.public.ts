/**
 * 공개 환경변수 — 브라우저 번들에 문자열로 인라인됩니다 (05_deploy.md 1.1절).
 *
 * **여기 들어올 수 있는 것은 URL·공개 키·불리언 플래그뿐입니다.** 새 `NEXT_PUBLIC_` 변수를
 * 추가하기 전에 "이 값이 배포된 JS에 평문으로 박혀도 되는가"에 먼저 답해야 합니다.
 * `demoEnabled`는 **키가 아니라 불리언**이라 이 파일에 있습니다 — 데모 키 자체
 * (`GEMINI_API_KEY_DEMO`)는 `env.server.ts`에 있고 브라우저에 절대 닿지 않습니다.
 *
 * `process.env.NEXT_PUBLIC_*`는 빌드 시점에 치환되므로 **구조 분해나 동적 접근을 쓰지 않고**
 * 전체 표현식을 그대로 적습니다.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`공개 환경변수 ${name}가 설정되지 않았습니다.`);
  }
  return value;
}

export const publicEnv = {
  supabaseUrl: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabaseAnonKey: required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  /**
   * 데모 체험 잠금장치 (D35-1). **기본값은 꺼짐**입니다 — 켜려면 운영자가 명시적으로
   * `"true"`를 넣어야 하고, 그 전제는 `GEMINI_API_KEY_DEMO`가 **운영 키와 독립된 RPD를 갖는
   * 다른 프로젝트의 키**라는 실측 확인입니다. 확인 없이 켜면 체험 정원 12세션이 깨집니다.
   *
   * 꺼져 있으면 `/login`에 데모 버튼이 렌더되지 않고 `/demo`·`POST /api/demo/sessions`가 404입니다.
   */
  demoEnabled: process.env.NEXT_PUBLIC_DEMO_ENABLED === "true",
} as const;
