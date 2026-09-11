import "server-only";

import type { LlmCallContext } from "@/lib/ai/credentials";
import { agentModel } from "@/lib/ai/roles";
import type { CompletionRequest, CompletionResult, LlmProvider } from "@/lib/ai/provider";

/**
 * Google AI Studio (Gemini) 프로바이더 — D11 단독 프로바이더.
 *
 * **모듈 스코프에 키가 없습니다.** `createGoogleProvider()`가 돌려주는 객체도 키를 들고 있지
 * 않고, 요청마다 `ctx.apiKey`로 헤더를 만듭니다. 키를 클라이언트 인스턴스에 캐시하면
 * 세션 A의 키로 세션 B를 부르는 사고가 납니다(02_ai_architecture.md 4.4.1절 규칙 2).
 *
 * **오류를 그대로 던지지 않습니다.** 상위(`provider.ts`)가 `normalizeProviderError()`를
 * 통과시키며, 이 파일은 판정에 필요한 `status`·`code`·`message`만 담은 객체를 던집니다 —
 * `Response`나 SDK 예외를 그대로 올리면 요청 헤더(= 키)가 붙어 올라갑니다.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

type GoogleErrorPayload = { error?: { code?: number; status?: string; message?: string } };

class GoogleApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.code = code;
  }
}

function requireKey(ctx: LlmCallContext): string {
  // 정합성 단언 (4.4.1절 규칙 3) — byok인데 키가 비었으면 **호출하지 않고 즉시 실패**합니다.
  // 공용 키로 대체하지 않습니다.
  if (ctx.fundingSource === "byok" && !ctx.apiKey) {
    throw new GoogleApiError(401, "API_KEY_INVALID", "missing user credential");
  }
  if (!ctx.apiKey) {
    throw new GoogleApiError(401, "API_KEY_INVALID", "missing credential");
  }
  return ctx.apiKey;
}

function toBody(req: CompletionRequest, modelParams: { temperature: number; maxOutputTokens: number }) {
  return {
    contents: req.messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    generationConfig: {
      temperature: req.temperature ?? modelParams.temperature,
      maxOutputTokens: req.maxOutputTokens ?? modelParams.maxOutputTokens,
      ...(req.responseSchema
        ? { responseMimeType: "application/json", responseSchema: req.responseSchema }
        : {}),
    },
  };
}

async function readError(response: Response): Promise<GoogleApiError> {
  let payload: GoogleErrorPayload = {};
  try {
    payload = (await response.json()) as GoogleErrorPayload;
  } catch {
    // 본문이 JSON이 아니면 상태 코드만으로 판정합니다.
  }
  return new GoogleApiError(
    response.status,
    payload.error?.status,
    payload.error?.message ?? `google api error ${response.status}`,
  );
}

type GenerateContentResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
};

function textOf(payload: GenerateContentResponse): string {
  return (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
}

function finishReasonOf(payload: GenerateContentResponse): CompletionResult["finishReason"] {
  const reason = payload.candidates?.[0]?.finishReason;
  if (reason === "STOP") return "stop";
  if (reason === "MAX_TOKENS") return "length";
  return "other";
}

export function createGoogleProvider(): LlmProvider {
  return {
    name: "google",

    async complete(req, ctx) {
      const { model, params } = agentModel(ctx.role);
      const response = await fetch(`${API_BASE}/models/${model}:generateContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // 키는 여기서만 쓰이고 이 함수 밖으로 나가지 않습니다.
          "x-goog-api-key": requireKey(ctx),
        },
        body: JSON.stringify(toBody(req, params)),
        signal: req.signal,
      });

      if (!response.ok) throw await readError(response);

      const payload = (await response.json()) as GenerateContentResponse;
      return { text: textOf(payload), finishReason: finishReasonOf(payload) };
    },

    async *stream(req, ctx) {
      const { model, params } = agentModel(ctx.role);
      const response = await fetch(
        `${API_BASE}/models/${model}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": requireKey(ctx),
          },
          body: JSON.stringify(toBody(req, params)),
          signal: req.signal,
        },
      );

      if (!response.ok) throw await readError(response);
      if (!response.body) throw new GoogleApiError(502, undefined, "empty stream body");

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let finishReason: CompletionResult["finishReason"] = "other";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;

        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");

          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;

          const chunk = JSON.parse(data) as GenerateContentResponse;
          const text = textOf(chunk);
          if (text) yield { type: "text", text };
          if (chunk.candidates?.[0]?.finishReason) finishReason = finishReasonOf(chunk);
        }
      }

      yield { type: "done", finishReason };
    },
  };
}
