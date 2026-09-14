import type { Axis, EvaluationAxis } from "@/lib/api/types";

/**
 * 루브릭 축 식별자 ↔ 표시명 (06_ui_plan.md 7.2절 — **QA 대조 기준선**).
 *
 * **이 파일 한 곳에만 둡니다.** 화면마다 다시 쓰면 같은 축이 화면마다 다르게 불립니다.
 * 값은 `01_rubric.md` · `02_ai_contracts.md` · `04_data_layer.md` CHECK · 계약 12절과
 * **문자 단위로 같습니다.** 번역·camelCase 변환 금지.
 */

export const AXIS_ORDER: readonly Axis[] = [
  "job_knowledge",
  "logical_consistency",
  "evidence_specificity",
  "structure",
  "communication",
];

export const AXIS_LABEL: Record<Axis, string> = {
  job_knowledge: "직무 지식",
  logical_consistency: "논리 일관성",
  evidence_specificity: "근거의 구체성",
  structure: "구조화",
  communication: "전달력",
};

/**
 * 카드 순서는 `AXIS_ORDER` 고정입니다 — `evaluation.axes`가 오는 순서에 의존하면
 * 세션마다 축 순서가 바뀌어 회차 비교가 불가능해집니다.
 */
export function sortAxes(axes: EvaluationAxis[]): EvaluationAxis[] {
  return [...axes].sort(
    (a, b) => AXIS_ORDER.indexOf(a.axis) - AXIS_ORDER.indexOf(b.axis),
  );
}
