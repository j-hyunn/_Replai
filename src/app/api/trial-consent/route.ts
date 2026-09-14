import { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle, readJson, requireUser } from "@/lib/api/route";
import { toTrialConsentDto } from "@/lib/api/serialize";
import {
  CURRENT_TRIAL_CONSENT_VERSION,
  trialConsentTextSha256,
} from "@/lib/consent/trial-consent";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #41 `POST /api/trial-consent` — 체험 데이터 처리 동의 기록 (D29).
 *
 * **상태 전이가 아닙니다.** `configuring → ready`의 **가드 충족**일 뿐이므로 `session_events`에
 * 남기지 않습니다 — 지표 1·2의 원천을 오염시키지 않기 위해서입니다.
 *
 * 같은 버전 재동의는 **멱등**입니다(`(user_id, consent_version)` unique). 기존 행이 그대로
 * 200으로 돌아옵니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const bodySchema = z.object({
  consentVersion: z.string().min(1).max(20),
  sessionId: z.uuid().nullish(),
});

export function POST(request: Request) {
  return handle(async () => {
    const { user } = await requireUser();
    const body = await readJson(request, bodySchema);

    // **옛 클라이언트 번들이 옛 문구를 띄워 놓고 동의를 기록하는 것**을 막습니다.
    // 프론트는 이 오류를 받으면 새로고침 후 다이얼로그를 다시 띄웁니다.
    if (body.consentVersion !== CURRENT_TRIAL_CONSENT_VERSION) {
      throw new ApiError("consent_version_stale", "동의 문구가 업데이트되었습니다.", {
        details: { currentVersion: CURRENT_TRIAL_CONSENT_VERSION },
      });
    }

    // RLS 우회가 필요한 이유: trial_consents에는 select 정책만 있고 쓰기 정책이 없습니다.
    // 클라이언트 INSERT를 허용하면 동의 화면을 거치지 않고 게이트를 우회할 수 있습니다.
    const admin = createAdminClient();

    const existing = await admin
      .from("trial_consents")
      .select("*")
      .eq("user_id", user.id)
      .eq("consent_version", CURRENT_TRIAL_CONSENT_VERSION)
      .maybeSingle();

    if (existing.data) {
      // 멱등 — 기존 행을 그대로 200으로 돌려줍니다. 해시를 다시 계산하지 않습니다.
      return single("consent", toTrialConsentDto(existing.data));
    }

    // **해시는 서버가 계산합니다.** 클라이언트가 보내게 하면 사용자가 본 적 없는 문구에 대한
    // 해시를 기록할 수 있습니다. 대상은 애플리케이션 상수의 문구 원문(공백 정규화 후)입니다.
    const consentTextSha256 = await trialConsentTextSha256();

    const { data, error } = await admin
      .from("trial_consents")
      .insert({
        user_id: user.id,
        consent_version: CURRENT_TRIAL_CONSENT_VERSION,
        consent_text_sha256: consentTextSha256,
        session_id: body.sessionId ?? null,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
    }

    // `account_events`에 남깁니다 — `session_events`가 아닙니다(지표 1·2 오염 방지).
    await admin.from("account_events").insert({
      user_id: user.id,
      event_name: "trial_consent_granted",
      detail: { consentVersion: CURRENT_TRIAL_CONSENT_VERSION },
    });

    return single("consent", toTrialConsentDto(data), { status: 201 });
  });
}
