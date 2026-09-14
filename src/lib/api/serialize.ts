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
import type { Database, Json } from "@/lib/supabase/database.types";

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
export type DocumentRow = Tables["documents"]["Row"];
export type EvaluationRow = Tables["evaluations"]["Row"];
export type EvaluationScoreRow = Tables["evaluation_scores"]["Row"];
export type EvaluationCitationRow = Tables["evaluation_citations"]["Row"];
export type ReportFeedbackRow = Tables["report_feedback"]["Row"];
export type ScoreDisputeRow = Tables["score_disputes"]["Row"];
export type ProfileRow = Tables["profiles"]["Row"];
export type UserApiKeyRow = Tables["user_api_keys"]["Row"];

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

// ── 세션 요약 (목록·대시보드) ────────────────────────────────────────────────

export type SessionSummaryDto = {
  id: string;
  status: SessionStatus;
  jobRole: JobRole | null;
  persona: Persona | null;
  modality: Modality;
  /** `evaluations.overall_score`. 평가가 없으면 `null`입니다. */
  overallScore: number | null;
  scoredAxisCount: number | null;
  /** `status='evaluated'` **그리고** 아직 리포트를 연 적이 없을 때만 참입니다. */
  isReportUnread: boolean;
  createdAt: string;
  endedAt: string | null;
};

/** 목록 라우트가 평가 1행을 따로 읽어 붙입니다 — 세션 행에는 점수가 없습니다. */
export type SummaryScore = { overallScore: number | null; scoredAxisCount: number | null };

export function toSessionSummaryDto(
  row: SessionRow,
  score: SummaryScore = { overallScore: null, scoredAxisCount: null },
): SessionSummaryDto {
  const status = narrow(row.status, SESSION_STATUSES, "status");
  return {
    id: row.id,
    status,
    jobRole: narrowNullable(row.job_role, JOB_ROLES, "job_role"),
    persona: narrowNullable(row.persona, PERSONAS, "persona"),
    modality: narrow(row.modality, MODALITIES, "modality"),
    overallScore: score.overallScore,
    scoredAxisCount: score.scoredAxisCount,
    isReportUnread: status === "evaluated" && row.report_first_viewed_at === null,
    createdAt: row.created_at,
    endedAt: row.ended_at,
  };
}

// ── 문서 ─────────────────────────────────────────────────────────────────────

export const DOC_TYPES = ["resume", "job_description"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const SOURCE_TYPES = ["file", "text"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const EXTRACTION_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "not_required",
] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export type DocumentDto = {
  id: string;
  docType: DocType;
  sourceType: SourceType;
  title: string;
  storagePath: string | null;
  mimeType: string | null;
  byteSize: number | null;
  extractedText: string | null;
  extractionStatus: ExtractionStatus;
  extractionError: string | null;
  isEditedByUser: boolean;
  createdAt: string;
  updatedAt: string;
};

/** #34 전용 — 삭제 확인 다이얼로그가 **누르기 전에** 영향 범위를 알기 위한 두 값입니다(D21). */
export type DocumentDetailDto = DocumentDto & {
  linkedSessionCount: number;
  configuringSessionCount: number;
};

export function toDocumentDto(row: DocumentRow): DocumentDto {
  return {
    id: row.id,
    docType: narrow(row.doc_type, DOC_TYPES, "doc_type"),
    sourceType: narrow(row.source_type, SOURCE_TYPES, "source_type"),
    title: row.title,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    extractedText: row.extracted_text,
    extractionStatus: narrow(row.extraction_status, EXTRACTION_STATUSES, "extraction_status"),
    extractionError: row.extraction_error,
    isEditedByUser: row.is_edited_by_user,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── 피드백·이의 제기 ─────────────────────────────────────────────────────────

export const REASON_CODES = [
  "transcription_error",
  "misinterpreted",
  "score_too_low",
  "other",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export type ReportFeedbackDto = {
  id: string;
  sessionId: string;
  isHelpful: boolean;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

/** `user_id`는 응답에 자리가 없습니다 — 호출한 본인의 것만 돌려주므로 쓸 데가 없습니다. */
export function toReportFeedbackDto(row: ReportFeedbackRow): ReportFeedbackDto {
  return {
    id: row.id,
    sessionId: row.session_id,
    isHelpful: row.is_helpful,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ScoreDisputeDto = {
  id: string;
  scoreId: string;
  citationId: string | null;
  reasonCode: ReasonCode;
  comment: string | null;
  createdAt: string;
};

export function toScoreDisputeDto(row: ScoreDisputeRow): ScoreDisputeDto {
  return {
    id: row.id,
    scoreId: row.score_id,
    citationId: row.citation_id,
    reasonCode: narrow(row.reason_code, REASON_CODES, "reason_code"),
    comment: row.comment,
    createdAt: row.created_at,
  };
}

// ── 평가 ─────────────────────────────────────────────────────────────────────

export const EVALUATION_STATUSES = ["running", "succeeded", "failed"] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export type CitationDto = {
  id: string;
  turnId: string;
  quoteText: string;
  /** ⚠️ JS UTF-16 오프셋입니다 (계약 9.2절). */
  quoteStart: number;
  quoteEnd: number;
  comment: string | null;
  citationIndex: number;
};

export type EvaluationAxisDto = {
  /** `evaluation_scores.id` — 이의 제기의 `scoreId`입니다. */
  id: string;
  axis: Axis;
  score: number | null;
  isInsufficientEvidence: boolean;
  weight: number;
  rationale: string;
  improvement: string | null;
  citations: CitationDto[];
};

/**
 * jsonb 본문의 키는 **AI 계약의 이름 그대로 둡니다** (계약 2.1절 E3).
 * `related_axis`·`why_weak`·`model_answer`·`expected_effect`를 camelCase로 고치면
 * 저장된 값과 응답이 서로 다른 이름을 갖게 되어 디버깅이 불가능해집니다.
 */
export type CoachImprovementDto = {
  priority: 1 | 2 | 3;
  title: string;
  action: string;
  related_axis: Axis;
};

export type CoachPayloadDto = {
  model_answers: {
    question_id: string;
    turn_id: string | null;
    why_weak: string;
    model_answer: string;
  }[];
  next_actions: { order: 1 | 2 | 3; action: string; expected_effect: string }[];
};

export type EvaluationDto = {
  id: string;
  sessionId: string;
  status: EvaluationStatus;
  overallScore: number | null;
  scoredAxisCount: number;
  rubricVersion: string;
  /** `null`이면 "코치 미완료" — **판정 기준은 이 필드 하나입니다.** */
  summary: string | null;
  improvements: CoachImprovementDto[] | null;
  coachPayload: CoachPayloadDto | null;
  modelName: string | null;
  provider: string | null;
  aiContractVersion: string | null;
  attemptCount: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** 언제나 정확히 5개입니다. */
  axes: EvaluationAxisDto[];
  myFeedback: ReportFeedbackDto | null;
  /** 비어 있어도 `[]`이며 **`null`이 아닙니다** (계약 12.3절). */
  myDisputes: ScoreDisputeDto[];
};

export function toCitationDto(row: EvaluationCitationRow): CitationDto {
  return {
    id: row.id,
    turnId: row.turn_id,
    quoteText: row.quote_text,
    quoteStart: row.quote_start,
    quoteEnd: row.quote_end,
    comment: row.comment,
    citationIndex: row.citation_index,
  };
}

export function toEvaluationAxisDto(
  row: EvaluationScoreRow,
  citations: EvaluationCitationRow[],
): EvaluationAxisDto {
  return {
    id: row.id,
    axis: narrow(row.axis, AXES, "axis"),
    score: row.score,
    isInsufficientEvidence: row.is_insufficient_evidence,
    weight: row.weight,
    rationale: row.rationale,
    improvement: row.improvement,
    citations: citations
      .slice()
      .sort((a, b) => a.citation_index - b.citation_index)
      .map(toCitationDto),
  };
}

/**
 * jsonb를 계약 타입으로 좁힙니다. **모양이 어긋나면 `null`입니다** — 강제 캐스트로 통과시키면
 * 화면이 `undefined.map()`에서 터지고, 원인은 저장 시점에 있는데 증상은 렌더 시점에 납니다.
 */
function toCoachImprovements(value: Json): CoachImprovementDto[] | null {
  if (!Array.isArray(value)) return null;

  const items: CoachImprovementDto[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
    const { priority, title, action, related_axis: relatedAxis } = entry;
    if (priority !== 1 && priority !== 2 && priority !== 3) return null;
    if (typeof title !== "string" || typeof action !== "string") return null;
    if (typeof relatedAxis !== "string") return null;
    const axis = AXES.find((candidate) => candidate === relatedAxis);
    if (axis === undefined) return null;
    items.push({ priority, title, action, related_axis: axis });
  }
  return items;
}

function toCoachPayload(value: Json): CoachPayloadDto | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const modelAnswers = value.model_answers;
  const nextActions = value.next_actions;
  if (!Array.isArray(modelAnswers) || !Array.isArray(nextActions)) return null;

  const answers: CoachPayloadDto["model_answers"] = [];
  for (const entry of modelAnswers) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
    const { question_id: questionId, turn_id: turnId, why_weak: whyWeak, model_answer: modelAnswer } = entry;
    if (typeof questionId !== "string") return null;
    if (turnId !== null && typeof turnId !== "string") return null;
    if (typeof whyWeak !== "string" || typeof modelAnswer !== "string") return null;
    answers.push({
      question_id: questionId,
      turn_id: turnId ?? null,
      why_weak: whyWeak,
      model_answer: modelAnswer,
    });
  }

  const actions: CoachPayloadDto["next_actions"] = [];
  for (const entry of nextActions) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
    const { order, action, expected_effect: expectedEffect } = entry;
    if (order !== 1 && order !== 2 && order !== 3) return null;
    if (typeof action !== "string" || typeof expectedEffect !== "string") return null;
    actions.push({ order, action, expected_effect: expectedEffect });
  }

  return { model_answers: answers, next_actions: actions };
}

export function toEvaluationDto(input: {
  evaluation: EvaluationRow;
  scores: EvaluationScoreRow[];
  citations: EvaluationCitationRow[];
  feedback: ReportFeedbackRow | null;
  disputes: ScoreDisputeRow[];
}): EvaluationDto {
  const { evaluation, scores, citations, feedback, disputes } = input;

  const byScoreId = new Map<string, EvaluationCitationRow[]>();
  for (const citation of citations) {
    const bucket = byScoreId.get(citation.score_id);
    if (bucket) bucket.push(citation);
    else byScoreId.set(citation.score_id, [citation]);
  }

  const axes = scores.map((score) =>
    toEvaluationAxisDto(score, byScoreId.get(score.id) ?? []),
  );

  return {
    id: evaluation.id,
    sessionId: evaluation.session_id,
    status: narrow(evaluation.status, EVALUATION_STATUSES, "status"),
    overallScore: evaluation.overall_score,
    // 총점에 반영된 축 수는 DB 컬럼이 아니라 **서버가 셉니다**(계약 9.1절 — 인용이 없는 축은
    // 가중치 합에서 제외되므로, 이 수가 총점의 분모를 설명합니다).
    scoredAxisCount: axes.filter((axis) => !axis.isInsufficientEvidence).length,
    rubricVersion: evaluation.rubric_version,
    summary: evaluation.summary,
    improvements: evaluation.improvements === null ? null : toCoachImprovements(evaluation.improvements),
    coachPayload: evaluation.coach_payload === null ? null : toCoachPayload(evaluation.coach_payload),
    modelName: evaluation.model_name,
    provider: evaluation.provider,
    aiContractVersion: evaluation.ai_contract_version,
    attemptCount: evaluation.attempt_count,
    errorMessage: evaluation.error_message,
    startedAt: evaluation.started_at,
    finishedAt: evaluation.finished_at,
    axes,
    myFeedback: feedback === null ? null : toReportFeedbackDto(feedback),
    // **빈 배열입니다. `null`이 아닙니다** — `.map()` 앞에 방어 코드를 강요하지 않습니다.
    myDisputes: disputes.map(toScoreDisputeDto),
  };
}

// ── 계정 ─────────────────────────────────────────────────────────────────────

export type ProfileDto = {
  id: string;
  displayName: string | null;
  defaultJobRole: JobRole | null;
  /** `profiles`에 없는 값입니다 — `auth.users`에서 옵니다(라우트가 넘겨줍니다). */
  email: string;
  createdAt: string;
};

export type AccountStatsDto = {
  sessionCount: number;
  documentCount: number;
  storageBytes: number;
};

export function toProfileDto(row: ProfileRow, email: string): ProfileDto {
  return {
    id: row.id,
    displayName: row.display_name,
    defaultJobRole: narrowNullable(row.default_job_role, JOB_ROLES, "default_job_role"),
    email,
    createdAt: row.created_at,
  };
}

// ── 사용자 키 (BYOK) ─────────────────────────────────────────────────────────

export const KEY_STATUSES = ["none", "connected", "invalid"] as const;
export type KeyStatus = (typeof KEY_STATUSES)[number];

export const KEY_FAILURE_CODES = ["auth_rejected", "quota_exhausted", "unknown"] as const;
export type KeyFailureCode = (typeof KEY_FAILURE_CODES)[number];

/**
 * ★ **키 원문 필드는 이 타입에 없고, 앞으로도 추가하지 않습니다** (계약 4.8.1절 강제 1).
 * 키 원문이 존재하는 방향은 #38 요청 body 하나뿐입니다.
 */
export type ApiKeyStatusDto = {
  keyStatus: KeyStatus;
  /** 정확히 4자. 화면에 쓸 수 있는 유일한 키 값입니다. */
  keyLast4: string | null;
  provider: "google" | null;
  lastVerifiedAt: string | null;
  lastFailureCode: KeyFailureCode | null;
  lastFailureAt: string | null;
};

/** 행이 없는 상태가 곧 `'none'`입니다 — 별도의 상태 값을 DB에 두지 않았습니다. */
export const DISCONNECTED_API_KEY: ApiKeyStatusDto = {
  keyStatus: "none",
  keyLast4: null,
  provider: null,
  lastVerifiedAt: null,
  lastFailureCode: null,
  lastFailureAt: null,
};

export function toApiKeyStatusDto(row: UserApiKeyRow | null): ApiKeyStatusDto {
  if (!row) return DISCONNECTED_API_KEY;

  return {
    keyStatus: narrow(row.status, KEY_STATUSES, "status"),
    keyLast4: row.key_last4,
    // D11 이후 프로바이더는 Google 하나입니다. 값이 다른 행은 계약 밖이므로 좁히기에서 터집니다.
    provider: narrow(row.provider, ["google"] as const, "provider"),
    lastVerifiedAt: row.last_verified_at,
    lastFailureCode: narrowNullable(row.last_failure_code, KEY_FAILURE_CODES, "last_failure_code"),
    lastFailureAt: row.last_failure_at,
  };
}

// ── 여력 (D27·D28·D29) ───────────────────────────────────────────────────────

export const TRIAL_STATUSES = ["available", "consumed"] as const;
export type TrialStatus = (typeof TRIAL_STATUSES)[number];

/**
 * #36 `GET /api/capacity`의 응답 (계약 4.7.5절).
 *
 * ★ **금지: `limitCalls` · `heldCalls` · `available` · 버킷별 잔여량.**
 * 어느 것도 이 타입에 없고 앞으로도 없습니다 — 타입에 자리를 두지 않는 것이
 * "수치를 담지 않는다"를 주석이 아니라 구조로 거는 방법입니다.
 */
export type CapacityDto = {
  /** `keyStatus === 'connected'`면 여력과 무관하게 **항상 `true`**입니다. */
  canStartSession: boolean;
  keyStatus: KeyStatus;
  trialStatus: TrialStatus;
  /** 지금 세션을 만들면 어느 재원이 되는가. 못 만들면 `null`입니다. */
  nextFundingSource: FundingSource | null;
  requiresTrialConsent: boolean;
  /** 현재 문구 버전. #41 요청에 **그대로 되돌려 보냅니다.** */
  consentVersion: string;
  /** 여력 소진으로 막혔을 때만 값이 있습니다. **체험 소진이면 `null`** 입니다. */
  availableAtIso: string | null;
};
