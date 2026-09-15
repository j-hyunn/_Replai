/** 화면 표시용 포맷터. 값을 계산하지 않고 **표시만** 바꿉니다. */

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * 총점은 **소수 1자리**로 표시합니다 (D1). 값은 `numeric(3,2)`이므로
 * **표시에서만 반올림하고 재계산하지 않습니다.**
 */
export function formatScore(score: number | null): string {
  return score === null ? "—" : score.toFixed(1);
}

/** D7 — 재개 시한은 `pausedAt + 7일`입니다. */
export const RESUME_WINDOW_DAYS = 7;

export function resumeDeadline(pausedAt: string | null): string | null {
  if (!pausedAt) return null;
  const at = new Date(pausedAt);
  if (Number.isNaN(at.getTime())) return null;
  at.setDate(at.getDate() + RESUME_WINDOW_DAYS);
  return formatDate(at.toISOString());
}

/**
 * `?next=` 값 검증 (06_ui_plan.md 1절).
 * `/`로 시작하고 `//`·`/\`로 시작하지 않는 **내부 경로만** 받습니다(오픈 리다이렉트 방지).
 */
export function safeNextPath(value: string | null, fallback = "/dashboard"): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

/** `/settings/api-key?next=`를 만듭니다. **경로 외의 어떤 값도 싣지 않습니다.** */
export function apiKeyHref(next: string): string {
  return `/settings/api-key?next=${encodeURIComponent(next)}`;
}
