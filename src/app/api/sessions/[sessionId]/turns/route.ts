import { z } from "zod";

import {
  buildInterviewerRequest,
  detectDistress,
  resolveMeta,
  type InterviewerGuards,
  type ResolvedMeta,
} from "@/lib/ai/interviewer";
import { isNormalizedProviderError } from "@/lib/ai/errors";
import { MetaStreamParser, type InterviewerAction } from "@/lib/ai/meta-stream";
import { runStream } from "@/lib/ai/provider";
import { ApiError } from "@/lib/api/errors";
import { fail } from "@/lib/api/respond";
import { loadOwnedSession } from "@/lib/api/route";
import {
  sessionStatusOf,
  type Axis,
  type QuestionKind,
  type QuestionRow,
  type SessionRow,
  type TurnRow,
} from "@/lib/api/serialize";
import { completeSession, fundingSourceOf } from "@/lib/session/lifecycle";
import { MODALITIES, PERSONA_BUDGET, shouldComplete, type Persona } from "@/lib/session/persona";
import type { SessionStatus } from "@/lib/session/status";
import { applyTransition, recordObservationEvent, type Admin } from "@/lib/session/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #9 `POST /api/sessions/[sessionId]/turns` — 면접관 스트리밍 (SSE).
 *
 * 계약: `05_api_contract.md` 5절 · `02_ai_contracts.md` 3.2~3.5절.
 *
 * - 응답은 `text/event-stream`이며 **`res.json()`을 호출하면 안 됩니다.**
 * - **HTTP 상태는 스트림이 시작되면 이미 200**이므로, 그 뒤의 오류는 `stream_error` 이벤트로만
 *   전달됩니다. 스트림 시작 **전**의 실패(소유권·가드·seq 충돌)만 JSON 오류 바디로 나갑니다.
 * - SSE 재개(resume)를 **지원하지 않습니다.** `Last-Event-ID`를 읽지 않고 `id:`도 보내지
 *   않습니다 — 다시 호출하면 무료 티어 쿼터를 두 번 쓰고, 확정분은 이미 `turns`에 있습니다.
 *   끊긴 클라이언트는 #10으로 재동기화합니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// "면접관 60초 예산"은 UX 예산이지 플랫폼 상한이 아닙니다. 그 예산을 60초로 유지한 채
// META 커밋·turn 저장 같은 **스트림 종료 후 꼬리 작업**과 abort 정리에 30초 여유를 둡니다.
// 상한에 잘리면 답변은 화면에 흘렀는데 DB에 없는 상태가 됩니다.
export const maxDuration = 90;

/** 요청 본문 상한. 초과하면 413입니다. */
const MAX_BODY_BYTES = 64 * 1024;
/** 15초마다 SSE 주석 하트비트를 보내 중간 프록시의 유휴 종료를 막습니다. */
const HEARTBEAT_MS = 15_000;

const answerCommitSchema = z.object({
  /** 이 후보 발화가 차지할 `turns.seq`. 클라이언트가 마지막으로 아는 seq + 1입니다. */
  answerSeq: z.number().int().positive(),
  questionId: z.uuid(),
  transcriptText: z.string().min(1).max(4000),
  modality: z.enum(MODALITIES),
  sttConfidence: z.number().min(0).max(1).nullish(),
  startedAt: z.iso.datetime().nullish(),
  endedAt: z.iso.datetime().nullish(),
});

type AnswerCommit = z.infer<typeof answerCommitSchema>;

// ── SSE 이벤트 페이로드 (전부 camelCase) ─────────────────────────────────────

type UtteranceChunk = { seq: number; text: string };

/**
 * `sessionStatus`의 타입은 `SessionStatus`(11값)가 아니라 **2값 부분집합**입니다 (QA G8).
 * 스트림은 `in_progress`에서만 시작하고, 끝난 뒤 관측 가능한 상태는 계속 아니면 종료 둘뿐입니다 —
 * `paused`·`failed`는 `stream_error`로 끝나 `utterance_done` 자체가 나가지 않고, `canceled`는
 * 스트림 밖 요청이며, `evaluating` 이후는 `completed` 전이의 서버 부작용입니다.
 * **폭을 맞추려고 넓히지 마세요. 좁힌 것이지 누락이 아닙니다.**
 */
type StreamSessionStatus = Extract<SessionStatus, "in_progress" | "completed">;

type UtteranceDone = {
  turnId: string;
  questionId: string | null;
  parentQuestionId: string | null;
  depth: number;
  questionKind: QuestionKind | null;
  action: InterviewerAction;
  targetAxis: Axis | null;
  sessionStatus: StreamSessionStatus;
};

type StreamErrorCode =
  | "llm_timeout"
  | "llm_rate_limited"
  | "llm_failed"
  | "byok_key_invalid"
  | "byok_quota_exhausted";

type StreamError = { code: StreamErrorCode; retryable: boolean; messageKo: string };

export async function POST(
  request: Request,
  context: RouteContext<"/api/sessions/[sessionId]/turns">,
) {
  // 스트림이 시작되기 **전**의 실패만 JSON 오류로 나갑니다.
  let prepared: Prepared;
  try {
    const { sessionId } = await context.params;
    prepared = await prepareTurn(request, sessionId);
  } catch (error) {
    return fail(error);
  }

  return streamInterviewer(prepared, request.signal);
}

// ── 스트림 시작 전 ───────────────────────────────────────────────────────────

type Prepared = {
  session: SessionRow;
  currentQuestion: QuestionRow;
  recentTurns: TurnRow[];
  answer: AnswerCommit;
  guards: InterviewerGuards;
  admin: Admin;
};

async function prepareTurn(request: Request, sessionId: string): Promise<Prepared> {
  // `03_voice_pipeline.md` P4 — 오디오 미저장의 **서버 쪽 장치**입니다.
  // 오디오를 받을 수 있는 문이 열려 있으면 언젠가 누군가 저장합니다.
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data") || contentType.startsWith("audio/")) {
    throw new ApiError("unsupported_media_type", "오디오는 서버로 보내지 않습니다.");
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    throw new ApiError("payload_too_large", "요청이 너무 큽니다.");
  }

  const parsed = answerCommitSchema.safeParse(JSON.parse(raw || "{}"));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join(".") || "_"] = issue.message;
    throw new ApiError("validation_failed", "요청 내용을 확인해 주세요.", { details: { fields } });
  }
  const answer = parsed.data;

  const { session } = await loadOwnedSession(sessionId);
  const from = sessionStatusOf(session);
  if (from !== "in_progress") {
    throw new ApiError("invalid_transition", "지금 상태에서는 할 수 없는 동작입니다.", {
      details: { from, to: "in_progress" },
    });
  }

  // RLS 우회가 필요한 이유: turns·questions·session_events에 클라이언트 쓰기 정책이 없습니다.
  const admin = createAdminClient();

  const { data: currentQuestion, error: questionError } = await admin
    .from("questions")
    .select("*")
    .eq("id", answer.questionId)
    .eq("session_id", session.id)
    .maybeSingle();

  if (questionError) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: questionError });
  }
  if (!currentQuestion) {
    throw new ApiError("not_found", "질문을 찾을 수 없습니다.");
  }

  // **멱등성은 `unique (session_id, seq)`가 담당합니다.** 중복이면 여기서 끝내고
  // **LLM을 다시 부르지 않습니다** — 중복 호출은 무료 티어 쿼터를 그대로 태웁니다.
  const { error: insertError } = await admin.from("turns").insert({
    session_id: session.id,
    question_id: currentQuestion.id,
    seq: answer.answerSeq,
    role: "candidate",
    transcript_text: answer.transcriptText,
    modality: answer.modality,
    stt_confidence: answer.sttConfidence ?? null,
    started_at: answer.startedAt ?? null,
    ended_at: answer.endedAt ?? null,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      const currentSeq = await loadMaxSeq(admin, session.id);
      throw new ApiError("turn_seq_conflict", "이미 제출된 답변입니다.", {
        details: { currentSeq },
      });
    }
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: insertError });
  }

  await consumeTrialIfFirstMainAnswer(admin, session, currentQuestion);

  const { data: recentTurns } = await admin
    .from("turns")
    .select("*")
    .eq("session_id", session.id)
    .order("seq", { ascending: false })
    .limit(12);

  return {
    session,
    currentQuestion,
    recentTurns: (recentTurns ?? []).slice().reverse(),
    answer,
    guards: buildGuards(session, currentQuestion, answer),
    admin,
  };
}

/**
 * 체험 소진 기록은 **동의 시점이 아닙니다.** 후보가 **첫 주질문에 답한 턴을 저장하는 것과 같은
 * 경로에서** `where trial_consumed_at is null`로 기록합니다 — 준비만 하고 그만둔 세션은
 * 체험을 소진하지 않습니다(계약 4.9.2절).
 */
async function consumeTrialIfFirstMainAnswer(
  admin: Admin,
  session: SessionRow,
  question: QuestionRow,
): Promise<void> {
  if (fundingSourceOf(session) !== "trial_shared") return;
  if (question.question_kind !== "main") return;

  await admin
    .from("profiles")
    .update({ trial_consumed_at: new Date().toISOString() })
    .eq("id", session.user_id)
    .is("trial_consumed_at", null);
}

function buildGuards(
  session: SessionRow,
  currentQuestion: QuestionRow,
  answer: AnswerCommit,
): InterviewerGuards {
  return {
    // G1 — 페르소나가 정한 최대 깊이에서 남은 만큼.
    remainingFollowUpDepth: Math.max(0, session.max_follow_up_depth - currentQuestion.depth),
    // G2·G3·G6의 카운터는 `session_events`의 누적 관측에서 옵니다.
    // 다음 라운드에서 `ai-interview-architect`가 집계 규칙과 함께 채웁니다 —
    // 0은 "가드를 끈다"가 아니라 "아직 누적된 신호가 없다"이며, 어느 쪽이든
    // G1·G4는 이미 동작하므로 압박이 무한히 이어지지 않습니다.
    probeRepeatCount: 0,
    avoidanceSignalCount: 0,
    consecutivePressureTurns: 0,
    forcedAction: null,
    // G4 — 서버 패턴 검사. 모델의 `distress_detected`와 OR로 합쳐집니다(이중 그물).
    distressSignalDetected: detectDistress(answer.transcriptText),
  };
}

async function loadMaxSeq(admin: Admin, sessionId: string): Promise<number> {
  const { data } = await admin
    .from("turns")
    .select("seq")
    .eq("session_id", sessionId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.seq ?? 0;
}

// ── 스트림 ───────────────────────────────────────────────────────────────────

function streamInterviewer(prepared: Prepared, signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  const upstream = new AbortController();

  // 클라이언트가 끊으면 **프로바이더 스트림에도 전파**합니다 — 쿼터를 계속 태우지 않기 위해서입니다.
  signal.addEventListener("abort", () => upstream.abort(), { once: true });

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown): void => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": ping\n\n"));
      }, HEARTBEAT_MS);

      const parser = new MetaStreamParser();
      let chunkSeq = 0;

      try {
        // ⚙️ **실제 AI 호출 지점입니다.** `runStream`이 자격증명 해석(세션당 1회)·소비 기록
        //    (호출을 보내기 **전에**)·프로바이더 스트리밍을 전부 담당합니다.
        const stream = runStream(prepared.session.id, "interviewer", (model) =>
          buildInterviewerRequest(
            {
              session: prepared.session,
              currentQuestion: prepared.currentQuestion,
              recentTurns: prepared.recentTurns,
              answerText: prepared.answer.transcriptText,
              guards: prepared.guards,
            },
            model,
            upstream.signal,
          ),
        );

        for await (const chunk of stream) {
          if (chunk.type !== "text") continue;
          for (const text of parser.push(chunk.text)) {
            const payload: UtteranceChunk = { seq: chunkSeq, text };
            chunkSeq += 1;
            send("utterance_chunk", payload);
          }
        }

        // M8 — flush가 **먼저**입니다. flush 없이 `utterance_done`을 보내지 않습니다.
        for (const text of parser.finish()) {
          const payload: UtteranceChunk = { seq: chunkSeq, text };
          chunkSeq += 1;
          send("utterance_chunk", payload);
        }

        const done = await commitInterviewerTurn(prepared, parser, false);
        send("utterance_done", done);
      } catch (error) {
        if (signal.aborted) {
          // 5.4절 — abort 종료 경로. **확정분을 버리지 않습니다**(M7·M8).
          // `await`을 걸어 두지 않으면 함수 종료와 함께 잘려 `turns` 행이 유실됩니다.
          await commitInterviewerTurn(prepared, parser, true).catch((commitError: unknown) => {
            console.error("[turns] abort 정리에 실패했습니다", commitError);
          });
        } else {
          send("stream_error", await handleStreamFailure(prepared, error));
        }
      } finally {
        clearInterval(heartbeat);
        closed = true;
        controller.close();
      }
    },

    cancel() {
      upstream.abort();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // 중간 프록시가 버퍼링하면 첫 토큰이 늦어져 스트리밍의 의미가 사라집니다.
      "x-accel-buffering": "no",
    },
  });
}

// ── 스트림 종료 후 꼬리 작업 ─────────────────────────────────────────────────

/**
 * 면접관 발화를 `turns`에 저장하고, 필요하면 `questions`를 만들고, 종료 조건을 판정합니다.
 *
 * **클라이언트가 abort했다고 세션 상태를 바꾸지 않습니다** — `in_progress` 그대로입니다.
 */
async function commitInterviewerTurn(
  prepared: Prepared,
  parser: MetaStreamParser,
  aborted: boolean,
): Promise<UtteranceDone> {
  const { admin, session, currentQuestion, answer } = prepared;
  const spoken = parser.spokenText();
  const { meta, missing } = parser.parseMeta();

  if (missing) {
    // M6 — 대화는 멈추지 않습니다. 경고만 남깁니다.
    await recordObservationEvent(
      session.id,
      "in_progress",
      aborted ? "interviewer_stream_aborted" : "interviewer_meta_missing",
      aborted ? "system_error" : "ai_completion",
      null,
      admin,
    );
  }

  const resolved = resolveMeta(meta, prepared.guards, currentQuestion);
  const interviewerSeq = answer.answerSeq + 1;

  // 새 질문이 필요한 action일 때만 `questions` 행을 만듭니다.
  // `neutral_transition`·`comfort`·`wrap_up`은 질문이 아니므로 행을 만들지 않습니다.
  const question =
    spoken.length > 0 && (resolved.action === "follow_up" || resolved.action === "next_main")
      ? await upsertNextQuestion(admin, session, resolved, spoken)
      : null;

  // `transcript_text`는 not null이고 1자 이상이므로 **0자면 INSERT하지 않습니다**(5.4절 c).
  const turnId =
    spoken.length > 0
      ? await insertInterviewerTurn(admin, session, question?.id ?? null, interviewerSeq, spoken)
      : "";

  const sessionStatus = await resolveSessionStatus(prepared, resolved, aborted);

  return {
    turnId,
    questionId: question?.id ?? null,
    parentQuestionId: resolved.parentQuestionId,
    depth: resolved.depth,
    questionKind: resolved.questionKind,
    action: resolved.action,
    targetAxis: resolved.targetAxis,
    sessionStatus,
  };
}

async function insertInterviewerTurn(
  admin: Admin,
  session: SessionRow,
  questionId: string | null,
  seq: number,
  text: string,
): Promise<string> {
  const { data, error } = await admin
    .from("turns")
    .insert({
      session_id: session.id,
      question_id: questionId,
      seq,
      role: "interviewer",
      transcript_text: text,
      modality: session.current_modality,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
  }
  return data.id;
}

/**
 * `next_main`이면 플래너가 미리 만들어 둔 다음 주질문을 집습니다. 남아 있지 않으면 이번 발화를
 * 새 주질문으로 기록합니다 — 질문 없이 진행되면 다음 턴의 `questionId`가 비어 트리가 끊깁니다.
 */
async function upsertNextQuestion(
  admin: Admin,
  session: SessionRow,
  resolved: ResolvedMeta,
  text: string,
): Promise<{ id: string }> {
  const askedAt = new Date().toISOString();

  if (resolved.action === "next_main") {
    const { data: planned } = await admin
      .from("questions")
      .select("id")
      .eq("session_id", session.id)
      .eq("question_kind", "main")
      .is("asked_at", null)
      .order("order_index", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (planned) {
      await admin.from("questions").update({ asked_at: askedAt }).eq("id", planned.id);
      return planned;
    }
  }

  const { data: last } = await admin
    .from("questions")
    .select("order_index")
    .eq("session_id", session.id)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await admin
    .from("questions")
    .insert({
      session_id: session.id,
      parent_question_id: resolved.parentQuestionId,
      depth: resolved.depth,
      order_index: (last?.order_index ?? 0) + 1,
      question_kind: resolved.questionKind ?? "follow_up",
      question_text: text,
      target_axis: resolved.targetAxis,
      asked_at: askedAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
  }
  return data;
}

/**
 * 종료 조건(3절) 판정. 충족되면 **`in_progress → completed` 전이의 부작용 전부**가 함께
 * 일어납니다 — 부분 반납(6을 남김)과 평가 등록입니다.
 */
async function resolveSessionStatus(
  prepared: Prepared,
  resolved: ResolvedMeta,
  aborted: boolean,
): Promise<StreamSessionStatus> {
  // abort는 상태를 바꾸지 않습니다(F18: "변화 없음").
  if (aborted) return "in_progress";

  const { admin, session } = prepared;
  const budget =
    PERSONA_BUDGET[isPersona(session.persona) ? session.persona : "deep_pressure"];

  const { data: turns } = await admin
    .from("turns")
    .select("question_id, role")
    .eq("session_id", session.id);

  const { data: questions } = await admin
    .from("questions")
    .select("id, question_kind")
    .eq("session_id", session.id);

  const mainIds = new Set(
    (questions ?? []).filter((q) => q.question_kind === "main").map((q) => q.id),
  );
  const candidateTurns = (turns ?? []).filter((t) => t.role === "candidate");
  const answeredMainCount = new Set(
    candidateTurns
      .map((t) => t.question_id)
      .filter((id): id is string => id !== null && mainIds.has(id)),
  ).size;

  const complete =
    resolved.action === "wrap_up" ||
    shouldComplete({
      answeredMainCount,
      candidateTurnCount: candidateTurns.length,
      startedAt: session.started_at,
      // 면접관이 마지막 주질문에서 꼬리질문을 더 파지 않고 옮겨 갔다면 그 주질문은 끝난 것입니다.
      lastMainQuestionSettled: resolved.action !== "follow_up",
      budget,
    });

  if (!complete) return "in_progress";

  await completeSession(session, "ai_completion", "session_completed", admin);
  // 세션의 실제 상태는 평가 등록까지 끝나 `evaluating`이지만, 이 스트림이 알려 주는 것은
  // **"종료 조건이 충족되었다"** 입니다. `StreamSessionStatus`가 2값인 이유가 이것입니다.
  return "completed";
}

function isPersona(value: string | null): value is Persona {
  return value === "deep_pressure" || value === "technical_probe";
}

// ── 오류 ─────────────────────────────────────────────────────────────────────

/**
 * 프로바이더 오류를 `stream_error`로 접습니다 (`05_api_contract.md` 10.2절).
 *
 * **`messageKo`에 프로바이더 원문을 넣지 않습니다.** SDK 예외에는 요청 헤더가 붙어 있는 경우가
 * 있어 그대로 흘리면 키가 샙니다 — `normalizeProviderError`가 이미 3분류로 접어 두었습니다.
 */
async function handleStreamFailure(prepared: Prepared, error: unknown): Promise<StreamError> {
  if (!isNormalizedProviderError(error)) {
    console.error("[turns] 스트림이 실패했습니다", error);
    return {
      code: "llm_failed",
      retryable: true,
      messageKo: "면접관 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (error.pauseReason !== null) {
    // 전이 표 15·16행 — `byok` 세션에서만 나옵니다. **공용 키로 폴백하지 않습니다.**
    await applyTransition({
      sessionId: prepared.session.id,
      from: "in_progress",
      to: "paused",
      trigger: "system_error",
      eventName: "byok_call_failed",
      patch: {
        pause_reason: error.pauseReason,
        paused_at: new Date().toISOString(),
        // `byok_quota_exhausted`에는 **재개 가능 시각을 채우지 않습니다** — 사용자 계정의
        // 리셋 시각을 우리 원장이 모르기 때문입니다. 지어내면 그 시각에 다시 온 사용자가 또 막힙니다.
        resumable_after: null,
      },
      admin: prepared.admin,
    }).catch((transitionError: unknown) => {
      console.error("[turns] 일시정지 전이에 실패했습니다", transitionError);
    });

    return {
      code: error.pauseReason === "byok_key_invalid" ? "byok_key_invalid" : "byok_quota_exhausted",
      // `byok_*` 2종은 `retryable: false` 고정입니다. 복구 주체가 우리가 아니라 사용자입니다.
      retryable: false,
      messageKo:
        error.pauseReason === "byok_key_invalid"
          ? "연결하신 키로 접속할 수 없었어요. 키가 삭제되었거나 권한이 바뀌었을 수 있습니다."
          : "연결하신 키의 사용량이 오늘 한도에 도달했어요. Google AI Studio에서 확인하실 수 있습니다.",
    };
  }

  return {
    code: "llm_rate_limited",
    retryable: true,
    messageKo: "면접관이 답변을 정리하고 있습니다. 잠시만요.",
  };
}
