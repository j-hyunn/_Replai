import "server-only";

import type { KeyFailureCode } from "@/lib/api/serialize";

/**
 * 사용자 키 검증 (#38 연결·교체 / #40 재검증 · D28).
 *
 * **`credentials.ts`를 거치지 않는 유일한 프로바이더 호출입니다.** #38이 검증하는 키는 아직
 * 저장되지 않았으므로 `get_user_api_key()`로 꺼내 올 수 없습니다 — 요청 body에서 온 평문을
 * 그대로 한 번 써 보는 것이 이 함수의 전부이고, **그 값을 어디에도 남기지 않습니다.**
 *
 * 가장 싼 인증 검사인 모델 목록 조회를 씁니다. 생성 호출을 쓰면 검증만으로 사용자 쿼터를
 * 소비하게 되고, "키를 연결했을 뿐인데 한도가 줄었다"가 됩니다.
 */

const MODELS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** 검증 호출이 15초 상한(계약 11.2절)을 잡아먹지 않도록 스스로 끊습니다. */
const TIMEOUT_MS = 8_000;

export type KeyVerification =
  | { ok: true }
  /** 실패 3분류 (계약 10.2절) — `user_api_keys.last_failure_code`에 그대로 들어갑니다. */
  | { ok: false; code: KeyFailureCode };

/**
 * 형식 검증 — **프로바이더를 부르기 전에** 명백히 키가 아닌 입력을 거릅니다.
 *
 * 넉넉하게 잡습니다. 좁게 잡으면 프로바이더가 키 형식을 바꾼 날 **멀쩡한 키가 400으로 거절**되고,
 * 그 사실을 우리가 먼저 알 방법이 없습니다. 진짜 판정은 언제나 프로바이더의 응답입니다.
 */
export function isPlausibleApiKey(value: string): boolean {
  return /^[A-Za-z0-9_-]{20,200}$/u.test(value);
}

/** 끝 4자리. 로그·화면·이벤트에 남길 수 있는 **유일한** 키 관련 값입니다. */
export function keyLast4(value: string): string {
  return value.slice(-4);
}

export async function verifyApiKey(apiKey: string): Promise<KeyVerification> {
  let response: Response;
  try {
    response = await fetch(`${MODELS_ENDPOINT}?pageSize=1`, {
      method: "GET",
      // **쿼리스트링이 아니라 헤더로 보냅니다.** URL에 실으면 프록시 로그와 예외 메시지의
      // `request.url`에 키 원문이 그대로 남습니다.
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // 네트워크 실패를 `auth_rejected`로 기록하면 **멀쩡한 키가 `invalid`로 표시**되고
    // 사용자는 있지도 않은 키 문제를 고치러 갑니다.
    console.error("[verify-key] 프로바이더에 닿지 못했습니다", { error });
    return { ok: false, code: "unknown" };
  }

  if (response.ok) return { ok: true };

  // 401·403은 인증 거절, 400은 키 형식 자체가 거부된 경우입니다 — 셋 다 사용자가 키를 다시
  // 발급해야 풀립니다. 백오프로 회복되지 않으므로 `quota_exhausted`와 섞지 않습니다.
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return { ok: false, code: "auth_rejected" };
  }

  // **`quota_exhausted`에는 재개 가능 시각을 넣지 않습니다** — 사용자 계정의 한도이고
  // 우리는 그 시각을 모릅니다(계약 10.2절·13절).
  if (response.status === 429) return { ok: false, code: "quota_exhausted" };

  return { ok: false, code: "unknown" };
}
