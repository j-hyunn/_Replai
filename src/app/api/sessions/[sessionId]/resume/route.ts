import { ApiError } from "@/lib/api/errors";
import { compound } from "@/lib/api/respond";
import { handle, loadOwnedSession } from "@/lib/api/route";
import {
  sessionStatusOf,
  toQuestionDto,
  toSessionDto,
  toTurnDto,
  type QuestionDto,
  type SessionDto,
  type TurnDto,
} from "@/lib/api/serialize";
import { serverEnv } from "@/lib/env.server";
import { fundingSourceOf } from "@/lib/session/lifecycle";
import { applyTransition, loadSessionDerived } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #14 `POST /api/sessions/[sessionId]/resume` — 전이 표 21행(`paused → in_progress`).
 *
 * 사유별 재개 가드가 전부 여기 있습니다:
 * - `rate_limited` → `resumable_after` 경과 여부
 * - `byok_key_invalid` → **유효한 키가 다시 연결돼 있어야 합니다**(재개 시점 재검증 1회)
 * - `byok_quota_exhausted` → **재검증 없이 시도를 허용합니다.** 사용자 계정이 회복됐는지는
 *   호출해 봐야 알 수 있고, 아직이면 같은 사유로 다시 `paused`가 됩니다
 * - 공통 → 마지막 갱신 후 7일 이내
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export type ResumeSessionResponse = {
  session: SessionDto;
  currentQuestion: QuestionDto | null;
  lastInterviewerTurn: TurnDto | null;
};

export function POST(
  _request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/resume">,
) {
  return handle(async () => {
    const { sessionId } = await context.params;
    const { user, session } = await loadOwnedSession(sessionId);

    const from = sessionStatusOf(session);
    const admin = createAdminClient();

    assertWithinResumeWindow(session.updated_at);

    if (session.pause_reason === "rate_limited" && session.resumable_after) {
      if (Date.parse(session.resumable_after) > Date.now()) {
        throw new ApiError("rate_limited", "아직 이어서 진행할 수 없습니다.", {
          details: {
            retryAfterSec: Math.ceil((Date.parse(session.resumable_after) - Date.now()) / 1000),
          },
          retryAfterSec: Math.ceil((Date.parse(session.resumable_after) - Date.now()) / 1000),
        });
      }
    }

    if (session.pause_reason === "byok_key_invalid") {
      // RLS 우회가 필요한 이유: user_api_keys는 RLS를 켜고 정책이 0개입니다.
      const { data: key } = await admin
        .from("user_api_keys")
        .select("key_last4, status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!key || key.status !== "connected") {
        // **전이하지 않습니다.** 프론트는 이 오류로 `/settings/api-key`로 안내합니다.
        throw new ApiError("byok_key_invalid", "연결하신 키로 접속할 수 없었어요.", {
          details: { keyLast4: key?.key_last4 ?? null },
        });
      }
    }

    // `byok_quota_exhausted`에는 가드가 없습니다 — 의도된 동작입니다(4.5절 규칙 2).
    void fundingSourceOf(session);

    const updated = await applyTransition({
      sessionId: session.id,
      from,
      to: "in_progress",
      trigger: "user_action",
      eventName: "session_resumed",
      patch: { pause_reason: null, paused_at: null, resumable_after: null },
      admin,
    });

    const [currentQuestion, lastInterviewerTurn, derived] = await Promise.all([
      loadCurrentQuestion(admin, session.id),
      loadLastInterviewerTurn(admin, session.id),
      loadSessionDerived(session.id, "in_progress", admin),
    ]);

    const response: ResumeSessionResponse = {
      session: toSessionDto(updated, derived),
      currentQuestion,
      lastInterviewerTurn,
    };
    return compound(response);
  });
}

/** D7 — 재개 시한은 7일입니다. 넘으면 크론이 `completed`/`abandoned`로 보냅니다. */
function assertWithinResumeWindow(updatedAt: string): void {
  const days = serverEnv().PAUSED_AUTO_CLOSE_DAYS;
  const deadline = Date.parse(updatedAt) + days * 24 * 60 * 60 * 1000;
  if (Date.now() > deadline) {
    throw new ApiError("guard_failed", "재개 가능한 기간이 지났습니다.", {
      details: { guard: "resume_window_expired" },
    });
  }
}

type Admin = ReturnType<typeof createAdminClient>;

/** 직전 질문 = 마지막으로 발화된(`asked_at`이 있는) 질문. 재개 시 이것을 다시 읽어 줍니다. */
async function loadCurrentQuestion(admin: Admin, sessionId: string): Promise<QuestionDto | null> {
  const { data } = await admin
    .from("questions")
    .select("*")
    .eq("session_id", sessionId)
    .not("asked_at", "is", null)
    .order("asked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? toQuestionDto(data) : null;
}

async function loadLastInterviewerTurn(admin: Admin, sessionId: string): Promise<TurnDto | null> {
  const { data } = await admin
    .from("turns")
    .select("*")
    .eq("session_id", sessionId)
    .eq("role", "interviewer")
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? toTurnDto(data) : null;
}
