/**
 * 공개 환경변수 — 브라우저 번들에 문자열로 인라인됩니다 (05_deploy.md 1.1절).
 *
 * **이 파일에 들어올 수 있는 것은 3개뿐입니다.** 새 `NEXT_PUBLIC_` 변수를 추가하기 전에
 * "이 값이 배포된 JS에 평문으로 박혀도 되는가"에 먼저 답해야 합니다.
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
} as const;
