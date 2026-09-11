import "server-only";

import { resolveCallCredentials, type LlmCallContext } from "@/lib/ai/credentials";
import { normalizeProviderError, type NormalizedProviderError } from "@/lib/ai/errors";
import { agentModel, type AgentRole, type ProviderName } from "@/lib/ai/roles";
import { createAnthropicProvider } from "@/lib/ai/providers/anthropic";
import { createGoogleProvider } from "@/lib/ai/providers/google";
import { consumeSessionQuota } from "@/lib/quota/gate";

/**
 * 프로바이더 추상화 (02_ai_architecture.md 4.4절 · 05_api_contract.md 4.7.2·4.8.2절).
 *
 * 이 모듈이 지키는 것 세 가지:
 *
 * 1. **`ctx`는 선택 인자가 아닙니다.** 기본값을 두거나 생략을 허용하면 "깜빡하면 공용 키"가 됩니다.
 * 2. **`ctx`는 재시도 루프 밖에서 한 번만 만듭니다.** 루프 안에서 다시 만들면 그곳이 폴백 구멍입니다.
 * 3. **소비 기록은 호출을 보내기 전에** 합니다. RPD는 429로 끝난 호출도 세기 때문입니다.
 */

export type ChatMessage = { role: "user" | "assistant"; content: string };

export interface CompletionRequest {
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  /** 구조화 출력 강제용 JSON Schema (`02_ai_contracts.md`의 스키마를 그대로 씁니다). */
  responseSchema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface CompletionResult {
  text: string;
  finishReason: "stop" | "length" | "other";
}

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "done"; finishReason: CompletionResult["finishReason"] };

export interface LlmProvider {
  readonly name: ProviderName;
  complete(req: CompletionRequest, ctx: LlmCallContext): Promise<CompletionResult>;
  stream(req: CompletionRequest, ctx: LlmCallContext): AsyncIterable<StreamChunk>;
}

/**
 * **팩토리입니다 — 키가 박힌 싱글턴이 아닙니다.**
 *
 * 프로바이더 객체는 키를 들고 있지 않고, 호출마다 `ctx.apiKey`로 요청을 구성합니다.
 * 세션 A의 키가 붙은 싱글턴을 세션 B가 재사용하는 사고가 바로 그 캐시에서 납니다.
 */
export function createProvider(name: ProviderName): LlmProvider {
  return name === "anthropic" ? createAnthropicProvider() : createGoogleProvider();
}

/** 폴백 사다리 3단계 백오프 (02_ai_architecture.md 11.4절). 최대 대기 60초. */
const BACKOFF_MS = [1_000, 5_000, 20_000];
const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

function backoff(attempt: number, signal?: AbortSignal): Promise<void> {
  const delay = BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delay);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * 역할 1건의 비스트리밍 호출. **호출 측은 `ctx`를 만들지 않습니다.**
 *
 * `resolveCallCredentials`는 여기서 **루프 밖에서 한 번만** 불립니다. 이 구조가
 * 공용 키 폴백 금지를 주석이 아니라 코드 모양으로 거는 방법입니다(4.8.2절).
 */
export async function runCompletion(
  sessionId: string,
  role: AgentRole,
  buildRequest: (model: ReturnType<typeof agentModel>) => CompletionRequest,
): Promise<CompletionResult> {
  const model = agentModel(role);
  const provider = createProvider(model.provider);
  const request = buildRequest(model);

  // ✅ 루프 "밖"에서 한 번. 재시도는 언제나 같은 ctx로 나갑니다.
  const ctx = await resolveCallCredentials(sessionId, role);

  let lastError: NormalizedProviderError | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // 호출을 보내기 **전에** 기록합니다(4.7.2절). BYOK 세션이면 게이트가 NO_OP입니다.
    await consumeSessionQuota(ctx.sessionId, ctx.fundingSource, ctx.bucket);

    try {
      return await provider.complete(request, ctx);
    } catch (raw) {
      const normalized = normalizeProviderError(raw, ctx, attempt);
      if (!normalized.retryable || attempt === MAX_ATTEMPTS) {
        // 재시도로 회복하지 못한 채 횟수를 다 쓴 경우를 호출 측이 구분할 수 있게 표시합니다.
        if (normalized.retryable) normalized.retriesExhausted = true;
        throw normalized;
      }
      lastError = normalized;
      await backoff(attempt, request.signal);
    }
  }

  // 도달하지 않습니다(마지막 시도는 위에서 던집니다). 타입을 위해 남깁니다.
  throw lastError ?? normalizeProviderError(new Error("exhausted"), ctx, MAX_ATTEMPTS);
}

/** 스트림 재시도 예산 — 계약 10절 3단계("60초 예산 안에서만"). 넘으면 4단계입니다. */
const STREAM_RETRY_BUDGET_MS = 60_000;
/** 3단계 백오프 1s→2s→4s(지터 ±20%). `BACKOFF_MS`와 다른 이유는 예산이 60초이기 때문입니다. */
const STREAM_BACKOFF_MS = [1_000, 2_000, 4_000];

function jittered(delayMs: number): number {
  return Math.round(delayMs * (0.8 + Math.random() * 0.4));
}

/**
 * 스트리밍 호출(면접관 전용).
 *
 * **첫 토큰이 나가기 전까지만 재시도합니다** (계약 10절 3단계 · QA R4).
 *
 * - 토큰이 한 자라도 나간 뒤에는 재시도하지 않습니다 — 같은 답변을 두 번 읽어 주는 것은
 *   회복이 아니라 다른 사고입니다. 이 경우 `retriesExhausted`는 **false**이고 상위는 세션을
 *   옮기지 않습니다.
 * - 예산(60초)을 다 쓰고도 실패하면 `retriesExhausted = true`로 표시해 올립니다. 그 표시가
 *   전이 표 **14행**(`in_progress → paused`, `pause_reason='rate_limited'`)의 진입 조건입니다.
 * - **`attempt`를 정직하게 넘깁니다.** 예전에는 무조건 `MAX_ATTEMPTS`로 넘겨 401 한 번이 곧장
 *   `key_invalid`로 확정됐고, 이는 10.2절 규칙 2("재시도 1회 후 확정") 위반이었습니다.
 *
 * 상위는 `stream_error`로 접어 내려보냅니다(`02_ai_contracts.md` 3.5절).
 */
export async function* runStream(
  sessionId: string,
  role: AgentRole,
  buildRequest: (model: ReturnType<typeof agentModel>) => CompletionRequest,
): AsyncIterable<StreamChunk> {
  const model = agentModel(role);
  const provider = createProvider(model.provider);
  const request = buildRequest(model);

  // ✅ 루프 "밖"에서 한 번. 재시도는 언제나 같은 ctx로 나갑니다(공용 키 폴백 구멍 방지).
  const ctx = await resolveCallCredentials(sessionId, role);
  const deadline = Date.now() + STREAM_RETRY_BUDGET_MS;

  for (let attempt = 1; ; attempt += 1) {
    // 호출을 보내기 **전에** 기록합니다(4.7.2절). 재시도도 프로바이더 호출이므로 매번 셉니다 —
    // RPD는 429로 끝난 호출도 세기 때문입니다.
    await consumeSessionQuota(ctx.sessionId, ctx.fundingSource, ctx.bucket);

    let yieldedAny = false;
    try {
      for await (const chunk of provider.stream(request, ctx)) {
        yieldedAny = true;
        yield chunk;
      }
      return;
    } catch (raw) {
      const normalized = normalizeProviderError(raw, ctx, attempt);

      // 클라이언트가 끊었으면 회복 대상이 아닙니다. 재시도하면 아무도 듣지 않는 답변에
      // 쿼터를 더 태웁니다.
      if (request.signal?.aborted) throw normalized;

      if (yieldedAny || !normalized.retryable) throw normalized;

      const delay = jittered(
        STREAM_BACKOFF_MS[attempt - 1] ?? STREAM_BACKOFF_MS[STREAM_BACKOFF_MS.length - 1],
      );
      const wait = Math.max(delay, (normalized.retryAfterSec ?? 0) * 1000);
      if (attempt >= MAX_ATTEMPTS || Date.now() + wait > deadline) {
        // 4단계 — 예산 소진. 상위가 이 표시를 보고 `paused(rate_limited)`로 보냅니다.
        normalized.retriesExhausted = true;
        throw normalized;
      }

      await backoff2(wait, request.signal);
    }
  }
}

/** `backoff()`와 달리 대기 시간을 직접 받습니다(`Retry-After`가 백오프보다 길 수 있습니다). */
function backoff2(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
