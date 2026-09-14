import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle, loadOwnedSession } from "@/lib/api/route";
import { sessionStatusOf, toSessionDto } from "@/lib/api/serialize";
import { failSession } from "@/lib/session/lifecycle";
import { loadSessionDerived } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #35 `POST /api/sessions/[sessionId]/abandon-preparation` — 전이 표 6행
 * (`configuring → failed`, `failureReason = 'document_extraction_failed'`).
 *
 * **이 라우트가 그 전이의 유일한 진입점입니다** (계약 4.4절, QA F8).
 *
 * #26(문서 추출)의 실패만으로는 전이하지 않습니다 — 문서는 세션에 종속되지 않아 여러 세션이
 * 같은 문서를 참조할 수 있고, 추출 실패는 **문서 상태**이지 세션의 종료가 아닙니다. 한 문서의
 * 실패가 그 문서를 참조하는 모든 세션을 `failed`로 만들면 **남의 세션까지 끌고 죽습니다.**
 * 전이의 주체는 언제나 사용자입니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export function POST(
  _request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/abandon-preparation">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { session, supabase } = await loadOwnedSession(sessionId);

    const from = sessionStatusOf(session);
    if (from !== "configuring") {
      throw new ApiError("invalid_transition", "지금 상태에서는 할 수 없는 동작입니다.", {
        details: { from, to: "failed" },
      });
    }

    // 가드: 참조 중인 문서 하나라도 `extraction_status = 'failed'`여야 합니다.
    // 추출이 멀쩡한데 세션만 `failed`로 만드는 경로를 열면 `failureReason` 값의 의미가
    // 무너집니다 — 그 경우 사용자가 원하는 것은 포기가 아니라 취소이며, 그것은 #33입니다.
    const documentIds = [session.resume_document_id, session.jd_document_id].filter(
      (id): id is string => id !== null,
    );

    const { data: documents } = documentIds.length
      ? await supabase
          .from("documents")
          .select("id, extraction_status")
          .in("id", documentIds)
      : { data: [] };

    const hasFailedExtraction = (documents ?? []).some(
      (doc) => doc.extraction_status === "failed",
    );

    if (!hasFailedExtraction) {
      throw new ApiError("guard_failed", "추출에 실패한 문서가 없습니다.", {
        details: { guard: "extraction_not_failed" },
      });
    }

    const admin = createAdminClient();
    // 반납 6지점 #5(전량)가 `failSession()` 안에 있습니다 — 예약이 잡혀 있었다면 되돌아옵니다.
    const updated = await failSession(
      session,
      "document_extraction_failed",
      "user_action",
      "preparation_abandoned",
      admin,
    );

    const derived = await loadSessionDerived(updated.id, "failed", admin);
    return single("session", toSessionDto(updated, derived));
  });
}
