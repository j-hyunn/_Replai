import { ApiError } from "@/lib/api/errors";
import { compound } from "@/lib/api/respond";
import { handle, requireUser } from "@/lib/api/route";
import type { SessionSummaryDto } from "@/lib/api/serialize";
import type { SessionStatus } from "@/lib/session/status";
import { toSessionSummaries } from "@/lib/session/summary";

/**
 * #1 `GET /api/dashboard` — 대시보드 한 번의 왕복 (계약 4절 1행).
 *
 * 응답은 **복합 봉투**입니다: `{ activeSessions, unreadReportCount, recentSessions }`.
 * 세 값이 한 화면을 함께 만들기 때문에 왕복을 셋으로 쪼개지 않습니다.
 *
 * **`canceled`는 토글 없이 언제나 제외합니다**(계약 4.3절 마지막 항). 대시보드는 "지금 할 일"을
 * 보여주는 화면이라 취소된 세션이 낄 자리가 없습니다.
 *
 * **묶음 분류(작성 중/시작 대기/진행 중/평가 중)를 서버가 하지 않습니다.** 프론트의
 * `src/lib/session/group-active.ts`가 `status` 값만으로 나누며, 서버가 미리 나눠 주면
 * 같은 분류가 두 곳에 생겨 갈라집니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * "이어서 할 일" — `06_ui_plan.md` 4.3절의 4묶음이 담는 상태 전부입니다.
 * `evaluated`·`failed`·`abandoned`·`canceled`는 이어서 할 일이 아니므로 여기 없습니다.
 */
const ACTIVE_STATUSES: readonly SessionStatus[] = [
  "created",
  "configuring",
  "ready",
  "in_progress",
  "paused",
  "completed",
  "evaluating",
];

/** 최근 목록은 한 화면에 들어갈 만큼만. 더 보려면 `/sessions`(#2)로 갑니다. */
const RECENT_LIMIT = 10;

export function GET() {
  return handle(async () => {
    const { user, supabase } = await requireUser();

    // 읽기 전용이라 **`server.ts`(anon + 쿠키)** 를 씁니다 — RLS가 남의 세션을 가려 줍니다.
    const [active, recent, unread] = await Promise.all([
      supabase
        .from("interview_sessions")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ACTIVE_STATUSES)
        .order("updated_at", { ascending: false }),
      supabase
        .from("interview_sessions")
        .select("*")
        .eq("user_id", user.id)
        .neq("status", "canceled")
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
      // `isReportUnread`와 **같은 정의**입니다: `evaluated` + 아직 리포트를 연 적이 없음.
      // 정의를 여기서 다시 쓰지 않도록 아래에서 배지 수와 요약 필드가 같은 조건을 봅니다.
      supabase
        .from("interview_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "evaluated")
        .is("report_first_viewed_at", null),
    ]);

    const failure = active.error ?? recent.error ?? unread.error;
    if (failure) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: failure });
    }

    const activeRows = active.data ?? [];
    const recentRows = recent.data ?? [];

    // 두 목록은 겹칩니다(`completed`·`evaluating`은 양쪽에 나옵니다). 점수 조회를 두 번 하지
    // 않도록 합쳐서 한 번에 조립한 뒤 다시 나눕니다.
    const merged = new Map([...activeRows, ...recentRows].map((row) => [row.id, row] as const));
    const summaries = await toSessionSummaries(supabase, [...merged.values()]);
    const byId = new Map<string, SessionSummaryDto>(
      summaries.map((summary) => [summary.id, summary] as const),
    );

    const pick = (rows: { id: string }[]): SessionSummaryDto[] =>
      rows
        .map((row) => byId.get(row.id))
        .filter((summary): summary is SessionSummaryDto => summary !== undefined);

    return compound({
      activeSessions: pick(activeRows),
      unreadReportCount: unread.count ?? 0,
      recentSessions: pick(recentRows),
    });
  });
}
