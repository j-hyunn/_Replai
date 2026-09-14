import { ApiError } from "@/lib/api/errors";
import type { SessionStatus } from "@/lib/session/status";

/**
 * 상태 전이 표 — **`01_state_machine.md` 2절의 유일한 코드 사본입니다**
 * (`05_api_contract.md` 13절 말미: "전이 표는 `src/lib/session/transitions.ts`에 표 그대로
 * 옮기고, 코드가 표의 유일한 사본이 되게 합니다").
 *
 * 아래 배열은 전이 표를 **위에서 아래로 순서까지 그대로** 옮긴 것입니다. 행을 재배열하거나
 * 합치지 마세요 — 문서와 코드를 눈으로 대조할 수 있다는 것이 이 파일의 존재 이유입니다.
 * `05_api_contract.md` 4.6절의 전수 대응 번호(1~35)를 `row` 필드로 달아 두었습니다.
 *
 * **표에 없는 조합은 금지**이며 라우트는 409 `invalid_transition`을 반환합니다.
 */

/** 전이를 일으킨 주체. `session_events.trigger`의 CHECK 값과 같은 5종입니다. */
export type TransitionTrigger =
  | "user_action"
  | "ai_completion"
  | "timeout"
  | "system_error"
  | "scheduler";

export type TransitionRow = {
  /** 4.6절 전수 대응 표의 행 번호. */
  row: number;
  /** `null`은 "세션 생성"(행이 아직 없음)입니다. */
  from: SessionStatus | null;
  to: SessionStatus;
  /** 전이 표의 "트리거" 열을 한국어 그대로 옮긴 것 — 사람이 대조하기 위한 값입니다. */
  label: string;
  /** 이 전이를 담당하는 엔드포인트(4.6절 "담당" 열). */
  handler: string;
  /**
   * MVP에서 실제로 허용되는가. `false`인 행은 전이 표가 스스로 `[later]`로 표시한 것이며
   * `canTransition()`이 거부합니다 — 표에 적혀 있다는 사실과 지금 허용된다는 것은 다릅니다.
   */
  mvp: boolean;
};

export const SESSION_TRANSITIONS: readonly TransitionRow[] = [
  { row: 1, from: null, to: "created", label: '사용자가 "새 면접 시작" 클릭', handler: "#3", mvp: true },
  { row: 2, from: "created", to: "configuring", label: "설정 화면에서 첫 입력 저장", handler: "#5", mvp: true },
  { row: 3, from: "created", to: "canceled", label: "사용자가 설정을 떠나며 폐기", handler: "#33", mvp: true },
  { row: 4, from: "configuring", to: "configuring", label: "설정 항목 변경", handler: "#5", mvp: true },
  { row: 5, from: "configuring", to: "ready", label: '사용자가 "면접 준비" 클릭 → 컨텍스트 준비 완료', handler: "#6 → I1", mvp: true },
  { row: 6, from: "configuring", to: "failed", label: "이력서 텍스트 추출 실패 후 사용자가 재시도 포기", handler: "#35", mvp: true },
  { row: 7, from: "configuring", to: "canceled", label: "사용자가 폐기", handler: "#33", mvp: true },
  { row: 8, from: "ready", to: "in_progress", label: '사용자가 "면접 시작" 클릭', handler: "#8", mvp: true },
  { row: 9, from: "ready", to: "configuring", label: '사용자가 "설정 변경" 클릭', handler: "#7", mvp: true },
  { row: 10, from: "ready", to: "canceled", label: "사용자가 폐기", handler: "#33", mvp: true },
  { row: 11, from: "in_progress", to: "in_progress", label: "답변 제출 → 다음 질문 생성", handler: "#9", mvp: true },
  { row: 12, from: "in_progress", to: "in_progress", label: "모달리티 전환(음성↔텍스트)", handler: "#12", mvp: true },
  { row: 13, from: "in_progress", to: "paused", label: '사용자가 "일시정지" 클릭', handler: "#13", mvp: true },
  { row: 14, from: "in_progress", to: "paused", label: "LLM 레이트 리밋 + 백오프 60초 초과", handler: "#9", mvp: true },
  { row: 15, from: "in_progress", to: "paused", label: "사용자 키가 유효하지 않음(byok_key_invalid)", handler: "#9", mvp: true },
  { row: 16, from: "in_progress", to: "paused", label: "사용자 키의 한도 소진(byok_quota_exhausted)", handler: "#9", mvp: true },
  { row: 17, from: "in_progress", to: "paused", label: "네트워크 단절·탭 종료(connection_lost)", handler: "C1 / #13", mvp: true },
  { row: 18, from: "in_progress", to: "completed", label: '종료 조건 충족 또는 사용자가 "면접 종료" 클릭', handler: "#9 / #15", mvp: true },
  { row: 19, from: "in_progress", to: "canceled", label: '사용자가 "이 세션 버리기" 클릭', handler: "#33", mvp: true },
  { row: 20, from: "in_progress", to: "failed", label: "복구 불가 오류(프로바이더 영구 오류·컨텍스트 손상)", handler: "#9", mvp: true },
  { row: 21, from: "paused", to: "in_progress", label: '사용자가 "이어서 하기" 클릭', handler: "#14", mvp: true },
  { row: 22, from: "paused", to: "completed", label: '사용자가 "여기서 끝내기" 클릭', handler: "#15", mvp: true },
  { row: 23, from: "paused", to: "abandoned", label: "7일 경과(스케줄러) · 답변한 주질문 = 0", handler: "C1", mvp: true },
  { row: 24, from: "paused", to: "completed", label: "7일 경과(스케줄러) · 답변한 주질문 ≥ 1", handler: "C1", mvp: true },
  { row: 25, from: "paused", to: "canceled", label: "사용자가 폐기", handler: "#33", mvp: true },
  { row: 26, from: "completed", to: "evaluating", label: "평가 워커가 작업을 집음", handler: "enqueueEvaluation", mvp: true },
  { row: 27, from: "completed", to: "failed", label: "평가 큐 등록 실패 + 재시도 3회 소진", handler: "enqueueEvaluation", mvp: true },
  { row: 28, from: "evaluating", to: "evaluated", label: "평가 결과 저장 완료(코치 단계 종료)", handler: "I2", mvp: true },
  { row: 29, from: "evaluating", to: "completed", label: "평가 실패 + 재시도 잔여(최대 3회)", handler: "I2", mvp: true },
  { row: 30, from: "evaluating", to: "failed", label: "평가 재시도 3회 소진 또는 10분 워치독", handler: "I2 / 워치독", mvp: true },
  // 전이 표 자신이 가드 칸에 "MVP 범위 밖 — [later]"라고 적어 둔 유일한 행입니다.
  // #16은 `evaluated` 세션에 409를 돌려주며, 그 보장이 이 `mvp: false`입니다.
  { row: 31, from: "evaluated", to: "evaluating", label: '사용자가 "평가 다시 실행" 클릭 — [later]', handler: "(미대응)", mvp: false },
  { row: 32, from: "failed", to: "evaluating", label: '사용자가 리포트 화면에서 "평가 재시도" 클릭', handler: "#16", mvp: true },
  { row: 33, from: "failed", to: "canceled", label: "사용자가 폐기", handler: "#33", mvp: true },
  { row: 34, from: "abandoned", to: "canceled", label: "사용자가 폐기", handler: "#33", mvp: true },
  // 35행(모든 상태 → 행 삭제)은 상태 전이가 아니라 DELETE라 이 표에 담지 않습니다.
  // 담당은 #23·#31이며, **반납 호출을 두지 않습니다**(before delete 트리거가 이미 합니다).
] as const;

/** `→ canceled` 전이가 허용되는 출발 상태 7개 (`05_api_contract.md` 4.2절). */
export const CANCELABLE_FROM: readonly SessionStatus[] = SESSION_TRANSITIONS.filter(
  (t) => t.to === "canceled" && t.mvp,
).map((t) => t.from as SessionStatus);

/**
 * 이 조합이 전이 표에 있는가. `[later]` 행은 **없는 것으로 취급**합니다.
 *
 * 자기 전이(`configuring → configuring`·`in_progress → in_progress`)는 표에 실재하므로 참입니다 —
 * "상태가 안 바뀌면 전이가 아니다"라고 판단해 건너뛰면 4행·11행·12행이 전부 막힙니다.
 */
export function canTransition(from: SessionStatus | null, to: SessionStatus): boolean {
  return SESSION_TRANSITIONS.some((t) => t.mvp && t.from === from && t.to === to);
}

/** 그 조합을 담당하는 행들(트리거가 여럿이면 여러 행). 관측·디버깅용입니다. */
export function transitionRows(
  from: SessionStatus | null,
  to: SessionStatus,
): readonly TransitionRow[] {
  return SESSION_TRANSITIONS.filter((t) => t.from === from && t.to === to);
}

/**
 * 전이 표에 없으면 **409 `invalid_transition`** 으로 거부합니다
 * (`05_api_contract.md` 13절 — `details: { from, to }`).
 *
 * **모든 상태 변경은 이 함수를 통과해야 합니다.** 라우트가 `status`를 직접 UPDATE하면
 * 전이 표가 코드의 유일한 사본이라는 성질이 그 자리에서 깨집니다.
 */
export function assertTransition(from: SessionStatus | null, to: SessionStatus): void {
  if (canTransition(from, to)) return;

  throw new ApiError("invalid_transition", "지금 상태에서는 할 수 없는 동작입니다.", {
    details: { from, to },
  });
}
