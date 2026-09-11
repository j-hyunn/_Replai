import type { SessionStatus } from "@/lib/session/status";

/**
 * 상태 → 화면 라우팅은 **이 함수 한 곳에만** 둡니다 (06_ui_plan.md 1절).
 *
 * 각 페이지는 진입 시 자기 상태가 아니면 이 함수의 결과로 `router.replace()` 합니다.
 * 딥링크·뒤로가기·Realtime 전이 세 경로의 유일한 분기입니다.
 *
 * 주의:
 * - `completed`와 `evaluating`은 **둘 다** 리포트로 갑니다 (D18). 정상 경로에서 `#15`/`#9`
 *   직후의 상태는 `completed`가 아니라 `evaluating`이므로, 한쪽만 처리하면 깨집니다.
 * - `canceled`는 행이 남는 **종료 상태**이고 목록에서 기본으로 숨겨지므로 (D19),
 *   `?includeCanceled=true`를 붙이지 않으면 자기 자신이 보이지 않는 목록으로 떨어집니다.
 */
export function routeForStatus(
  status: SessionStatus,
  sessionId: string,
): string {
  switch (status) {
    case "created":
    case "configuring":
      return `/sessions/new?sessionId=${sessionId}`;
    case "ready":
      return `/sessions/${sessionId}/ready`;
    case "in_progress":
    case "paused":
      return `/sessions/${sessionId}/interview`;
    case "completed":
    case "evaluating":
    case "evaluated":
    case "failed":
      return `/sessions/${sessionId}/report`;
    case "abandoned":
      // 리포트가 없으므로 목록으로 보냅니다.
      return "/sessions";
    case "canceled":
      // 행은 남아 있습니다 (D19).
      return "/sessions?includeCanceled=true";
  }
}
