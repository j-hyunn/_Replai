import type { SessionSummary } from "@/lib/api/types";

/**
 * 대시보드의 "이어서 할 일" 4묶음 (06_ui_plan.md 4.3절).
 *
 * 서버가 미리 나눠 주지 않으므로 **`status` 값으로만** 분류합니다.
 * `completed`와 `evaluating`은 **같은 묶음**입니다 (D18) — 사용자 경험이 동일한 대기 화면 하나입니다.
 */

export type ActiveGroupKey = "drafting" | "ready" | "running" | "evaluating";

export const ACTIVE_GROUP_LABEL: Record<ActiveGroupKey, string> = {
  drafting: "작성 중인 면접",
  ready: "시작을 기다리는 면접",
  running: "진행 중인 면접",
  evaluating: "리포트를 만들고 있는 면접",
};

/** 표시 순서 — 사용자가 이어서 할 가능성이 높은 순입니다. */
export const ACTIVE_GROUP_ORDER: readonly ActiveGroupKey[] = [
  "running",
  "ready",
  "drafting",
  "evaluating",
];

export function groupActiveSessions(
  sessions: SessionSummary[],
): Record<ActiveGroupKey, SessionSummary[]> {
  const groups: Record<ActiveGroupKey, SessionSummary[]> = {
    drafting: [],
    ready: [],
    running: [],
    evaluating: [],
  };

  for (const session of sessions) {
    switch (session.status) {
      case "created":
      case "configuring":
        groups.drafting.push(session);
        break;
      case "ready":
        groups.ready.push(session);
        break;
      case "in_progress":
      case "paused":
        groups.running.push(session);
        break;
      case "completed":
      case "evaluating":
        groups.evaluating.push(session);
        break;
      default:
        // `evaluated`·`failed`·`abandoned`·`canceled`는 "이어서 할 일"이 아닙니다.
        break;
    }
  }

  return groups;
}
