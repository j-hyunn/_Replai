/**
 * 값 → 한국어 표시 문구 매핑의 **유일한 사본**입니다 (06_ui_plan.md 5절 재사용 원칙 2).
 *
 * **값 자체를 번역해 서버로 되돌려 보내지 않습니다.** 여기서 하는 일은 표시뿐입니다.
 */

import type {
  ExtractionStatus,
  JobRole,
  Modality,
  Persona,
  ReasonCode,
  SessionStatus,
} from "@/lib/api/types";

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  created: "작성 중",
  configuring: "설정 중",
  ready: "시작 대기",
  in_progress: "진행 중",
  paused: "일시정지",
  completed: "평가 준비 중",
  evaluating: "평가 중",
  evaluated: "리포트 완료",
  failed: "실패",
  // `abandoned`는 7일이 지나 시스템이 정리한 것, `canceled`는 사용자가 스스로 그만둔 것입니다.
  abandoned: "중단됨",
  canceled: "그만둔 면접",
};

export const JOB_ROLE_LABEL: Record<JobRole, string> = {
  pm: "프로덕트 매니저",
  pd: "프로덕트 디자이너",
  security: "보안",
  ai: "AI",
  engineer: "엔지니어",
};

export const PERSONA_LABEL: Record<Persona, string> = {
  deep_pressure: "심층 압박형",
  technical_probe: "기술 검증형",
};

export const PERSONA_DESCRIPTION: Record<Persona, string> = {
  deep_pressure:
    "주질문을 적게 잡고 꼬리질문으로 깊이 파고듭니다. 답변의 근거를 끝까지 물어봅니다.",
  technical_probe:
    "설계·운영·성능처럼 넓은 표면을 확인합니다. 주질문을 늘리고 깊이는 얕게 유지합니다.",
};

export const MODALITY_LABEL: Record<Modality, string> = {
  voice: "음성으로 대화",
  text: "텍스트로 대화",
};

export const MODALITY_DESCRIPTION: Record<Modality, string> = {
  voice: "마이크로 말하고 면접관 음성을 듣습니다. 음성은 저장되지 않습니다.",
  text: "키보드로 답변합니다. 음성과 동등하게 평가됩니다.",
};

export const EXTRACTION_STATUS_LABEL: Record<ExtractionStatus, string> = {
  pending: "대기 중",
  running: "읽는 중",
  succeeded: "읽기 완료",
  failed: "읽기 실패",
  not_required: "직접 입력",
};

export const REASON_CODE_LABEL: Record<ReasonCode, string> = {
  transcription_error: "제 말과 다르게 적혔어요",
  misinterpreted: "제 의도를 잘못 읽었어요",
  score_too_low: "점수가 부당해요",
  other: "그 밖의 이유",
};

/**
 * `failureReason` → 한국어 (계약 12.1절).
 * DB CHECK가 없는 값이므로 **모르는 값도 안전하게 떨어져야 합니다.**
 */
export function failureReasonKo(reason: string | null): string {
  switch (reason) {
    case "document_extraction_failed":
      return "이력서·채용공고의 텍스트를 읽지 못해 면접을 준비하지 못했습니다.";
    case "evaluation_enqueue_failed":
      return "평가를 시작하지 못했습니다. 다시 시도할 수 있습니다.";
    case "evaluation_failed":
      return "평가를 끝내지 못했습니다. 다시 시도할 수 있습니다.";
    case "provider_permanent_error":
      return "면접을 계속 진행할 수 없는 오류가 발생해 세션이 종료되었습니다.";
    case "context_corrupted":
      return "면접 문맥이 손상되어 세션이 종료되었습니다.";
    default:
      return "알 수 없는 이유로 세션이 종료되었습니다.";
  }
}

/** [평가 재시도]를 노출하는 `failureReason`은 **2개뿐**입니다 (06_ui_plan.md 4.7절). */
export function isRetryableEvaluationFailure(reason: string | null): boolean {
  return reason === "evaluation_failed" || reason === "evaluation_enqueue_failed";
}

/** #33 취소를 부를 수 있는 출발 상태 **7개** (계약 4.2절). 그 밖에서는 버튼을 렌더하지 않습니다. */
const CANCELABLE: readonly SessionStatus[] = [
  "created",
  "configuring",
  "ready",
  "in_progress",
  "paused",
  "failed",
  "abandoned",
];

export function isCancelable(status: SessionStatus): boolean {
  return CANCELABLE.includes(status);
}

/**
 * ⚠️ `pauseReason` → 짧은 라벨 매핑을 여기 두지 않습니다.
 *
 * 5종 각각의 **문구와 버튼이 다르고**(D28), 짧은 라벨은 4.14.4절 금칙어("한도" 등)를
 * 끌어들이기 쉽습니다. 재개 패널(`ResumePanel`)이 5종을 직접 분기하며, `byok_*` 2종의
 * 문안은 `blocked-copy.ts`의 사본 하나를 씁니다.
 */
