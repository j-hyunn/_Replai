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
      if (!normalized.retryable || attempt === MAX_ATTEMPTS) throw normalized;
      lastError = normalized;
      await backoff(attempt, request.signal);
    }
  }

  // 도달하지 않습니다(마지막 시도는 위에서 던집니다). 타입을 위해 남깁니다.
  throw lastError ?? normalizeProviderError(new Error("exhausted"), ctx, MAX_ATTEMPTS);
}

/**
 * 스트리밍 호출(면접관 전용). **재시도하지 않습니다** — 첫 토큰이 이미 나갔을 수 있고,
 * 같은 답변을 두 번 읽어 주는 것은 회복이 아니라 다른 사고입니다.
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

  const ctx = await resolveCallCredentials(sessionId, role);
  await consumeSessionQuota(ctx.sessionId, ctx.fundingSource, ctx.bucket);

  try {
    yield* provider.stream(request, ctx);
  } catch (raw) {
    throw normalizeProviderError(raw, ctx, MAX_ATTEMPTS);
  }
}
