import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/api/errors";
import { toApiKeyStatusDto, type ApiKeyStatusDto } from "@/lib/api/serialize";
import type { Database, Json } from "@/lib/supabase/database.types";

/**
 * 키 라우트 4종(#37~#40)이 함께 쓰는 조각들 (D28, 계약 4.8.1절).
 *
 * **`select *`를 쓰지 않습니다.** 필요한 컬럼만 읽고 `ApiKeyStatusDto`로 좁힙니다 —
 * 언젠가 컬럼이 하나 늘었을 때 "그대로 돌려주는" 코드가 있으면 그 컬럼이 응답에 새어 나갑니다.
 * (지금은 `public` 스키마에 키 원문 컬럼 자체가 없지만, 그것은 두 번째 방어선입니다.)
 */

type Admin = SupabaseClient<Database>;

/** 행이 없으면 `keyStatus='none'`입니다 — 행 없음이 곧 "연결 안 됨"입니다. */
export async function loadApiKeyStatus(admin: Admin, userId: string): Promise<ApiKeyStatusDto> {
  const { data, error } = await admin
    .from("user_api_keys")
    .select(
      "user_id, provider, key_last4, status, last_verified_at, last_failure_code, last_failure_at, vault_secret_id, created_at, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
  }

  return toApiKeyStatusDto(data);
}

/**
 * 키 수명주기 감사 로그 (`04_data_layer.md` 3.17절).
 *
 * **`session_events`가 아니라 `account_events`입니다** — 지표 1·2의 원천을 오염시키지 않습니다.
 * `detail`에 키 관련 값을 넣지 않습니다: 끝 4자리조차 감사 로그에 쌓아 둘 이유가 없습니다.
 */
export async function recordKeyEvent(
  admin: Admin,
  userId: string,
  eventName:
    | "api_key_connected"
    | "api_key_replaced"
    | "api_key_disconnected"
    | "api_key_verified"
    | "api_key_marked_invalid",
  detail: Json = null,
): Promise<void> {
  const { error } = await admin
    .from("account_events")
    .insert({ user_id: userId, event_name: eventName, detail });

  // 감사 로그 실패로 키 연결을 되돌리지 않습니다 — 키는 이미 Vault에 저장됐고, 그 사실을
  // 되돌리는 편이 로그 한 줄이 비는 것보다 훨씬 나쁩니다.
  if (error) {
    console.error("[api-key] 계정 이벤트를 남기지 못했습니다", { userId, eventName, error });
  }
}
