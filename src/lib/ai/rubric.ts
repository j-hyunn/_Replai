import "server-only";

import { AXES, type Axis } from "@/lib/api/serialize";
import type { Persona } from "@/lib/session/persona";

/**
 * 루브릭 상수 — `_workspace/01_rubric.md` 1·2·3절을 **코드로 옮긴 단일 원본**입니다.
 *
 * 평가자·코치 프롬프트가 같은 문자열을 봐야 하므로(`02_prompts/evaluator.md` 6.2절
 * "두 패스가 같은 문자열을 씁니다") 렌더링 함수도 여기 둡니다.
 */

/** `02_ai_contracts.md` 머리말의 값. `evaluations.ai_contract_version`에 그대로 들어갑니다. */
export const AI_CONTRACT_VERSION = "1.0.0-draft";

type AxisMeta = {
  displayNameKo: string;
  whatToLookForKo: string;
  /** 키 '1'~'5' — `01_rubric.md` 2절의 축별 해석 문장. */
  scaleKo: Record<"1" | "2" | "3" | "4" | "5", string>;
};

export const AXIS_META: Record<Axis, AxisMeta> = {
  job_knowledge: {
    displayNameKo: "직무 지식",
    whatToLookForKo:
      "질문 도메인에 대한 정확성과 깊이. 용어를 바르게 쓰는지, 트레이드오프를 아는지",
    scaleKo: {
      "5": "개념을 정확히 쓰고 대안과의 트레이드오프까지 설명",
      "4": "정확하나 대안 비교가 없음",
      "3": "큰 틀은 맞으나 세부에 부정확함",
      "2": "핵심 개념을 잘못 씀",
      "1": "사실 오류가 답변의 전제",
    },
  },
  logical_consistency: {
    displayNameKo: "논리 일관성",
    whatToLookForKo: "주장과 근거가 이어지는지, 꼬리질문에도 앞말과 어긋나지 않는지",
    scaleKo: {
      "5": "주장→근거→결론이 끊기지 않고, 꼬리질문에도 앞의 진술과 모순 없음",
      "4": "한 곳에서 비약이 있으나 자체 보완됨",
      "3": "되물었을 때 근거가 바뀜",
      "2": "앞뒤 진술이 충돌",
      "1": "주장에 근거가 아예 없음",
    },
  },
  evidence_specificity: {
    displayNameKo: "근거의 구체성",
    whatToLookForKo:
      "수치·기간·규모·역할이 붙는지. \"성능이 좋아졌다\"인지 \"p95가 800ms→220ms\"인지",
    scaleKo: {
      "5": "수치·기간·규모·본인 역할이 모두 붙음",
      "4": "대부분 붙으나 하나가 빠짐",
      "3": "사례는 있으나 수치가 없음",
      "2": "일반론만 말함",
      "1": "사례 자체가 없음",
    },
  },
  structure: {
    displayNameKo: "구조화",
    whatToLookForKo: "결론 우선, STAR 등 듣는 사람이 따라올 수 있는 구성인지",
    scaleKo: {
      "5": "결론 먼저, 근거가 정돈됨",
      "4": "구성은 있으나 서론이 김",
      "3": "시간순 나열",
      "2": "화제가 흩어져 요지를 잡기 어려움",
      "1": "구성이 없음",
    },
  },
  communication: {
    displayNameKo: "전달력",
    whatToLookForKo: "명료성과 간결성. 질문에 답했는지, 군더더기가 없는지",
    scaleKo: {
      "5": "질문에 정확히 답하고 군더더기가 없음",
      "4": "다소 길지만 명료함",
      "3": "요지에 도달하나 반복이 있음",
      "2": "질문과 다른 것을 답함",
      "1": "의미 전달 실패",
    },
  },
};

/**
 * 페르소나별 가중치 (`01_rubric.md` 3절). **정규화 전 원값**이며 이 값이
 * `evaluation_scores.weight`에 그대로 저장됩니다(계약 5.4절).
 */
export const PERSONA_WEIGHTS: Record<Persona, Record<Axis, number>> = {
  deep_pressure: {
    job_knowledge: 0.2,
    logical_consistency: 0.3,
    evidence_specificity: 0.25,
    structure: 0.15,
    communication: 0.1,
  },
  technical_probe: {
    job_knowledge: 0.35,
    logical_consistency: 0.2,
    evidence_specificity: 0.2,
    structure: 0.15,
    communication: 0.1,
  },
};

/**
 * 페르소나가 비어 있는 세션은 정상 경로에 없습니다(설정 저장에서 채워집니다). 다만 여기서
 * 던지면 평가가 통째로 실패하므로, DB 기본 예산과 같은 기준인 `deep_pressure`를 씁니다.
 */
export function weightsFor(persona: string | null): Record<Axis, number> {
  return persona === "technical_probe"
    ? PERSONA_WEIGHTS.technical_probe
    : PERSONA_WEIGHTS.deep_pressure;
}

/** 두 패스와 코치가 공유하는 축 정의 블록 (`02_prompts/evaluator.md` 6.2절). */
export function renderRubricAxes(): string {
  return AXES.map((axis) => {
    const meta = AXIS_META[axis];
    const scale = (["5", "4", "3", "2", "1"] as const)
      .map((level) => `${level}: ${meta.scaleKo[level]}`)
      .join(" / ");
    return [
      `## ${axis} (${meta.displayNameKo})`,
      `무엇을 보는가: ${meta.whatToLookForKo}`,
      scale,
    ].join("\n");
  }).join("\n\n");
}

/** 패스 B 전용 표시 문자열. 점수 조정 금지 문구를 함께 붙입니다. */
export function renderWeightsDisplay(persona: string | null): string {
  const weights = weightsFor(persona);
  return [
    AXES.map((axis) => `${axis} ${weights[axis].toFixed(2)}`).join(" / "),
    "(이 값은 서버의 총점 계산에만 쓰입니다. 축 점수를 조정하지 마십시오.)",
  ].join("\n");
}

export type ScoredAxis = {
  axis: Axis;
  score: number | null;
  isInsufficientEvidence: boolean;
};

/**
 * 총점 — **서버 계산이며 AI 출력이 아닙니다** (계약 5.4절).
 *
 * 근거 부족 축은 분모에서 빠지고, 남은 축의 가중치를 정규화합니다. 전 축이 근거 부족이면
 * `null`이며 그것도 유효한 평가입니다(근거 부족 리포트).
 */
export function computeOverallScore(
  axes: readonly ScoredAxis[],
  persona: string | null,
): number | null {
  const weights = weightsFor(persona);
  const scored = axes.filter(
    (axis): axis is ScoredAxis & { score: number } =>
      !axis.isInsufficientEvidence && axis.score !== null,
  );
  if (scored.length === 0) return null;

  const totalWeight = scored.reduce((sum, axis) => sum + weights[axis.axis], 0);
  if (totalWeight <= 0) return null;

  const weighted = scored.reduce((sum, axis) => sum + weights[axis.axis] * axis.score, 0);
  // numeric(3,2) — 반올림은 **계산 직후 한 번만** 합니다(01_rubric.md 3절 D1).
  return Math.round((weighted / totalWeight) * 100) / 100;
}
