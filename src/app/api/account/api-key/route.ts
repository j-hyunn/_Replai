import { z } from "zod";

import { isPlausibleApiKey, keyLast4, verifyApiKey } from "@/lib/ai/verify-key";
import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle, readJson, requireUser } from "@/lib/api/route";
import { DISCONNECTED_API_KEY } from "@/lib/api/serialize";
import { loadApiKeyStatus, recordKeyEvent } from "@/lib/account/api-key";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #37 GET · #38 PUT · #39 DELETE — `/api/account/api-key` (D28, 계약 4.8.1절).
 *
 * ## 응답에 키 원문 필드가 **존재하지 않습니다**
 *
 * 세 라우트 모두 `ApiKeyStatusDto` 하나만 반환하고, 그 타입에는 키 원문 자리가 없습니다.
 * **키 원문이 존재하는 방향은 #38의 요청 body 하나뿐**이며, 그래서 PUT이 "조회 후 편집"이
 * 아니라 **전체 교체**입니다 — 편집하려면 먼저 읽어야 하고, 읽는 순간 원문이 클라이언트로 나갑니다.
 *
 * ## #38 요청 body의 취급
 *
 * `{ apiKey }`는 zod 검증 후 **즉시 `set_user_api_key`의 인자로 넘기고 변수를 재사용하지
 * 않습니다.** 이 라우트에 body 로깅 미들웨어·에러 리포터를 붙이지 마세요 — **body 로깅이 이
 * 설계에서 키가 샐 수 있는 유일한 남은 경로입니다.** 400의 `details.fields`에도 입력값을
 * 되비추지 않습니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 프로바이더 검증 호출 1회(~1.5s) + Vault 쓰기. 상한에 여유가 큽니다(계약 11.2절).
export const maxDuration = 15;

const connectSchema = z.object({
  // 길이만 봅니다. 형식 판정은 `isPlausibleApiKey`가 하고, 진짜 판정은 프로바이더가 합니다.
  apiKey: z.string().min(1).max(400),
});

export function GET() {
  return handle(async () => {
    const { user } = await requireUser();
    const admin = createAdminClient();

    return single("apiKey", await loadApiKeyStatus(admin, user.id));
  });
}

export function PUT(request: Request) {
  return handle(async () => {
    const { user } = await requireUser();
    const body = await readJson(request, connectSchema);

    if (!isPlausibleApiKey(body.apiKey)) {
      // **입력값을 되비추지 않습니다.** 사유만 한국어로 돌려줍니다.
      throw new ApiError("validation_failed", "요청 내용을 확인해 주세요.", {
        details: { fields: { apiKey: "키 형식이 올바르지 않습니다." } },
      });
    }

    // RLS 우회가 필요한 이유: `user_api_keys`는 RLS를 켜고 정책이 0개이고, 접근자 함수 2종은
    // `service_role`에만 실행 권한이 있습니다(04_data_layer.md 3.15절).
    const admin = createAdminClient();
    const previous = await loadApiKeyStatus(admin, user.id);

    const verification = await verifyApiKey(body.apiKey);
    if (!verification.ok) {
      // **저장하지 않습니다.** 검증에 실패한 키를 `connected`로 남기면 면접 중에야 터지고,
      // 그때는 세션이 `paused(byok_key_invalid)`로 멈춥니다.
      throw keyFailureError(verification.code, keyLast4(body.apiKey));
    }

    const { error } = await admin.rpc("set_user_api_key", {
      p_user_id: user.id,
      p_key: body.apiKey,
      p_last4: keyLast4(body.apiKey),
    });

    if (error) {
      // 원시 오류 메시지를 응답에 싣지 않습니다 — 인자가 섞여 올라오는 경로가 있습니다.
      throw new ApiError("internal_error", "키를 저장하지 못했습니다.", { cause: error.message });
    }

    await recordKeyEvent(
      admin,
      user.id,
      previous.keyStatus === "none" ? "api_key_connected" : "api_key_replaced",
    );

    return single("apiKey", await loadApiKeyStatus(admin, user.id));
  });
}

export function DELETE() {
  return handle(async () => {
    const { user } = await requireUser();
    const admin = createAdminClient();

    // **실제 삭제입니다.** 소프트 삭제(`status='disconnected'`)를 두지 않은 이유는
    // "연결을 끊었는데 서버에 키가 남아 있는" 상태를 만들지 않기 위해서입니다
    // (`04_data_layer.md` 9.3절). `before delete` 트리거가 `vault.secrets`의 암호문까지 파기합니다.
    const { error } = await admin.from("user_api_keys").delete().eq("user_id", user.id);
    if (error) {
      throw new ApiError("internal_error", "키를 해제하지 못했습니다.", { cause: error });
    }

    await recordKeyEvent(admin, user.id, "api_key_disconnected");

    // ⚠️ `{ ok: true }`가 **아닙니다** — 훅이 `{ apiKey }`를 기다립니다(계약 4절 #39).
    return single("apiKey", DISCONNECTED_API_KEY);
  });
}

/**
 * 검증 실패 3분류를 계약 13절의 오류로 옮깁니다.
 *
 * **`quota_exhausted`에 재개 가능 시각을 넣지 않습니다** — 사용자 계정의 한도이고 우리는 그
 * 시각을 모릅니다. `unknown`은 우리 쪽 사정일 수 있으므로 키를 `invalid`라고 단정하지 않습니다.
 */
function keyFailureError(
  code: "auth_rejected" | "quota_exhausted" | "unknown",
  last4: string,
): ApiError {
  if (code === "auth_rejected") {
    return new ApiError("byok_key_invalid", "연결하신 키로 접속할 수 없었어요.", {
      details: { keyLast4: last4 },
    });
  }
  if (code === "quota_exhausted") {
    return new ApiError("byok_quota_exhausted", "연결하신 키의 사용 한도가 찼어요.", {
      details: { keyLast4: last4 },
    });
  }
  return new ApiError("provider_unavailable", "지금은 키를 확인할 수 없습니다.");
}
