import "server-only";

import { z } from "zod";

/**
 * 서버 전용 환경변수 단일 접근 지점 (05_deploy.md 1.3절).
 *
 * 라우트가 `process.env`를 직접 읽지 않습니다. 누락된 변수는 **부팅 시** 터지게 하고
 * 런타임에 `undefined`로 조용히 흐르게 두지 않습니다.
 *
 * ⚠️ 이 파일이 읽는 값 중 어떤 것도 `NEXT_PUBLIC_` 접두사를 갖지 않습니다.
 *    `SUPABASE_SERVICE_ROLE_KEY`와 AI 프로바이더 키는 브라우저 번들에 닿으면 즉시·영구 유출입니다.
 */

const serverEnvSchema = z.object({
  // ── Supabase ────────────────────────────────────────────────────────────
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // ── AI 프로바이더 (D11 — Google 단독. anthropic은 껍데기) ────────────────
  AI_PROVIDER: z.enum(["google", "anthropic"]).default("google"),
  GOOGLE_AI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // ── 역할별 모델 ID 오버라이드 (배포 없이 모델을 내리기 위한 레버) ────────
  AI_MODEL_INTERVIEWER: z.string().optional(),
  AI_MODEL_SUMMARIZER: z.string().optional(),
  AI_MODEL_PLANNER: z.string().optional(),
  AI_MODEL_EVALUATOR: z.string().optional(),
  AI_MODEL_COACH: z.string().optional(),

  // ── 내부 라우트 인증 ────────────────────────────────────────────────────
  JOB_SECRET: z.string().min(1),
  CRON_SECRET: z.string().min(1),

  // ── 워치독 (05_deploy.md 5절) ───────────────────────────────────────────
  WATCHDOG_EVALUATING_TIMEOUT_MIN: z.coerce.number().int().positive().default(10),
  PAUSED_AUTO_CLOSE_DAYS: z.coerce.number().int().positive().default(7),

  // ── 예약 게이트 (D27) ───────────────────────────────────────────────────
  AI_QUOTA_GATE_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /** 측정한 RPD 원값. 기본값 없음 — 미설정이면 게이트는 fail-open 입니다. */
  AI_RPD_LIMIT_FLASH_LITE: z.coerce.number().int().positive().optional(),
  AI_RPD_LIMIT_FLASH: z.coerce.number().int().positive().optional(),
  AI_RPD_LIMIT_PRO: z.coerce.number().int().positive().optional(),
  AI_QUOTA_SAFETY_MARGIN_PCT: z.coerce.number().int().min(0).max(100).default(15),
  /** Gemini RPD는 태평양 시간 자정에 리셋됩니다 (05_deploy.md 3.1절, 2026-09-10 확인). */
  AI_QUOTA_RESET_TIMEZONE: z.string().default("America/Los_Angeles"),
  /**
   * 세션당 예약량 (D34 — 02_ai_architecture.md 8.3.1절).
   * `flash`·`pro`는 **휴면 버킷**이라 기본값이 0이며, 0은 정상값이므로 `positive()`가 아니라
   * `nonnegative()`입니다. 요청량 0인 버킷은 DB 함수가 원장 행조차 만들지 않고 건너뜁니다.
   */
  AI_RESERVE_FLASH_LITE_PER_SESSION: z.coerce.number().int().nonnegative().default(34),
  AI_RESERVE_FLASH_PER_SESSION: z.coerce.number().int().nonnegative().default(0),
  AI_RESERVE_PRO_PER_SESSION: z.coerce.number().int().nonnegative().default(0),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n  ");
    throw new Error(`서버 환경변수 검증에 실패했습니다.\n  ${detail}`);
  }

  cached = parsed.data;
  warnIfQuotaGateInert(cached);
  return cached;
}

/**
 * fail-open은 확정 동작이지만 침묵하지는 않습니다 (05_deploy.md 1.2절).
 * 한도가 없으면 예약 게이트는 열린 채로 동작하므로 D27은 실질적으로 미적용입니다.
 *
 * **휴면 버킷은 경고하지 않습니다** (D34) — 세션당 예약량이 0인 버킷은 게이트가 아예 요청하지
 * 않으므로 RPD 값이 없는 것이 정상입니다. 세 버킷을 무조건 경고하면 정상 배포에서 매번 울리는
 * 경고가 되고, 경고가 울리는 것이 정상이 되면 경고는 아무 일도 하지 않습니다.
 */
function warnIfQuotaGateInert(env: ServerEnv): void {
  if (!env.AI_QUOTA_GATE_ENABLED) return;
  const missing = (
    [
      ["AI_RPD_LIMIT_FLASH_LITE", env.AI_RPD_LIMIT_FLASH_LITE, env.AI_RESERVE_FLASH_LITE_PER_SESSION],
      ["AI_RPD_LIMIT_FLASH", env.AI_RPD_LIMIT_FLASH, env.AI_RESERVE_FLASH_PER_SESSION],
      ["AI_RPD_LIMIT_PRO", env.AI_RPD_LIMIT_PRO, env.AI_RESERVE_PRO_PER_SESSION],
    ] as const
  )
    .filter(([, limit, reservePerSession]) => reservePerSession > 0 && limit === undefined)
    .map(([name]) => name);

  if (missing.length > 0) {
    console.warn(
      `[quota-gate] 한도 미설정으로 예약 게이트가 fail-open 상태입니다: ${missing.join(", ")}`,
    );
  }
}
