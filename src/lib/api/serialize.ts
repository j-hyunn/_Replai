import { ApiError } from "@/lib/api/errors";
import type { JobRole, Modality, Persona } from "@/lib/session/persona";
import { JOB_ROLES, MODALITIES, PERSONAS } from "@/lib/session/persona";
import {
  FUNDING_SOURCES,
  PAUSE_REASONS,
  SESSION_STATUSES,
  type FundingSource,
  type PauseReason,
  type SessionStatus,
} from "@/lib/session/status";
import type { Database } from "@/lib/supabase/database.types";

/**
 * snake_case(DB) → camelCase(응답) 변환 — **여기서 단 한 번** 합니다
 * (`05_api_contract.md` 2절 · CLAUDE.md 고정 제약).
 *
 * **범용 자동 변환기(deep camelize)를 쓰지 않습니다.** 자동 변환은 `jsonb` 안의 사용자 데이터와
 * 값 문자열까지 건드려 조용히 계약을 깹니다. 리소스별 **명시적 매퍼**만 둡니다.
 *
 * **값은 변환 대상이 아닙니다** — `status`·`persona`·`jobRole`·`pauseReason`·`failureReason`은
 * 영어 문자열 그대로 나갑니다.
 */

type Tables = Database["public"]["Tables"];
export type SessionRow = Tables["interview_sessions"]["Row"];
export type QuestionRow = Tables["questions"]["Row"];
export type TurnRow = Tables["turns"]["Row"];
export type TrialConsentRow = Tables["trial_consents"]["Row"];

/**
 * DB의 `text` 컬럼을 계약의 유니온으로 좁힙니다.
 *
 * **강제 캐스트를 쓰지 않는 이유:** CHECK 제약이 값을 보장하더라도, 마이그레이션이 값을 늘리고
 * 코드가 따라오지 않는 순간 캐스트는 거짓말을 시작합니다. 여기서 터지면 그 자리에서 보입니다.
 */
function narrow<T extends string>(
  value: string,
  allowed: readonly T[],
  column: string,
): T {
  const found = allowed.find((candidate) => candidate === value);
  if (found === undefined) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", {
      cause: `계약에 없는 ${column} 값입니다: ${value}`,
    });
  }
  return found;
}

function narrowNullable<T extends string>(
  value: string | null,
  allowed: readonly T[],
  column: string,
): T | null {
  return value === null ? null : narrow(value, allowed, column);
}

/**
 * 세션 행의 `status`를 계약의 11값으로 좁힙니다.
 * 상태를 다루는 코드는 **전부 이 함수를 통과**합니다 — `as SessionStatus` 캐스트를 쓰면
 * CHECK가 늘어난 순간 코드가 조용히 거짓말을 시작합니다.
 */
export function sessionStatusOf(row: Pick<SessionRow, "status">): SessionStatus {
  return narrow(row.status, SESSION_STATUSES, "status");
}

// ── 세션 ─────────────────────────────────────────────────────────────────────

/**
 * `configuring`과 `ready` 사이에 중간 상태가 없으므로(전이 표), 플래너가 도는 8~20초를
 * `session_events`의 최신 플래너 이벤트에서 **파생**합니다 (12.2절). 새 컬럼이 없습니다.
 */
export type PreparationState = {
  state: "idle" | "running" | "failed";
  errorCode: string | null;
  updatedAt: string | null;
};

export const IDLE_PREPARATION: PreparationState = {
  state: "idle",
  errorCode: null,
  updatedAt: null,
};

/** DB 컬럼이 아니라 라우트가 세어 붙이는 값입니다. */
export type SessionDerived = {
  preparation: PreparationState;
  answeredMainQuestionCount: number;
  turnCount: number;
};

export type SessionDto = {
  id: string;
  status: SessionStatus;
  fundingSource: FundingSource;
  jobRole: JobRole | null;
  persona: Persona | null;
  modality: Modality;
  currentModality: Modality;
  resumeDocumentId: string | null;
  jdDocumentId: string | null;
  /** 스냅샷 본문은 응답에 담지 않습니다 — 수십 KB × 2이고 화면에 쓰이지 않습니다. */
  hasResumeSnapshot: boolean;
  hasJdSnapshot: boolean;
  mainQuestionBudget: number;
  maxFollowUpDepth: number;
  maxTurns: number;
  maxDurationMin: number;
  pauseReason: PauseReason | null;
  resumableAfter: string | null;
  failureReason: string | null;
  startedAt: string | null;
  endedAt: string | null;
  pausedAt: string | null;
  reportFirstViewedAt: string | null;
  sourceSessionId: string | null;
  createdAt: string;
  updatedAt: string;
} & SessionDerived;

export function toSessionDto(row: SessionRow, derived: SessionDerived): SessionDto {
  return {
    id: row.id,
    status: narrow(row.status, SESSION_STATUSES, "status"),
    fundingSource: narrow(row.funding_source, FUNDING_SOURCES, "funding_source"),
    jobRole: narrowNullable(row.job_role, JOB_ROLES, "job_role"),
    persona: narrowNullable(row.persona, PERSONAS, "persona"),
    modality: narrow(row.modality, MODALITIES, "modality"),
    currentModality: narrow(row.current_modality, MODALITIES, "current_modality"),
    resumeDocumentId: row.resume_document_id,
    jdDocumentId: row.jd_document_id,
    hasResumeSnapshot: row.resume_text_snapshot !== null,
    hasJdSnapshot: row.jd_text_snapshot !== null,
    mainQuestionBudget: row.main_question_budget,
    maxFollowUpDepth: row.max_follow_up_depth,
    maxTurns: row.max_turns,
    maxDurationMin: row.max_duration_min,
    pauseReason: narrowNullable(row.pause_reason, PAUSE_REASONS, "pause_reason"),
    resumableAfter: row.resumable_after,
    // failure_reason에는 DB CHECK가 없습니다(04 6.4절) — 좁히지 않고 그대로 내보냅니다.
    failureReason: row.failure_reason,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    pausedAt: row.paused_at,
    reportFirstViewedAt: row.report_first_viewed_at,
    sourceSessionId: row.source_session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...derived,
  };
}

// ── 질문 ─────────────────────────────────────────────────────────────────────

export const QUESTION_KINDS = ["main", "follow_up"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const AXES = [
  "job_knowledge",
  "logical_consistency",
  "evidence_specificity",
  "structure",
  "communication",
] as const;
export type Axis = (typeof AXES)[number];

export type QuestionDto = {
  id: string;
  parentQuestionId: string | null;
  depth: number;
  orderIndex: number;
  questionKind: QuestionKind;
  questionText: string;
  targetAxis: Axis | null;
  sourceSpan: string | null;
  archetypeId: string | null;
  seedVersion: string | null;
  /** jsonb 문자열 배열입니다. 오브젝트 배열이 아닙니다. */
  probeHints: string[] | null;
  askedAt: string | null;
  createdAt: string;
};

function toProbeHints(value: QuestionRow["probe_hints"]): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((hint): hint is string => typeof hint === "string");
}

export function toQuestionDto(row: QuestionRow): QuestionDto {
  return {
    id: row.id,
    parentQuestionId: row.parent_question_id,
    depth: row.depth,
    orderIndex: row.order_index,
    questionKind: narrow(row.question_kind, QUESTION_KINDS, "question_kind"),
    questionText: row.question_text,
    targetAxis: narrowNullable(row.target_axis, AXES, "target_axis"),
    sourceSpan: row.source_span,
    archetypeId: row.archetype_id,
    seedVersion: row.seed_version,
    probeHints: toProbeHints(row.probe_hints),
    askedAt: row.asked_at,
    createdAt: row.created_at,
  };
}

// ── 턴 ───────────────────────────────────────────────────────────────────────

export const TURN_ROLES = ["interviewer", "candidate"] as const;
export type TurnRole = (typeof TURN_ROLES)[number];

export type TurnDto = {
  id: string;
  questionId: string | null;
  seq: number;
  role: TurnRole;
  /** 정본입니다. 대화 로그의 진실의 원천은 텍스트 전사입니다. */
  transcriptText: string;
  transcriptRaw: string | null;
  isCorrected: boolean;
  modality: Modality;
  sttConfidence: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

export function toTurnDto(row: TurnRow): TurnDto {
  return {
    id: row.id,
    questionId: row.question_id,
    seq: row.seq,
    role: narrow(row.role, TURN_ROLES, "role"),
    transcriptText: row.transcript_text,
    transcriptRaw: row.transcript_raw,
    isCorrected: row.is_corrected,
    modality: narrow(row.modality, MODALITIES, "modality"),
    sttConfidence: row.stt_confidence,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  };
}

// ── 동의 ─────────────────────────────────────────────────────────────────────

export type TrialConsentDto = {
  id: string;
  consentVersion: string;
  grantedAt: string;
  sessionId: string | null;
};

/** `consent_text_sha256`과 `user_id`는 응답에 자리가 없습니다 — 화면이 쓸 데가 없습니다. */
export function toTrialConsentDto(row: TrialConsentRow): TrialConsentDto {
  return {
    id: row.id,
    consentVersion: row.consent_version,
    grantedAt: row.granted_at,
    sessionId: row.session_id,
  };
}
