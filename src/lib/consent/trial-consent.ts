/**
 * 체험 데이터 처리 동의 문구 — **원본은 이 파일 하나입니다** (D29, `05_deploy.md` 1.5절).
 *
 * 서버 라우트(#41)와 동의 다이얼로그가 **같은 상수를 import** 합니다. 사본을 만들면 화면과
 * `consent_text_sha256`이 갈라지고, "무엇에 동의했는가"를 코드에서 답할 수 없게 됩니다.
 *
 * **환경변수로 빼지 않습니다.** 환경만 바꿔 문구를 바꿀 수 있으면 같은 문제가 납니다.
 * **문구를 고치면 버전을 반드시 함께 올립니다** — 올리지 않으면 과거 동의 기록이 지금은
 * 존재하지 않는 문장을 가리키게 되고 아무도 그 사실을 알 수 없습니다.
 *
 * 이 파일은 `server-only`가 아닙니다 — 동의 다이얼로그(클라이언트 컴포넌트)가 문구를 그려야
 * 하기 때문입니다. 대신 **해시 계산은 서버에서만** 합니다(아래 `trialConsentTextSha256`).
 */

/** 문구를 고치면 이 값을 함께 올립니다. `trial_consents.consent_version`에 그대로 들어갑니다. */
export const CURRENT_TRIAL_CONSENT_VERSION = "1.0.0";

/**
 * 해시 대상이 되는 문구 원문 (`06_ui_plan.md` 4.13절 = `01_product_spec.md` 6.5.4절).
 *
 * `/settings/account`의 데이터 처리 안내에 붙는 보관·삭제 두 줄은 **이 상수에 넣지 않습니다** —
 * 그 두 줄은 동의 해시 대상이 아닙니다(`06_ui_plan.md` 4.13절).
 */
export const TRIAL_CONSENT_TEXT = `체험 면접을 시작하기 전에 확인해 주세요

체험 면접은 Google의 무료 AI 서비스로 진행됩니다. 입력하신 이력서와 답변을 Google이 서비스 개선에 사용할 수 있고, 검토자가 읽을 수 있습니다.
본인 API 키를 연결하면 이 과정을 거치지 않습니다.

위 내용을 확인했고 체험 면접 진행에 동의합니다`;

/**
 * 공백 정규화 — 해시 대상은 "공백 정규화 후의 문구 원문"입니다(계약 4.9.1절).
 * 줄바꿈·들여쓰기 편집이 해시를 바꾸지 않도록, 연속 공백류를 단일 공백으로 접고 양끝을 다듬습니다.
 */
export function normalizeConsentText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/**
 * 동의 문구의 SHA-256 hex. **서버가 계산합니다** — 클라이언트가 보내게 하면 사용자가 본 적 없는
 * 문구에 대한 해시를 기록할 수 있습니다(계약 4.9.1절).
 */
export async function trialConsentTextSha256(
  text: string = TRIAL_CONSENT_TEXT,
): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeConsentText(text));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
