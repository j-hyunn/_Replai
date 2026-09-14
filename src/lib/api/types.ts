/**
 * 프론트엔드 타입 — **원본은 `_workspace/05_api_contract.md` 12절**입니다.
 *
 * 이 파일은 계약 12절을 그대로 옮긴 것이며, 계약과 다르면 **계약이 옳습니다.**
 * 값 유니온은 전부 **영어 문자열 그대로**입니다 — 번역하거나 camelCase로 바꾸면
 * DB CHECK와 API 계약이 동시에 깨집니다.
 *
 * 서버 쪽 DTO(`src/lib/api/serialize.ts`)를 import 하지 않는 이유: 그 모듈은
 * `database.types.ts`와 `server-only` 계열을 끌고 들어와 클라이언트 번들에 서버 코드가
 * 섞입니다. 두 파일이 같은 계약을 각자 선언하고, QA가 문자 단위로 대조합니다.
 */

// ── 값 유니온 ────────────────────────────────────────────────────────────────

export const SESSION_STATUSES = [
  "created",
  "configuring",
  "ready",
  "in_progress",
  "paused",
  "completed",
  "evaluating",
  "evaluated",
  "failed",
  "abandoned",
  "canceled",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** SSE `utterance_done.sessionStatus` 전용 부분집합. 의도적으로 2값입니다(QA G8). */
export type StreamSessionStatus = Extract<SessionStatus, "in_progress" | "completed">;

export const PAUSE_REASONS = [
  "user_requested",
  "rate_limited",
  "connection_lost",
  "byok_key_invalid",
  "byok_quota_exhausted",
] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

export type FundingSource = "trial_shared" | "byok";
export type KeyStatus = "none" | "connected" | "invalid";
export type TrialStatus = "available" | "consumed";
export type Modality = "voice" | "text";
export type Persona = "deep_pressure" | "technical_probe";
export type JobRole = "pm" | "pd" | "security" | "ai" | "engineer";

export const AXES = [
  "job_knowledge",
  "logical_consistency",
  "evidence_specificity",
  "structure",
  "communication",
] as const;
export type Axis = (typeof AXES)[number];

export type QuestionKind = "main" | "follow_up";
export type TurnRole = "interviewer" | "candidate";
export type InterviewerAction =
  | "follow_up"
  | "next_main"
  | "neutral_transition"
  | "comfort"
  | "wrap_up";
export type ReasonCode =
  | "transcription_error"
  | "misinterpreted"
  | "score_too_low"
  | "other";
export type ExtractionStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "not_required";
export type DocType = "resume" | "job_description";
export type SourceType = "file" | "text";
export type ClientEventName =
  | "score_card_viewed"
  | "report_viewed"
  | "modality_switched"
  | "voice_precheck"
  | "rate_limit_fallback";

/** #12 `POST .../modality`의 `reason` — 영어 문자열 그대로 보냅니다. */
export type ModalitySwitchReason =
  | "mic_permission_denied"
  | "mic_unavailable"
  | "stt_error"
  | "rate_limit_fallback"
  | "user_requested_after_delay"
  | "user_requested";

// ── 세션 ─────────────────────────────────────────────────────────────────────

export type PreparationState = {
  state: "idle" | "running" | "failed";
  errorCode: string | null;
  updatedAt: string | null;
};

export type Session = {
  id: string;
  status: SessionStatus;
  fundingSource: FundingSource;
  jobRole: JobRole | null;
  persona: Persona | null;
  modality: Modality;
  currentModality: Modality;
  resumeDocumentId: string | null;
  jdDocumentId: string | null;
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
  // 서버 파생 필드 (DB 컬럼 아님)
  preparation: PreparationState;
  answeredMainQuestionCount: number;
  turnCount: number;
};

export type SessionSummary = {
  id: string;
  status: SessionStatus;
  jobRole: JobRole | null;
  persona: Persona | null;
  modality: Modality;
  overallScore: number | null;
  scoredAxisCount: number | null;
  isReportUnread: boolean;
  createdAt: string;
  endedAt: string | null;
};

export type SessionConfigPatch = {
  jobRole?: JobRole;
  persona?: Persona;
  modality?: Modality;
  resumeDocumentId?: string | null;
  jdDocumentId?: string | null;
};

// ── 질문·턴 ──────────────────────────────────────────────────────────────────

export type Question = {
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
  probeHints: string[] | null;
  askedAt: string | null;
  createdAt: string;
};

export type Turn = {
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

// ── 평가 ─────────────────────────────────────────────────────────────────────

/**
 * jsonb 본문은 **AI 계약의 필드명을 유지합니다** (계약 2.1절 E3).
 * `related_axis`·`why_weak`·`model_answer`·`expected_effect`를 camelCase로 고쳐 쓰면
 * 런타임에 `undefined`입니다.
 */
export type CoachImprovement = {
  priority: 1 | 2 | 3;
  title: string;
  action: string;
  related_axis: Axis;
};

export type CoachPayload = {
  model_answers: {
    question_id: string;
    turn_id: string | null;
    why_weak: string;
    model_answer: string;
  }[];
  next_actions: { order: 1 | 2 | 3; action: string; expected_effect: string }[];
};

export type Citation = {
  id: string;
  turnId: string;
  quoteText: string;
  /** ⚠️ JS UTF-16 오프셋입니다 (계약 9.2절). 하이라이트는 `quoteText` 문자열로 합니다. */
  quoteStart: number;
  quoteEnd: number;
  comment: string | null;
  citationIndex: number;
};

export type EvaluationAxis = {
  /** `evaluation_scores.id` — 이의 제기의 `scoreId`입니다. */
  id: string;
  axis: Axis;
  score: number | null;
  isInsufficientEvidence: boolean;
  weight: number;
  rationale: string;
  /** `null` 가능 — 코치 실패 시 UI는 이 축의 개선 영역을 감춥니다. */
  improvement: string | null;
  citations: Citation[];
};

export type ReportFeedback = {
  id: string;
  sessionId: string;
  isHelpful: boolean;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScoreDispute = {
  id: string;
  scoreId: string;
  citationId: string | null;
  reasonCode: ReasonCode;
  comment: string | null;
  createdAt: string;
};

export type Evaluation = {
  id: string;
  sessionId: string;
  status: "running" | "succeeded" | "failed";
  overallScore: number | null;
  scoredAxisCount: number;
  rubricVersion: string;
  /** `null`이면 "코치 미완료" — **판정 기준은 이 필드 하나입니다.** */
  summary: string | null;
  improvements: CoachImprovement[] | null;
  coachPayload: CoachPayload | null;
  modelName: string | null;
  provider: string | null;
  aiContractVersion: string | null;
  attemptCount: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** 언제나 정확히 5개입니다. */
  axes: EvaluationAxis[];
  myFeedback: ReportFeedback | null;
  /** 비어 있어도 `[]`이며 `null`이 아닙니다 (계약 12.3절). */
  myDisputes: ScoreDispute[];
};

/** #16의 **즉시 응답**. `Evaluation`과 **다른 타입**이며 `axes`가 물리적으로 없습니다. */
export type EvaluationJobAccepted = {
  sessionId: string;
  status: "evaluating";
  evaluationId: string;
  attempt: number;
  pollAfterMs: number;
};

// ── 문서·계정 ────────────────────────────────────────────────────────────────

export type Document = {
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

export type DocumentDetail = Document & {
  linkedSessionCount: number;
  configuringSessionCount: number;
};

export type DocumentCreate =
  | {
      docType: DocType;
      sourceType: "file";
      title: string;
      documentId: string;
      storagePath: string;
      mimeType: string;
      byteSize: number;
    }
  | { docType: DocType; sourceType: "text"; title: string; extractedText: string };

export type Profile = {
  id: string;
  displayName: string | null;
  defaultJobRole: JobRole | null;
  email: string;
  createdAt: string;
};

export type AccountStats = {
  sessionCount: number;
  documentCount: number;
  storageBytes: number;
};

// ── 여력·재원·동의 ───────────────────────────────────────────────────────────

export type Capacity = {
  /** `keyStatus === 'connected'`면 여력과 무관하게 **항상 true**입니다. 다시 계산하지 마세요. */
  canStartSession: boolean;
  keyStatus: KeyStatus;
  trialStatus: TrialStatus;
  nextFundingSource: FundingSource | null;
  requiresTrialConsent: boolean;
  /** #41 요청에 **그대로 되돌려 보냅니다.** 하드코딩하면 409 `consent_version_stale`입니다. */
  consentVersion: string;
  /** `null`이면 기다려도 풀리지 않는 벽입니다 — "내일 오세요"를 렌더하지 마세요. */
  availableAtIso: string | null;
};

/** ★ 키 원문 필드는 없고 앞으로도 추가하지 않습니다 (계약 4.8.1절). */
export type ApiKeyStatus = {
  keyStatus: KeyStatus;
  /** 화면에 쓸 수 있는 유일한 키 값입니다. */
  keyLast4: string | null;
  provider: "google" | null;
  lastVerifiedAt: string | null;
  lastFailureCode: "auth_rejected" | "quota_exhausted" | "unknown" | null;
  lastFailureAt: string | null;
};

export type TrialConsent = {
  id: string;
  consentVersion: string;
  grantedAt: string;
  sessionId: string | null;
};

// ── SSE 페이로드 (계약 5.2절 — 전부 camelCase) ───────────────────────────────

export type AnswerCommit = {
  answerSeq: number;
  questionId: string;
  transcriptText: string;
  modality: Modality;
  sttConfidence?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
};

export type UtteranceChunk = { seq: number; text: string };

export type UtteranceDone = {
  turnId: string;
  questionId: string | null;
  parentQuestionId: string | null;
  depth: number;
  questionKind: QuestionKind | null;
  action: InterviewerAction;
  targetAxis: Axis | null;
  sessionStatus: StreamSessionStatus;
};

export type StreamErrorCode =
  | "llm_timeout"
  | "llm_rate_limited"
  | "llm_failed"
  | "byok_key_invalid"
  | "byok_quota_exhausted";

export type StreamError = {
  code: StreamErrorCode;
  retryable: boolean;
  messageKo: string;
};

export type SessionNotice = {
  kind: "distress_guard" | "pressure_capped" | "rate_limit_fallback";
  level: number | null;
  messageKo: string;
};
