import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle, requireUser } from "@/lib/api/route";
import type { CapacityDto, KeyStatus } from "@/lib/api/serialize";
import { CURRENT_TRIAL_CONSENT_VERSION } from "@/lib/consent/trial-consent";
import { peekCapacity } from "@/lib/quota/gate";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #36 `GET /api/capacity` — **버튼을 미리 잠그기 위한 라우트**입니다 (계약 4.7.5절).
 *
 * ## 응답에 수치를 담지 않습니다
 *
 * `limitCalls`·`heldCalls`·`available`·버킷 이름 — **어느 것도 이 응답에 없고 앞으로도 없습니다.**
 * 클라이언트에 서비스 전체 여력을 노출할 이유가 없고, 내부 용어가 새는 경로가 됩니다.
 * 나가는 것은 "지금 시작할 수 있는가"와 "왜 못 하는가"의 **판정 결과**뿐입니다.
 *
 * ## 이 응답은 권위가 아닙니다
 *
 * 문 앞 조회는 원자적이지 않습니다. 권위 있는 판정은 **#3·#6의 응답**이며, 이 훅이 `true`를
 * 줬는데 #6이 503을 돌려주는 것은 버그가 아니라 설계에 포함된 사실입니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export function GET() {
  return handle(async () => {
    const { user } = await requireUser();

    // RLS 우회가 필요한 이유: `user_api_keys`와 `ai_quota_ledger`는 **RLS를 켜고 정책이 0개**라
    // 사용자 문맥 클라이언트로는 한 행도 읽을 수 없습니다(04_data_layer.md 5.2·3.13절).
    const admin = createAdminClient();

    const [key, profile, consent] = await Promise.all([
      admin.from("user_api_keys").select("status").eq("user_id", user.id).maybeSingle(),
      admin.from("profiles").select("trial_consumed_at").eq("id", user.id).maybeSingle(),
      admin
        .from("trial_consents")
        .select("id")
        .eq("user_id", user.id)
        .eq("consent_version", CURRENT_TRIAL_CONSENT_VERSION)
        .maybeSingle(),
    ]);

    const failure = key.error ?? profile.error ?? consent.error;
    if (failure) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: failure });
    }

    const keyStatus = readKeyStatus(key.data?.status ?? null);
    // 프로필 행이 없으면(=가입 트리거 직후의 경합) 아직 체험을 쓴 적이 없는 것으로 봅니다.
    const trialConsumed = (profile.data?.trial_consumed_at ?? null) !== null;
    const trialStatus = trialConsumed ? "consumed" : "available";

    // ── 재원 판정 — #3의 `resolveFundingSource`와 **같은 순서**입니다 ──────────
    // ① 유효한 키가 있으면 `byok`. 원장을 읽지 않습니다.
    // ② 아니면 체험이 남아 있을 때만 `trial_shared`.
    // ③ 둘 다 아니면 세션을 만들 수 없습니다(`null`).
    if (keyStatus === "connected") {
      const capacity: CapacityDto = {
        // **키가 연결돼 있으면 여력과 무관하게 항상 `true`입니다.** 다시 계산하지 않습니다.
        canStartSession: true,
        keyStatus,
        trialStatus,
        nextFundingSource: "byok",
        // 동의는 **체험에만** 필요합니다. BYOK 세션은 이 가드를 전혀 타지 않습니다.
        requiresTrialConsent: false,
        consentVersion: CURRENT_TRIAL_CONSENT_VERSION,
        availableAtIso: null,
      };
      return single("capacity", capacity);
    }

    if (trialConsumed) {
      // 체험 소진은 **기다려도 풀리지 않는 벽**입니다 — `availableAtIso`를 채우면 거짓말이 됩니다.
      const capacity: CapacityDto = {
        canStartSession: false,
        keyStatus,
        trialStatus,
        nextFundingSource: null,
        requiresTrialConsent: false,
        consentVersion: CURRENT_TRIAL_CONSENT_VERSION,
        availableAtIso: null,
      };
      return single("capacity", capacity);
    }

    const peeked = await peekCapacity(user.id, "trial_shared", admin);

    const capacity: CapacityDto = {
      canStartSession: peeked.hasCapacity,
      keyStatus,
      trialStatus,
      nextFundingSource: peeked.hasCapacity ? "trial_shared" : null,
      // **현재 문구 버전**의 동의가 없으면 참입니다. 과거 버전 동의만 있어도 참입니다(계약 4.9.2절 R9).
      requiresTrialConsent: consent.data === null,
      consentVersion: CURRENT_TRIAL_CONSENT_VERSION,
      availableAtIso: peeked.availableAtIso,
    };

    return single("capacity", capacity);
  });
}

/** 행이 없으면 `'none'`입니다 — 그것이 "연결 안 됨"의 표현이고 별도 상태 값을 두지 않았습니다. */
function readKeyStatus(value: string | null): KeyStatus {
  if (value === "connected") return "connected";
  if (value === "invalid") return "invalid";
  return "none";
}
