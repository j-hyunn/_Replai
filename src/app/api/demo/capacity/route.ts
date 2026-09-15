import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle } from "@/lib/api/route";
import { CURRENT_DEMO_CONSENT_VERSION } from "@/lib/consent/trial-consent";
import { assertDemoEnabled } from "@/lib/demo/policy";
import { peekCapacity } from "@/lib/quota/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * #43 `GET /api/demo/capacity` — `/demo` 화면의 시작 버튼을 미리 잠그기 위한 라우트.
 *
 * **이 라우트만 미인증으로 열려 있습니다.** `/demo`는 로그인 전 화면이고, 방문자가 버튼을 누르기
 * 전에는 익명 계정조차 없습니다. 그래서 프록시의 401 규칙에서 빠져 있습니다
 * (`src/proxy.ts`의 `PUBLIC_API_PREFIXES`).
 *
 * ## 수치를 담지 않습니다 (#36과 같은 규칙)
 *
 * `limitCalls`·`heldCalls`·버킷 이름 — 어느 것도 나가지 않습니다. 나가는 것은 "지금 시작할 수
 * 있는가"와 "왜 못 하는가"의 **판정 결과**뿐입니다. "데모 정원"·"하루 10회" 같은 표현을
 * 화면에 쓰지 않는다는 금칙(`06_ui_plan.md`)이 응답 모양에서부터 지켜집니다.
 *
 * ## 이 응답은 권위가 아닙니다
 *
 * 문 앞 조회는 원자적이지 않습니다. 권위 있는 판정은 **#42의 응답**이며, 여기서 `true`를 줬는데
 * #42가 503을 돌려주는 것은 버그가 아니라 설계에 포함된 사실입니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export type DemoCapacityDto = {
  /** 데모를 지금 시작할 수 있는가. `false`면 아래 둘 중 하나가 이유를 말해 줍니다. */
  canStartDemo: boolean;
  /** `consumed`면 이 브라우저의 익명 계정이 이미 데모를 썼습니다(24시간 1회). */
  demoStatus: "available" | "consumed";
  /** `demoStatus === 'consumed'`일 때만 값이 있습니다 — "받은 리포트 다시 보기"의 목적지입니다. */
  existingSessionId: string | null;
  /** 화면이 그려야 하는 동의 문구의 버전. 이 값을 그대로 #42에 실어 보냅니다. */
  consentVersion: string;
  /** 정원 소진으로 막혔을 때만 값이 있습니다. **소진으로 막힌 경우는 `null`** 입니다. */
  availableAtIso: string | null;
};

export function GET() {
  return handle(async () => {
    assertDemoEnabled();

    // 미인증일 수 있습니다 — `getUser()`가 `null`이면 "아직 익명 계정도 없는 첫 방문"입니다.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // RLS 우회가 필요한 이유: `ai_quota_ledger`는 **RLS를 켜고 정책이 0개**라 사용자 문맥
    // 클라이언트로는 한 행도 읽을 수 없습니다(04_data_layer.md 3.13절).
    const admin = createAdminClient();

    if (user) {
      const { data: profile, error } = await admin
        .from("profiles")
        .select("account_type, demo_consumed_at")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
      }

      if (profile?.account_type === "demo" && profile.demo_consumed_at !== null) {
        const { data: existing } = await admin
          .from("interview_sessions")
          .select("id")
          .eq("user_id", user.id)
          .eq("funding_source", "demo")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // **기다려도 풀리지 않는 벽**이므로 `availableAtIso`를 채우지 않습니다 —
        // 채우면 "내일 오세요"라는 거짓말이 화면에 뜹니다.
        const consumed: DemoCapacityDto = {
          canStartDemo: false,
          demoStatus: "consumed",
          existingSessionId: existing?.id ?? null,
          consentVersion: CURRENT_DEMO_CONSENT_VERSION,
          availableAtIso: null,
        };
        return single("demoCapacity", consumed);
      }
    }

    const peeked = await peekCapacity(user?.id ?? "anonymous", "demo", admin);

    const capacity: DemoCapacityDto = {
      canStartDemo: peeked.hasCapacity,
      demoStatus: "available",
      existingSessionId: null,
      consentVersion: CURRENT_DEMO_CONSENT_VERSION,
      availableAtIso: peeked.availableAtIso,
    };
    return single("demoCapacity", capacity);
  });
}
