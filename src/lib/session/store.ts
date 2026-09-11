import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/api/errors";
import {
  IDLE_PREPARATION,
  type PreparationState,
  type SessionDerived,
  type SessionRow,
} from "@/lib/api/serialize";
import type { SessionStatus } from "@/lib/session/status";
import { assertTransition, type TransitionTrigger } from "@/lib/session/transitions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";

/**
 * 세션 상태 쓰기의 **유일한 통로**입니다.
 *
 * RLS 우회가 필요한 이유: `interview_sessions`·`session_events`·`questions`·`turns`에는
 * 클라이언트 쓰기 정책이 아예 없습니다(`04_data_layer.md` 5.1절 3항). 정책이 없으면
 * `authenticated`의 INSERT/UPDATE/DELETE는 전부 거부되므로 서버가 `service_role`로 씁니다.
 * **그래서 소유권 검사를 라우트가 먼저 합니다**(`loadOwnedSession`).
 */

export type Admin = SupabaseClient<Database>;

export type SessionPatch = Database["public"]["Tables"]["interview_sessions"]["Update"];

export type TransitionInput = {
  sessionId: string;
  /** 라우트가 읽은 **그 시점의** 상태. 조건부 UPDATE의 키가 되어 경합을 막습니다. */
  from: SessionStatus;
  to: SessionStatus;
  trigger: TransitionTrigger;
  eventName: string;
  detail?: Json;
  /** 상태 외에 함께 바꾸는 컬럼. `status`는 여기서 주지 마세요 — `to`가 정합니다. */
  patch?: Omit<SessionPatch, "status">;
  admin?: Admin;
};

/**
 * 전이를 수행하고 `session_events`에 남깁니다.
 *
 * 1. **전이 표 검사** — 표에 없으면 409 `invalid_transition`.
 * 2. **조건부 UPDATE** (`where id = … and status = from`) — 0행이면 그 사이에 누가 상태를
 *    바꾼 것이므로 역시 409입니다. 읽고-쓰는 사이의 경합을 여기서 흡수합니다.
 * 3. `session_events` INSERT — **모든 성공 전이가 남습니다.** 지표 1·2가 이 로그로 계산되므로
 *    한 지점이라도 빠지면 분모가 사라집니다.
 */
export async function applyTransition(input: TransitionInput): Promise<SessionRow> {
  assertTransition(input.from, input.to);

  const admin = input.admin ?? createAdminClient();
  const patch: SessionPatch = { ...input.patch, status: input.to };

  // 상태-사유 정합 CHECK(`sessions_pause_reason_only_when_paused` 등)를 라우트마다 챙기지
  // 않도록 여기서 한 번에 정리합니다. 호출 측이 명시했으면 그쪽이 이깁니다.
  if (input.to !== "paused" && patch.pause_reason === undefined) patch.pause_reason = null;
  if (input.to !== "failed" && patch.failure_reason === undefined) patch.failure_reason = null;

  const { data, error } = await admin
    .from("interview_sessions")
    .update(patch)
    .eq("id", input.sessionId)
    .eq("status", input.from)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
  }
  if (!data) {
    // 같은 요청 두 번, 또는 다른 탭이 먼저 옮긴 경우입니다.
    throw new ApiError("invalid_transition", "지금 상태에서는 할 수 없는 동작입니다.", {
      details: { from: input.from, to: input.to },
    });
  }

  await insertEvent(admin, {
    session_id: input.sessionId,
    from_status: input.from,
    to_status: input.to,
    trigger: input.trigger,
    event_name: input.eventName,
    detail: input.detail ?? null,
  });

  return data;
}

/**
 * 전이 표 1행((없음) → `created`)의 기록.
 *
 * 이 한 행만 `from_status`가 `null`입니다 — 세션 행이 아직 없었으므로 "그 시점의 상태"라는
 * 것이 존재하지 않습니다. CHECK가 `from_status`의 `null`을 허용하는 이유가 이것입니다.
 */
export async function recordSessionCreated(
  sessionId: string,
  detail: Json,
  admin: Admin = createAdminClient(),
): Promise<void> {
  await insertEvent(admin, {
    session_id: sessionId,
    from_status: null,
    to_status: "created",
    trigger: "user_action",
    event_name: "session_created",
    detail,
  });
}

/**
 * 상태를 바꾸지 않는 관측 이벤트 (`05_api_contract.md` 4.5절).
 *
 * **`from_status = to_status = 그 시점 세션의 `status`** 입니다. `to_status`는 not null이므로
 * 비워 두면 첫 INSERT가 제약 위반으로 실패하고, 그 실패가 예약 성공 트랜잭션까지 되돌립니다.
 */
export async function recordObservationEvent(
  sessionId: string,
  status: SessionStatus,
  eventName: string,
  trigger: TransitionTrigger,
  detail: Json = null,
  admin: Admin = createAdminClient(),
): Promise<void> {
  await insertEvent(admin, {
    session_id: sessionId,
    from_status: status,
    to_status: status,
    trigger,
    event_name: eventName,
    detail,
  });
}

type EventInsert = Database["public"]["Tables"]["session_events"]["Insert"];

async function insertEvent(admin: Admin, row: EventInsert): Promise<void> {
  const { error } = await admin.from("session_events").insert(row);
  if (error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
  }
}

// ── 파생 필드 ────────────────────────────────────────────────────────────────

/**
 * `Session`의 서버 파생 3필드를 셉니다 (계약 12절).
 *
 * `answeredMainQuestionCount`는 **후보가 실제로 답한 주질문 수**입니다 — 질문이 몇 개
 * 만들어졌는지가 아닙니다. 종료 가드(답변한 주질문 ≥ 1)와 평가 가능 최소선이 이 수를 봅니다.
 */
export async function loadSessionDerived(
  sessionId: string,
  status: SessionStatus,
  admin: Admin = createAdminClient(),
): Promise<SessionDerived> {
  const [questions, turns, preparation] = await Promise.all([
    admin.from("questions").select("id, question_kind").eq("session_id", sessionId),
    admin.from("turns").select("question_id, role").eq("session_id", sessionId),
    loadPreparationState(sessionId, status, admin),
  ]);

  if (questions.error || turns.error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", {
      cause: questions.error ?? turns.error,
    });
  }

  const mainQuestionIds = new Set(
    questions.data.filter((q) => q.question_kind === "main").map((q) => q.id),
  );
  const answeredMain = new Set(
    turns.data
      .filter((t) => t.role === "candidate" && t.question_id !== null)
      .map((t) => t.question_id)
      .filter((id): id is string => id !== null && mainQuestionIds.has(id)),
  );

  return {
    preparation,
    answeredMainQuestionCount: answeredMain.size,
    turnCount: turns.data.length,
  };
}

const PLANNER_EVENTS = ["planner_started", "planner_succeeded", "planner_failed"] as const;

/**
 * 플래너 진행 상태를 `session_events`의 **최신 플래너 이벤트**에서 파생합니다 (계약 12.2절).
 * 새 상태 값도 새 컬럼도 만들지 않습니다.
 */
async function loadPreparationState(
  sessionId: string,
  status: SessionStatus,
  admin: Admin,
): Promise<PreparationState> {
  // `configuring`이 아니면 준비 중일 수 없습니다. 이미 `ready`면 planner_succeeded이므로 idle입니다.
  if (status !== "configuring") return IDLE_PREPARATION;

  const { data, error } = await admin
    .from("session_events")
    .select("event_name, detail, occurred_at")
    .eq("session_id", sessionId)
    .in("event_name", PLANNER_EVENTS)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
  }
  if (!data) return IDLE_PREPARATION;

  if (data.event_name === "planner_started") {
    return { state: "running", errorCode: null, updatedAt: data.occurred_at };
  }
  if (data.event_name === "planner_failed") {
    return {
      state: "failed",
      errorCode: readErrorCode(data.detail),
      updatedAt: data.occurred_at,
    };
  }
  return IDLE_PREPARATION;
}

function readErrorCode(detail: Json): string | null {
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return null;
  const code = detail.code;
  return typeof code === "string" ? code : null;
}
