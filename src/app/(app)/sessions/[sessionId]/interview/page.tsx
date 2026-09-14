"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmCancelDialog } from "@/components/common/confirm-cancel-dialog";
import { ErrorState, LiveRegion, LoadingCard, NotFoundState } from "@/components/common/states";
import {
  AnswerInputText,
  AnswerInputVoice,
} from "@/components/interview/answer-input";
import {
  ConversationLog,
  TranscriptCorrection,
} from "@/components/interview/conversation-log";
import {
  DistressChoiceDialog,
  ResumePanel,
} from "@/components/interview/resume-panel";
import {
  VoiceStatePanel,
  type VoiceState,
} from "@/components/interview/voice-state-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useInterviewStream } from "@/hooks/use-interview-stream";
import { useSessionRealtime } from "@/hooks/use-session-realtime";
import {
  useCancelSession,
  useCompleteSession,
  useCorrectTurn,
  usePauseSession,
  useResumeSession,
  useSwitchModality,
} from "@/hooks/use-session-mutations";
import { useSession } from "@/hooks/use-sessions";
import { useTurnsResync } from "@/hooks/use-transcript";
import { isApiClientError } from "@/lib/api/fetch-json";
import type { Question, Session, Turn } from "@/lib/api/types";
import { JOB_ROLE_LABEL, PERSONA_LABEL } from "@/lib/session/labels";
import { routeForStatus } from "@/lib/session/route-for-status";

/**
 * `/sessions/[sessionId]/interview` — 면접 진행 (06_ui_plan.md 4.6절·6절).
 *
 * **텍스트 모드는 1급 시민입니다.** 대화 로그는 모달리티와 무관하게 같은 트리로 그려지고,
 * 교체되는 것은 입력 영역 하나뿐입니다.
 */
export default function InterviewPage({
  params,
}: PageProps<"/sessions/[sessionId]/interview">) {
  const { sessionId } = use(params);
  const session = useSession(sessionId);

  if (session.isPending) {
    return (
      <main id="main" className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
        <LoadingCard lines={2} />
        <LoadingCard lines={6} />
      </main>
    );
  }

  if (session.isError) {
    const notFound = isApiClientError(session.error) && session.error.status === 404;
    return (
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-8">
        {notFound ? (
          <NotFoundState />
        ) : (
          <ErrorState error={session.error} onRetry={() => void session.refetch()} />
        )}
      </main>
    );
  }

  return <InterviewRoom session={session.data} />;
}

function InterviewRoom({ session }: { session: Session }) {
  const router = useRouter();
  const sessionId = session.id;

  // Realtime은 **"변경됨" 신호로만** 씁니다 — 페이로드는 snake_case이므로 렌더링 금지(E1).
  useSessionRealtime(sessionId);

  const resync = useTurnsResync(sessionId);
  const stream = useInterviewStream(sessionId);
  const correctTurn = useCorrectTurn(sessionId);
  const pauseSession = usePauseSession(sessionId);
  const resumeSession = useResumeSession(sessionId);
  const completeSession = useCompleteSession(sessionId);
  const switchModality = useSwitchModality(sessionId);
  const cancelSession = useCancelSession();

  const [draft, setDraft] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  // 다이얼로그를 닫았는지만 기억합니다. "열려야 하는가"는 `notice`에서 **파생**합니다 —
  // 효과 안에서 setState 하면 렌더가 연쇄로 돕니다.
  const [distressDismissed, setDistressDismissed] = useState(false);

  // 상태가 자기 것이 아니면 `route-for-status()`로 보냅니다.
  useEffect(() => {
    if (session.status === "in_progress" || session.status === "paused") return;
    router.replace(routeForStatus(session.status, session.id));
  }, [router, session.id, session.status]);

  const turns = useMemo(() => resync.data?.turns ?? [], [resync.data]);
  const questions = useMemo(() => resync.data?.questions ?? [], [resync.data]);

  const currentQuestion = latestAskedQuestion(questions);
  const lastCandidateTurn = [...turns]
    .reverse()
    .find((turn) => turn.role === "candidate");
  const nextSeq = turns.reduce((max, turn) => Math.max(max, turn.seq), 0) + 1;

  // 4상태 매핑 — 텍스트 모드에서 `transcribing`은 나타나지 않습니다(6.1절).
  const voiceState: VoiceState =
    stream.state.phase === "streaming"
      ? stream.state.text.length > 0
        ? "speaking"
        : "thinking"
      : session.currentModality === "voice"
        ? "listening"
        : "thinking";

  const overlay =
    session.currentModality === "text" && session.modality === "voice"
      ? {
          kind: "text_fallback" as const,
          messageKo: "텍스트로 진행하고 있습니다. 평가 결과는 음성과 같습니다.",
        }
      : null;

  /**
   * 정정 창은 내 답변이 렌더된 순간부터 **다음 면접관 발화의 `utterance_done` 도착까지**
   * 열려 있습니다(6.7절). 그래서 상태가 아니라 스트림 phase에서 파생합니다 —
   * `done`이 도착하면 그 즉시 닫히고, 새로고침으로 들어온 경우에도 닫혀 있습니다
   * (그 시점에 고치려 하면 서버가 409를 줍니다).
   */
  const correctionOpen = stream.state.phase === "streaming";

  // `distress_guard`는 3지 선택 다이얼로그를 띄웁니다.
  const distressOpen =
    stream.state.notice?.kind === "distress_guard" && !distressDismissed;

  // `utterance_done`이 오면 로그를 재동기화하고, 종료 조건이 충족됐으면 리포트로 넘깁니다.
  useEffect(() => {
    if (stream.state.phase !== "done" || !stream.state.done) return;
    void resync.refetch();

    if (stream.state.done.sessionStatus === "completed") {
      // **`useCompleteSession`을 부르지 않습니다** — 서버가 이미 옮겼습니다(#9 종료 조건).
      router.replace(`/sessions/${sessionId}/report`);
    }
  }, [resync, router, sessionId, stream.state.done, stream.state.phase]);

  // `byok_*` 2종은 서버가 이미 세션을 `paused`로 옮겼습니다 — 재시도하지 않고 재개 패널로 넘깁니다.
  useEffect(() => {
    const code = stream.state.error?.code;
    if (code === "byok_key_invalid" || code === "byok_quota_exhausted") {
      void resync.refetch();
    }
  }, [resync, stream.state.error?.code]);

  function submitAnswer(text: string) {
    if (!currentQuestion) {
      toast.error("아직 질문이 준비되지 않았습니다.");
      return;
    }
    setDistressDismissed(false);
    void stream
      .submit({
        answerSeq: nextSeq,
        questionId: currentQuestion.id,
        transcriptText: text,
        modality: session.currentModality,
      })
      .catch(() => {
        // 스트림 시작 전 실패는 훅이 상태로 기록합니다. 여기서 재요청하지 않습니다 —
        // 409 `turn_seq_conflict`면 **재동기화**가 답입니다(계약 5.5절).
        void resync.refetch();
      });
    setDraft("");
  }

  const budget = session.mainQuestionBudget;

  return (
    <main id="main" className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">면접 진행</h1>
          {session.persona ? (
            <Badge variant="outline">{PERSONA_LABEL[session.persona]}</Badge>
          ) : null}
          {session.jobRole ? (
            <Badge variant="outline">{JOB_ROLE_LABEL[session.jobRole]}</Badge>
          ) : null}
          <span className="text-sm text-muted-foreground">
            주질문 {session.answeredMainQuestionCount}/{budget}
          </span>
        </div>

        {/* [일시정지]·[여기서 마치기]는 **상시 노출**입니다 — G4 오탐 대비 안전장치(6.6절). */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={session.status !== "in_progress" || pauseSession.isPending}
            onClick={() => {
              pauseSession.mutate(
                { pauseReason: "user_requested" },
                { onError: (error) => toast.error(error.message) },
              );
            }}
          >
            일시정지
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={
              session.answeredMainQuestionCount < 1 || completeSession.isPending
            }
            title={
              session.answeredMainQuestionCount < 1
                ? "답변한 주질문이 1개 이상이어야 평가할 수 있습니다."
                : undefined
            }
            onClick={() => {
              // 응답의 `session.status`는 정상 경로에서 `evaluating`입니다(D18).
              // `completed`를 기대하는 분기를 쓰면 정상 경로에서 한 번도 실행되지 않습니다.
              completeSession.mutate(undefined, {
                onSuccess: () => router.replace(`/sessions/${sessionId}/report`),
                onError: (error) => toast.error(error.message),
              });
            }}
          >
            여기서 마치기
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>
            이 면접 그만두기
          </Button>
        </div>
      </header>

      <Separator />

      {session.status === "paused" ? (
        <ResumePanel
          session={session}
          pending={resumeSession.isPending || completeSession.isPending}
          onResume={() => {
            resumeSession.mutate(undefined, {
              onSuccess: () => void resync.refetch(),
              onError: (error) => toast.error(error.message),
            });
          }}
          onFinish={() => {
            completeSession.mutate(undefined, {
              onSuccess: () => router.replace(`/sessions/${sessionId}/report`),
              onError: (error) => toast.error(error.message),
            });
          }}
          onCancel={() => setCancelOpen(true)}
        />
      ) : null}

      {resync.isPending ? (
        <LoadingCard lines={6} />
      ) : resync.isError ? (
        <ErrorState error={resync.error} onRetry={() => void resync.refetch()} />
      ) : (
        <ConversationLog
          turns={turns}
          streamingText={stream.state.text}
          correctionFor={
            correctionOpen && lastCandidateTurn
              ? {
                  turnId: lastCandidateTurn.id,
                  render: (turn: Turn) => (
                    <TranscriptCorrection
                      turn={turn}
                      pending={correctTurn.isPending}
                      onSave={(text) => {
                        correctTurn.mutate(
                          { turnId: turn.id, transcriptText: text },
                          {
                            onSuccess: () => void resync.refetch(),
                            onError: (error) => toast.error(error.message),
                          },
                        );
                      }}
                    />
                  ),
                }
              : undefined
          }
        />
      )}

      {/* 완성된 발화만 한 번에 읽힙니다 — 스트리밍 중 글자마다 읽으면 안 됩니다(6.2절). */}
      <LiveRegion
        message={
          stream.state.phase === "done" && stream.state.text.length > 0
            ? `면접관: ${stream.state.text}`
            : ""
        }
      />

      {/* 스트림 오류: **지금까지 렌더된 텍스트를 지우지 않고** 아래에 배너를 붙입니다. */}
      {stream.state.error ? (
        <Alert variant={stream.state.error.retryable ? "default" : "destructive"}>
          <AlertTitle>
            {stream.state.error.retryable
              ? "면접관 응답이 지연되고 있습니다"
              : "면접을 잠시 이어갈 수 없습니다"}
          </AlertTitle>
          <AlertDescription>
            <p>{stream.state.error.messageKo}</p>
            {stream.state.error.retryable ? (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    stream.reset();
                    void resync.refetch();
                  }}
                >
                  다시 시도
                </Button>
              </div>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {stream.state.notice && stream.state.notice.kind !== "distress_guard" ? (
        <Alert>
          <AlertTitle>안내</AlertTitle>
          <AlertDescription>{stream.state.notice.messageKo}</AlertDescription>
        </Alert>
      ) : null}

      <VoiceStatePanel state={voiceState} overlay={overlay} />

      {session.status === "in_progress" ? (
        <Card>
          <CardContent className="py-4">
            {session.currentModality === "voice" ? (
              <AnswerInputVoice
                disabled={stream.state.phase === "streaming"}
                onSubmitTranscript={submitAnswer}
                onSwitchToText={() => {
                  switchModality.mutate(
                    { modality: "text", reason: "user_requested" },
                    { onError: (error) => toast.error(error.message) },
                  );
                }}
              />
            ) : (
              <AnswerInputText
                value={draft}
                onChange={setDraft}
                disabled={stream.state.phase === "streaming"}
                onSubmit={() => submitAnswer(draft)}
                onSwitchToVoice={
                  draft.trim().length > 0
                    ? undefined
                    : () => {
                        switchModality.mutate(
                          { modality: "voice", reason: "user_requested" },
                          { onError: (error) => toast.error(error.message) },
                        );
                      }
                }
              />
            )}
            {session.currentModality === "text" && draft.trim().length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                음성으로 전환하려면 먼저 작성 중인 답변을 보내거나 지워 주세요.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <DistressChoiceDialog
        open={distressOpen}
        onOpenChange={(open) => setDistressDismissed(!open)}
        messageKo={stream.state.notice?.messageKo ?? ""}
        onPause={() => {
          setDistressDismissed(true);
          pauseSession.mutate(
            { pauseReason: "user_requested" },
            { onError: (error) => toast.error(error.message) },
          );
        }}
        onComplete={() => {
          setDistressDismissed(true);
          completeSession.mutate(undefined, {
            onSuccess: () => router.replace(`/sessions/${sessionId}/report`),
            onError: (error) => toast.error(error.message),
          });
        }}
      />

      <ConfirmCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        pending={cancelSession.isPending}
        onConfirm={() => {
          // 진행 중 취소의 순서: ② 진행 중 SSE abort → ④ 취소 → ⑤ 이동.
          // (①·③의 오디오 정리는 음성 파이프라인이 붙을 때 이 자리에 들어갑니다.)
          stream.abort();
          cancelSession.mutate(sessionId, {
            onSuccess: () => router.replace("/sessions?includeCanceled=true"),
            onError: (error) => toast.error(error.message),
          });
        }}
      />
    </main>
  );
}

/** 마지막으로 발화된 질문 — 다음 답변이 붙을 질문입니다. */
function latestAskedQuestion(questions: Question[]): Question | null {
  const asked = questions.filter((question) => question.askedAt !== null);
  if (asked.length === 0) return questions[0] ?? null;
  return asked.reduce((latest, question) =>
    question.orderIndex > latest.orderIndex ? question : latest,
  );
}
