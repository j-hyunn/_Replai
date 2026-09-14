import "server-only";

import type { LlmProvider } from "@/lib/ai/provider";

/**
 * Anthropic 프로바이더 — **껍데기입니다** (02_ai_architecture.md 4.4절 · 4.3절).
 *
 * MVP는 D11로 Google 단독이고 `ANTHROPIC_API_KEY`는 설정하지 않습니다. 예산이 열릴 때
 * 갈아 끼울 자리만 먼저 둡니다. **호출하면 즉시 실패합니다** — 조용히 공용 경로로 흐르거나
 * 빈 응답을 돌려주는 것보다 터지는 편이 낫습니다.
 *
 * 구현할 때 주의(4.3절): 4.6 이상 모델은 `budget_tokens`가 없어지고
 * `thinking: { type: "adaptive" }` + `output_config.effort`를 씁니다. 구조화 출력은
 * `output_config.format`이며 폐기된 `output_format`을 쓰지 않습니다. assistant prefill은 400입니다.
 * **키는 여기서도 모듈 스코프에 두지 않고 `ctx.apiKey`로 요청마다 구성합니다.**
 */
export function createAnthropicProvider(): LlmProvider {
  const notImplemented = () => {
    throw new Error("anthropic provider is not implemented (MVP is google-only, D11)");
  };

  return {
    name: "anthropic",
    complete: notImplemented,
    stream: notImplemented,
  };
}
