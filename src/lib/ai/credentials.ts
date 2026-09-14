import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ROLE_BUCKET, type AgentRole, type ModelBucket } from "@/lib/ai/roles";
import { ApiError } from "@/lib/api/errors";
import { serverEnv } from "@/lib/env.server";
import type { FundingSource } from "@/lib/session/status";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * **복호화 지점은 이 파일 하나입니다** (02_ai_architecture.md 4.4.2절 · 05_deploy.md 1.3절 CI 검사 3).
 *
 * `get_user_api_key()`를 부르는 코드는 이 파일의 `resolveCallCredentials()` 한 곳뿐이어야 하고,
 * CI가 `grep -rn "get_user_api_key\|decrypted_secret" src/`의 결과가 이 파일뿐인지 검사합니다.
 * 라우트도 UI도 이 함수를 부르지 않습니다 — 프로바이더 계층만 부릅니다.
 *
 * ## 공용 키 폴백은 존재하지 않습니다
 *
 * 사용자 키가 죽어도 `GOOGLE_AI_API_KEY`로 넘어가는 코드 경로가 **없습니다.** 폴백하면
 * D29 동의를 받지 않은 이력서와 답변이 공용 경로로 나가고 사용자는 그 사실을 모릅니다.
 * 반대 방향(체험 세션이 사용자 키를 쓰는 것)도 금지입니다 — 사용자가 그 세션에 자기 토큰을
 * 쓰겠다고 말한 적이 없습니다.
 */

type Admin = SupabaseClient<Database>;

/**
 * 호출 1건의 재원·귀속 정보 (02_ai_architecture.md 4.4.1절).
 *
 * **통째로 직렬화하지 마세요.** `apiKey`는 열거 불가(non-enumerable)로 정의되어 있어
 * `JSON.stringify(ctx)`·구조 분해 복사·`console.log` 어디에도 따라가지 않지만,
 * 그것은 실수를 막는 마지막 장치이지 면허가 아닙니다. 로그에 남길 값은 `redactCtx(ctx)`가
 * 뽑아 주는 화이트리스트뿐입니다.
 */
export interface LlmCallContext {
  sessionId: string;
  role: AgentRole;
  bucket: ModelBucket;
  fundingSource: FundingSource;
  /** `byok`이면 서버에서 복호화된 평문, `trial_shared`면 공용 키. **로깅 금지.** */
  readonly apiKey: string;
  /** 끝 4자리. 로그·이벤트에 남길 수 있는 **유일한** 키 관련 값입니다. */
  keyFingerprint: string;
}

/** 로그·스팬 속성·예외 페이로드에 넣을 수 있는 전부입니다 (화이트리스트). */
export type RedactedCallContext = Pick<
  LlmCallContext,
  "sessionId" | "role" | "bucket" | "fundingSource" | "keyFingerprint"
>;

export function redactCtx(ctx: LlmCallContext): RedactedCallContext {
  return {
    sessionId: ctx.sessionId,
    role: ctx.role,
    bucket: ctx.bucket,
    fundingSource: ctx.fundingSource,
    keyFingerprint: ctx.keyFingerprint,
  };
}

/** 마스킹 표시값. 키가 4자 미만인 경우는 형식 검증에서 이미 걸러집니다. */
export function fingerprint(key: string): string {
  return key.slice(-4);
}

/**
 * `apiKey`를 **열거 불가 속성**으로 심어 `ctx`를 만듭니다.
 *
 * 이것이 요구사항("응답 직렬화 계층에 원문 키가 절대 섞이지 않게 한다")을 주석이 아니라
 * 구조로 거는 방법입니다. `JSON.stringify`·`{...ctx}`·`Object.entries`·sonner 토스트가
 * 직렬화하는 뮤테이션 `variables`·에러 리포터의 페이로드 — 전부 열거 가능한 속성만 봅니다.
 * `configurable: false`라 나중에 누가 열거 가능으로 되돌릴 수도 없습니다.
 */
function createCallContext(
  base: Omit<LlmCallContext, "apiKey" | "keyFingerprint">,
  apiKey: string,
): LlmCallContext {
  const ctx = { ...base, keyFingerprint: fingerprint(apiKey) } as LlmCallContext;
  Object.defineProperty(ctx, "apiKey", {
    value: apiKey,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return ctx;
}

/**
 * 세션의 `funding_source`로 키를 고릅니다. **세션당(호출 루프당) 1회만 부릅니다** —
 * 재시도 루프 안에서 부르면 그곳이 폴백 구멍이 됩니다(`provider.ts` 참고).
 */
export async function resolveCallCredentials(
  sessionId: string,
  role: AgentRole,
  admin: Admin = createAdminClient(),
): Promise<LlmCallContext> {
  // RLS 우회가 필요한 이유: user_api_keys는 RLS를 켜고 정책이 0개이고,
  // get_user_api_key()는 service_role에만 실행 권한이 있습니다(04_data_layer.md 3.15절).
  const { data: session, error } = await admin
    .from("interview_sessions")
    .select("id, user_id, funding_source")
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    throw new ApiError("not_found", "면접 세션을 찾을 수 없습니다.", { cause: error });
  }

  const fundingSource = session.funding_source as FundingSource;
  const base = { sessionId, role, bucket: ROLE_BUCKET[role], fundingSource };

  if (fundingSource === "byok") {
    const { data: key, error: keyError } = await admin.rpc("get_user_api_key", {
      p_user_id: session.user_id,
    });

    // 원시 오류를 그대로 올리지 않습니다 — 메시지에 인자가 섞여 들어오는 경로가 있습니다.
    if (keyError) {
      throw new ApiError("byok_key_invalid", "연결하신 키로 접속할 수 없었어요.", {
        cause: keyError.message,
      });
    }
    // 키가 없거나 status='invalid'면 함수가 아무 행도 돌려주지 않습니다.
    // **여기서 공용 키로 대체하지 않습니다.** 그것이 정확히 금지된 동작입니다.
    if (!key) {
      throw new ApiError("byok_key_invalid", "연결하신 키로 접속할 수 없었어요.");
    }

    return createCallContext(base, key);
  }

  const sharedKey = sharedProviderKey();
  if (!sharedKey) {
    throw new ApiError("provider_unavailable", "지금은 면접을 진행할 수 없습니다.");
  }

  return createCallContext(base, sharedKey);
}

/** 공용 키는 배포 단위 상수입니다 — 사용자 키(Vault)와 그릇 자체가 다릅니다(05_deploy.md 1.4절). */
function sharedProviderKey(): string | undefined {
  const env = serverEnv();
  return env.AI_PROVIDER === "anthropic" ? env.ANTHROPIC_API_KEY : env.GOOGLE_AI_API_KEY;
}
