import "server-only";

import { ApiError } from "@/lib/api/errors";

/**
 * `enforce_session_funding_rules` 트리거의 예외를 API 오류로 번역합니다
 * (`04_data_layer.md` 15.4절 · D35-2).
 *
 * 이 트리거는 **계정 유형 ↔ 재원 짝**을 세션 INSERT에서 강제합니다.
 *
 * | 예외 | 뜻 | 여기서의 판정 |
 * |---|---|---|
 * | `account_funding_mismatch:demo` | 익명(데모) 계정이 `trial_shared`·`byok` 세션을 만들려 함 | **403 `forbidden`** |
 * | `account_funding_mismatch:registered` | 실계정이 `demo` 세션을 만들려 함 | **503 `provider_unavailable`** |
 *
 * **왜 둘의 상태가 다른가.** 앞의 것은 사용자가 실제로 시도할 수 있는 일이고(익명 세션에서
 * `POST /api/sessions`를 직접 호출), 답은 "당신은 이걸 할 수 없다" — 403이 정확합니다.
 * 뒤의 것은 사용자가 만들 수 없는 조합이라 **우리 코드가 재원을 잘못 넣었다는 신호**이며,
 * 사용자에게는 "지금은 진행할 수 없다"로 보이는 503이 맞습니다.
 *
 * **어느 쪽도 500으로 흘리지 않습니다.** 500이 되면 프론트의 일반 오류 처리에 흡수되어
 * 익명 계정이 체험 정원을 노리는 시도가 로그에서도 구분되지 않습니다.
 *
 * 트리거 예외가 아니면 `null`을 돌려주므로 호출 측이 원래의 처리를 이어 갑니다.
 */
export function translateFundingRuleError(message: string | undefined): ApiError | null {
  if (!message) return null;

  if (message.includes("account_funding_mismatch:demo")) {
    console.warn("[funding] 익명 계정이 데모 외 재원으로 세션을 만들려 했습니다", { message });
    return new ApiError("forbidden", "데모 체험 중에는 새 면접을 만들 수 없습니다.", {
      cause: message,
    });
  }

  if (message.includes("account_funding_mismatch")) {
    console.error("[funding] 계정 유형↔재원 짝이 어긋났습니다", { message });
    return new ApiError("provider_unavailable", "지금은 면접을 시작할 수 없습니다.", {
      cause: message,
    });
  }

  return null;
}
