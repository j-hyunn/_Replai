"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmCancelDialog } from "@/components/common/confirm-cancel-dialog";
import {
  DemoBadge,
  DemoBanner,
  isDemoSession,
  sessionExitHref,
} from "@/components/common/demo-notice";
import { ErrorState, LoadingCard, NotFoundState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useBackToConfig,
  useCancelSession,
  usePrewarm,
  useStartSession,
} from "@/hooks/use-session-mutations";
import { useSession } from "@/hooks/use-sessions";
import { isApiClientError } from "@/lib/api/fetch-json";
import { JOB_ROLE_LABEL, MODALITY_LABEL, PERSONA_LABEL } from "@/lib/session/labels";
import { routeForStatus } from "@/lib/session/route-for-status";

/**
 * `/sessions/[sessionId]/ready` — 준비·마이크 점검 (06_ui_plan.md 4.5절).
 *
 * **"오프닝 질문이 생성되었는가"는 별도 조회가 필요 없습니다** — `status === 'ready'`의
 * 정의 자체가 "컨텍스트 준비와 오프닝 질문 생성 완료"입니다.
 *
 * ⚠️ 마이크 사전 점검 6단계(`MicPrecheck`)는 음성 파이프라인(`src/lib/voice/*`)이 붙을 때
 * 이 화면에 들어옵니다. 그때까지는 `micReady: false`로 시작해 **텍스트로 진행**합니다 —
 * 텍스트 사용자는 어차피 3~6단계를 건너뛰므로(4.5절) 시작 경로가 막히지 않습니다.
 */
export default function ReadyPage({
  params,
}: PageProps<"/sessions/[sessionId]/ready">) {
  const { sessionId } = use(params);
  const router = useRouter();
  const session = useSession(sessionId);
  const startSession = useStartSession(sessionId);
  const backToConfig = useBackToConfig(sessionId);
  const cancelSession = useCancelSession();
  const prewarm = usePrewarm(sessionId);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [prewarmed, setPrewarmed] = useState(false);

  const status = session.data?.status;
  useEffect(() => {
    if (!status || status === "ready") return;
    router.replace(routeForStatus(status, sessionId));
  }, [router, sessionId, status]);

  if (session.isPending) {
    return (
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-8">
        <LoadingCard lines={4} />
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
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">면접 시작 준비</h1>
        {isDemoSession(current.fundingSource) ? <DemoBadge /> : null}
      </div>

      {/*
        4.16절이 요구하는 상시 표시는 면접·리포트·전문 3화면이지만, 데모 방문자가 `/demo`
        다음으로 **처음 보는 화면**이 여기입니다. 24시간 삭제는 시작 전에 한 번 더 보이는
        편이 낫습니다(D35-2가 입장 화면에도 명시하라고 한 것과 같은 이유).
      */}
      {isDemoSession(current.fundingSource) ? <DemoBanner /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">이렇게 진행됩니다</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {current.jobRole ? (
              <Badge variant="outline">{JOB_ROLE_LABEL[current.jobRole]}</Badge>
            ) : null}
            {current.persona ? (
              <Badge variant="outline">{PERSONA_LABEL[current.persona]}</Badge>
            ) : null}
            <Badge variant="outline">{MODALITY_LABEL[current.modality]}</Badge>
          </div>
          <p className="text-muted-foreground">
            주질문 {current.mainQuestionBudget}개, 꼬리질문은 최대{" "}
            {current.maxFollowUpDepth}단계까지 이어집니다. 약{" "}
            {current.maxDurationMin}분 안에 마무리됩니다.
          </p>
          {/* 음성 고지 — 저장되는 것은 텍스트 전사뿐입니다. */}
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>음성은 저장하지 않습니다. 남는 것은 텍스트 전사뿐입니다.</li>
            <li>면접 중 언제든 텍스트로 전환할 수 있고, 평가 결과는 같습니다.</li>
            <li>언제든 일시정지하거나 여기서 마칠 수 있습니다.</li>
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          size="lg"
          disabled={startSession.isPending}
          // 프리워밍은 **LLM을 부르지 않는 경로**이므로 1회만 호출해도 안전합니다(C4/P6).
          onMouseEnter={() => {
            if (prewarmed) return;
            setPrewarmed(true);
            prewarm.mutate();
          }}
          onFocus={() => {
            if (prewarmed) return;
            setPrewarmed(true);
            prewarm.mutate();
          }}
          onClick={() => {
            startSession.mutate(
              // 마이크 점검이 아직 없으므로 `false`입니다 — 시작을 막지 않고 텍스트로 진행합니다.
              { micReady: false },
              {
                onSuccess: () => router.replace(`/sessions/${sessionId}/interview`),
                onError: (error) => toast.error(error.message),
              },
            );
          }}
        >
          면접 시작
        </Button>
        {/*
          [설정 변경]은 `/sessions/new`로 돌아가는 버튼입니다 — 데모에는 설정 화면이 없고
          익명 사용자는 그 경로에서 `/login`으로 튕깁니다. 그래서 **렌더하지 않습니다**
          (`disabled`로 두면 고장으로 읽힙니다).
        */}
        {isDemoSession(current.fundingSource) ? null : (
          <Button
            variant="outline"
            size="lg"
            disabled={backToConfig.isPending}
            onClick={() => {
              backToConfig.mutate(undefined, {
                onSuccess: () => router.replace(`/sessions/new?sessionId=${sessionId}`),
                onError: (error) => toast.error(error.message),
              });
            }}
          >
            설정 변경
          </Button>
        )}
        <Button variant="ghost" size="lg" onClick={() => setCancelOpen(true)}>
          이 면접 그만두기
        </Button>
      </div>

      <ConfirmCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        pending={cancelSession.isPending}
        onConfirm={() => {
          cancelSession.mutate(sessionId, {
            onSuccess: () =>
              router.replace(sessionExitHref(current.fundingSource, "/sessions")),
            onError: (error) => toast.error(error.message),
          });
        }}
      />
    </main>
  );
}
