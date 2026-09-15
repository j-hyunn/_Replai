import { readStoredUserKey } from "@/lib/ai/credentials";
import { verifyApiKey } from "@/lib/ai/verify-key";
import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle, requireUser } from "@/lib/api/route";
import { loadApiKeyStatus, recordKeyEvent } from "@/lib/account/api-key";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #40 `POST /api/account/api-key/verify` — **검증만 재실행**합니다 (D28, 계약 4.8.1절).
 *
 * 성공이면 `status='connected'` + `last_verified_at=now()`, 실패면 3분류를 `last_failure_code`에
 * 기록하고 `api_key_marked_invalid`를 남깁니다. **키를 바꾸지 않습니다** — 교체는 #38입니다.
 *
 * ## 실패해도 오류 응답이 아닙니다
 *
 * 훅은 성공·실패 어느 쪽이든 `{ apiKey }`를 받아 화면을 갱신합니다. "확인해 보니 키가 죽어
 * 있었다"는 **정상적인 검증 결과**이고, 그 사실이 `keyStatus='invalid'`와 `lastFailureCode`로
 * 나갑니다. 409로 던지면 프론트가 그 두 값을 읽을 방법이 사라집니다.
 *
 * **복호화는 이 라우트가 직접 하지 않습니다.** Vault 접근자를 부르는 코드는
 * `src/lib/ai/credentials.ts` 하나여야 하므로(05_deploy.md CI 검사 3), 여기서는 그 파일의
 * `readStoredUserKey()`를 통해 평문을 받아 **검증 호출에 한 번 쓰고 버립니다.**
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export function POST() {
  return handle(async () => {
    const { user } = await requireUser();

    // RLS 우회가 필요한 이유: `user_api_keys`는 RLS를 켜고 정책이 0개이며,
    // Vault 접근자 함수는 `service_role`에만 실행 권한이 있습니다(04_data_layer.md 3.15절).
    const admin = createAdminClient();
    const current = await loadApiKeyStatus(admin, user.id);

    if (current.keyStatus === "none") {
      throw new ApiError("not_found", "연결된 키가 없습니다.");
    }

    const key = await readStoredUserKey(user.id, admin);

    // 행은 있는데 원문을 꺼낼 수 없다 = `status='invalid'`라 함수가 아무 행도 돌려주지 않은
    // 경우입니다. 재검증할 대상이 없으므로 현재 상태를 그대로 돌려줍니다.
    if (!key) return single("apiKey", current);

    const verification = await verifyApiKey(key);

    if (verification.ok) {
      await admin
        .from("user_api_keys")
        .update({
          status: "connected",
          last_verified_at: new Date().toISOString(),
          // 고쳐진 키에 옛 오류가 남아 있으면 사용자는 없는 문제를 계속 봅니다.
          last_failure_code: null,
          last_failure_at: null,
        })
        .eq("user_id", user.id);

      await recordKeyEvent(admin, user.id, "api_key_verified");
      return single("apiKey", await loadApiKeyStatus(admin, user.id));
    }

    // `user_api_keys_status_shape` CHECK — `invalid`인데 사유가 없으면 사용자에게 무엇을
    // 고치라고 말할 수 없습니다. 두 컬럼을 **함께** 씁니다.
    await admin
      .from("user_api_keys")
      .update({
        status: "invalid",
        last_failure_code: verification.code,
        last_failure_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    await recordKeyEvent(admin, user.id, "api_key_marked_invalid", {
      failureCode: verification.code,
    });

    return single("apiKey", await loadApiKeyStatus(admin, user.id));
  });
}
