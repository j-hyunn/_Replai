"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmCancelDialog } from "@/components/common/confirm-cancel-dialog";
import { ErrorState, LoadingCard, NotFoundState } from "@/components/common/states";
import { DisputeDialog, HelpfulnessFeedback } from "@/components/report/feedback";
import { AxisScoreCard, OverallScoreCard } from "@/components/report/score-cards";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useEvaluation, useCreateDispute, useReportFeedback, useRetryCoach, useRetryEvaluation } from "@/hooks/use-evaluation";
import { useSessionRealtime } from "@/hooks/use-session-realtime";
import {
  useCancelSession,
  useCreateSession,
  useReportEvent,
} from "@/hooks/use-session-mutations";
import { useSession } from "@/hooks/use-sessions";
import { isApiClientError } from "@/lib/api/fetch-json";
import type { Evaluation, ReasonCode, Session } from "@/lib/api/types";
import { AXIS_LABEL, sortAxes } from "@/lib/report/axis-meta";
import {
  failureReasonKo,
  isCancelable,
  isRetryableEvaluationFailure,
} from "@/lib/session/labels";

/**
 * `/sessions/[sessionId]/report` — 리포트 (06_ui_plan.md 4.7·7·8절).
 *
 * ⚠️ **`completed`와 `evaluating`은 같은 대기 화면**입니다 (D18). 평가는 서버가
 * `completed` 전이의 부작용으로 등록하므로, `completed`는 "아직 시작되지 않음"이 아니라
 * "방금 등록되었거나 등록 재시도 중"입니다.
 * ⚠️ **진입 시 `useRetryEvaluation`을 자동 호출하지 않습니다** — 정상 경로에서 항상 409입니다.
 */
export default function ReportPage({
  params,
}: PageProps<"/sessions/[sessionId]/report">) {
  const { sessionId } = use(params);
  const router = useRouter();
  const session = useSession(sessionId);

  useSessionRealtime(sessionId);

  const status = session.data?.status;
  const waiting = status === "completed" || status === "evaluating";

  // Realtime이 1순위, 폴링이 폴백입니다(계약 3절). 대기 중에만 3초 간격으로 돕니다.
  const evaluation = useEvaluation(sessionId, {
    refetchInterval: waiting ? 3_000 : false,
  });

  useEffect(() => {
    if (!status) return;
    const belongs =
      status === "completed" ||
      status === "evaluating" ||
      status === "evaluated" ||
      status === "failed";
    if (!belongs && session.data) {
      router.replace(`/sessions/${sessionId}`);
    }
  }, [router, session.data, sessionId, status]);

  if (session.isPending) {
    return (
      <main id="main" className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
        <LoadingCard lines={3} />
        <LoadingCard lines={5} />
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

  const current = session.data;

  return (
    <main id="main" className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">면접 리포트</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/sessions/${sessionId}/transcript`}>대화 전문</Link>
          </Button>
          <RepeatSessionButton session={current} />
        </div>
      </div>

      {waiting ? <EvaluationWaiting /> : null}

      {current.status === "failed" ? <FailedReport session={current} /> : null}

      {current.status === "evaluated" ? (
        evaluation.isPending ? (
          <LoadingCard lines={6} />
        ) : evaluation.isError ? (
          <ErrorState
            error={evaluation.error}
            onRetry={() => void evaluation.refetch()}
          />
        ) : evaluation.data === null ? (
          <EvaluationWaiting />
        ) : (
          <ReportBody
            sessionId={sessionId}
            session={current}
            evaluation={evaluation.data}
          />
        )
      ) : null}
    </main>
  );
}

/** `completed`·`evaluating` 공용 대기 화면 (8.1·8.2절). */
function EvaluationWaiting() {
  return (
    <Card>
      <CardContent className="space-y-2 py-8 text-center">
        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">답변을 평가하고 있습니다</p>
        <p className="text-sm text-muted-foreground">보통 1~2분 걸립니다.</p>
        <p className="text-sm text-muted-foreground">
          이 화면을 닫아도 평가는 계속됩니다.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * `failed` 화면 — **[평가 재시도]는 평가 계열 `failureReason` 2개에서만** 노출합니다.
 * 그 밖의 사유에 노출하면 #16이 409를 돌려줍니다(계약 4.4절).
 */
function FailedReport({ session }: { session: Session }) {
  const router = useRouter();
  const retry = useRetryEvaluation(session.id);
  const cancelSession = useCancelSession();
  const [cancelOpen, setCancelOpen] = useState(false);

  return (
    <>
      <Alert variant="destructive">
        <AlertTitle>이 면접의 리포트를 만들지 못했습니다</AlertTitle>
        <AlertDescription>
          <p>{failureReasonKo(session.failureReason)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {isRetryableEvaluationFailure(session.failureReason) ? (
              <Button
                size="sm"
                disabled={retry.isPending}
                onClick={() => {
                  retry.mutate(undefined, {
                    onError: (error) => toast.error(error.message),
                  });
                }}
              >
                평가 재시도
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href="/sessions/new">새 면접 시작</Link>
              </Button>
            )}
            {/* `failed → canceled`는 열린 전이이며, 실패한 세션을 치우는 유일한 비파괴 수단입니다. */}
            {isCancelable(session.status) ? (
              <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>
                이 면접 그만두기
              </Button>
            ) : null}
          </div>
        </AlertDescription>
      </Alert>

      <ConfirmCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        pending={cancelSession.isPending}
        onConfirm={() => {
          cancelSession.mutate(session.id, {
            onSuccess: () => router.replace("/sessions?includeCanceled=true"),
            onError: (error) => toast.error(error.message),
          });
        }}
      />
    </>
  );
}

/** "같은 이력서로 다시 하기" — 설정을 물려받은 새 세션을 만듭니다(#3의 `sourceSessionId`). */
function RepeatSessionButton({ session }: { session: Session }) {
  const router = useRouter();
  const createSession = useCreateSession();

  return (
    <Button
      size="sm"
      disabled={createSession.isPending}
      onClick={() => {
        createSession.mutate(
          { sourceSessionId: session.id },
          {
            onSuccess: (created) =>
              router.push(`/sessions/new?sessionId=${created.id}`),
            onError: (error) => toast.error(error.message),
          },
        );
      }}
    >
      같은 이력서로 다시 하기
    </Button>
  );
}

function ReportBody({
  sessionId,
  session,
  evaluation,
}: {
  sessionId: string;
  session: Session;
  evaluation: Evaluation;
}) {
  const reportEvent = useReportEvent(sessionId);
  const feedback = useReportFeedback(sessionId);
  const dispute = useCreateDispute(sessionId);
  const retryCoach = useRetryCoach(sessionId);

  const [disputeTarget, setDisputeTarget] = useState<{
    scoreId: string;
    citationId: string | null;
  } | null>(null);
  const [disputeSubmitted, setDisputeSubmitted] = useState(false);

  // 리포트 최초 렌더 시 `report_viewed`를 1회 보냅니다.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    reportEvent.mutate({ eventName: "report_viewed" });
  }, [reportEvent]);

  // 연결 키: `myDisputes[].scoreId` ↔ `EvaluationAxis.id`, `citationId` ↔ `Citation.id`.
  // **빈 값은 `[]`이고 `null`이 아니므로** `?? []` 방어 코드를 두지 않습니다(계약 12.3절).
  const disputedScoreIds = useMemo(
    () =>
      new Set(
        evaluation.myDisputes
          .filter((item) => item.citationId === null)
          .map((item) => item.scoreId),
      ),
    [evaluation.myDisputes],
  );
  const disputedCitationIds = useMemo(
    () =>
      new Set(
        evaluation.myDisputes
          .map((item) => item.citationId)
          .filter((value): value is string => value !== null),
      ),
    [evaluation.myDisputes],
  );

  // `axes`는 언제나 정확히 5개입니다 — 개수가 다르면 렌더링하지 말고 오류로 처리합니다.
  if (evaluation.axes.length !== 5) {
    return (
      <ErrorState error={new Error("리포트를 불러오지 못했습니다.")} />
    );
  }

  const axes = sortAxes(evaluation.axes);
  // **"코치 미완료"의 유일한 판정 기준은 `summary === null`** 입니다.
  const coachIncomplete = evaluation.summary === null;

  return (
    <div className="space-y-6">
      <OverallScoreCard evaluation={evaluation} persona={session.persona} />

      {coachIncomplete ? (
        <Alert>
          <AlertTitle>개선 제안을 만들지 못했습니다</AlertTitle>
          <AlertDescription>
            <p>점수와 근거는 그대로 보실 수 있습니다.</p>
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                disabled={retryCoach.isPending}
                onClick={() => {
                  retryCoach.mutate(undefined, {
                    onError: (error) => toast.error(error.message),
                  });
                }}
              >
                개선 제안 다시 생성
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">총평</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{evaluation.summary}</p>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3" aria-labelledby="axes-heading">
        <h2 id="axes-heading" className="text-lg font-semibold tracking-tight">
          축별 채점
        </h2>
        {axes.map((axis) => (
          <AxisScoreCard
            key={axis.id}
            axis={axis}
            sessionId={sessionId}
            disputedScoreIds={disputedScoreIds}
            disputedCitationIds={disputedCitationIds}
            onDispute={(target) => {
              setDisputeSubmitted(false);
              setDisputeTarget(target);
            }}
            onViewed={(viewed) =>
              reportEvent.mutate({
                eventName: "score_card_viewed",
                detail: { axis: viewed.axis, scoreId: viewed.id },
              })
            }
          />
        ))}
      </section>

      {/*
        jsonb 본문의 키는 **snake_case**입니다 (계약 2.1절 E3).
        `related_axis`·`why_weak`·`model_answer`·`expected_effect`를 camelCase로 고쳐 쓰면
        런타임에 `undefined`입니다.
      */}
      {evaluation.improvements && evaluation.improvements.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">먼저 고칠 것</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {evaluation.improvements.map((item) => (
                <li key={`${item.priority}-${item.title}`} className="space-y-1">
                  <p className="font-medium">
                    {item.priority}. {item.title}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({AXIS_LABEL[item.related_axis]})
                    </span>
                  </p>
                  <p className="text-muted-foreground">{item.action}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {evaluation.coachPayload &&
      evaluation.coachPayload.model_answers.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">이렇게 답할 수 있었어요</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {evaluation.coachPayload.model_answers.map((item) => (
              <div key={item.question_id} className="space-y-1">
                <p className="text-muted-foreground">{item.why_weak}</p>
                <p className="whitespace-pre-wrap">{item.model_answer}</p>
                <Separator />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {evaluation.coachPayload &&
      evaluation.coachPayload.next_actions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">다음에 해볼 것</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {evaluation.coachPayload.next_actions.map((item) => (
                <li key={item.order}>
                  <span className="font-medium">
                    {item.order}. {item.action}
                  </span>
                  <span className="block text-muted-foreground">
                    {item.expected_effect}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <HelpfulnessFeedback
        myFeedback={evaluation.myFeedback}
        pending={feedback.isPending}
        onSubmit={(input) => {
          feedback.mutate(input, {
            onError: (error) => toast.error(error.message),
          });
        }}
      />

      <DisputeDialog
        open={disputeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDisputeTarget(null);
            setDisputeSubmitted(false);
          }
        }}
        pending={dispute.isPending}
        submitted={disputeSubmitted}
        onSubmit={(input: { reasonCode: ReasonCode; comment: string | null }) => {
          if (!disputeTarget) return;
          dispute.mutate(
            { ...disputeTarget, ...input },
            {
              onSuccess: () => setDisputeSubmitted(true),
              onError: (error) => {
                // 경합으로 409가 오면 **오류 토스트가 아니라** 안내입니다 —
                // 사용자가 잘못한 것이 아닙니다.
                if (isApiClientError(error) && error.status === 409) {
                  setDisputeSubmitted(true);
                  return;
                }
                toast.error(error.message);
              },
            },
          );
        }}
      />
    </div>
  );
}
