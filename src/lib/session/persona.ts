/**
 * 페르소나별 예산과 종료 조건 (`01_state_machine.md` 3절).
 *
 * **DB 기본값(4/4/20/30)은 `deep_pressure` 기준입니다.** `technical_probe`를 고른 세션은
 * 설정 저장(#5) 시점에 이 표의 값으로 덮어써야 합니다 — 덮어쓰지 않으면 기술 검증형 세션이
 * 주질문 4개에서 끝나 페르소나 차이가 사라집니다.
 */

export const PERSONAS = ["deep_pressure", "technical_probe"] as const;
export type Persona = (typeof PERSONAS)[number];

export const JOB_ROLES = ["pm", "pd", "security", "ai", "engineer"] as const;
export type JobRole = (typeof JOB_ROLES)[number];

export const MODALITIES = ["voice", "text"] as const;
export type Modality = (typeof MODALITIES)[number];

export type PersonaBudget = {
  mainQuestionBudget: number;
  maxFollowUpDepth: number;
  maxTurns: number;
  maxDurationMin: number;
};

export const PERSONA_BUDGET: Record<Persona, PersonaBudget> = {
  // 제품 가치가 깊이(브리프 2절 "세 번째 꼬리질문")이므로 주질문을 줄이고 깊이를 늘립니다.
  deep_pressure: {
    mainQuestionBudget: 4,
    maxFollowUpDepth: 4,
    maxTurns: 20,
    maxDurationMin: 30,
  },
  // 설계·CS·성능이라는 넓은 표면을 검증해야 하므로 주질문을 늘리고 깊이를 줄입니다.
  technical_probe: {
    mainQuestionBudget: 6,
    maxFollowUpDepth: 2,
    maxTurns: 18,
    maxDurationMin: 30,
  },
};

/**
 * 평가 가능 최소선 — 답변한 주질문 2개.
 * 1개뿐이면 `completed`로 가되 "근거 부족" 리포트를 만들고, 0개면 `abandoned`입니다.
 */
export const MIN_ANSWERED_MAIN_FOR_EVALUATION = 2;

/** `→ completed` 전이의 가드: 답변한 주질문이 **1개 이상**이어야 합니다(3절). */
export const MIN_ANSWERED_MAIN_FOR_COMPLETE = 1;

export type TerminationInput = {
  answeredMainCount: number;
  candidateTurnCount: number;
  startedAt: string | null;
  lastMainQuestionSettled: boolean;
  budget: PersonaBudget;
  now?: Date;
};

/**
 * 종료 판정(공통) — 넷 중 **하나라도** 먼저 충족되면 `in_progress → completed`입니다.
 * 4번(사용자가 "면접 종료")은 #15의 경로라 여기 없습니다.
 */
export function shouldComplete(input: TerminationInput): boolean {
  const { budget } = input;

  // 1. 답변한 주질문 수 = 예산이고 마지막 주질문의 꼬리질문이 끝남
  if (input.answeredMainCount >= budget.mainQuestionBudget && input.lastMainQuestionSettled) {
    return true;
  }

  // 2. 후보 발화 수 = 상한 (무한 루프·비용 폭주 방어. 정상 세션에서는 걸리지 않습니다)
  if (input.candidateTurnCount >= budget.maxTurns) return true;

  // 3. started_at 이후 경과 시간 = 시간 상한
  if (input.startedAt) {
    const elapsedMin = ((input.now ?? new Date()).getTime() - Date.parse(input.startedAt)) / 60_000;
    if (elapsedMin >= budget.maxDurationMin) return true;
  }

  return false;
}
