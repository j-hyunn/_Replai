"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingCard } from "@/components/common/states";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranscript } from "@/hooks/use-transcript";
import type { Question, Turn } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * `/sessions/[sessionId]/transcript` — 대화 전문 (06_ui_plan.md 4.8절).
 *
 * 리포트의 인용에서 `#turn-{turnId}`로 들어옵니다. 진입 시 해당 발화로 스크롤하고
 * 2초 동안 강조합니다.
 *
 * **깊이를 색 들여쓰기만으로 표현하지 않습니다** — "꼬리질문 {depth}단계" 텍스트를 병기합니다.
 */
export default function TranscriptPage({
  params,
}: PageProps<"/sessions/[sessionId]/transcript">) {
  const { sessionId } = use(params);
  const transcript = useTranscript(sessionId);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const ready = transcript.isSuccess;

  useEffect(() => {
    if (!ready) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#turn-")) return;

    const turnId = hash.slice("#turn-".length);
    const element = document.getElementById(`turn-${turnId}`);
    if (!element) return;

    // 렌더 직후 프레임에서 스크롤·강조를 시작합니다 — 효과 본문에서 바로 setState 하지 않습니다.
    const frame = requestAnimationFrame(() => {
      element.scrollIntoView({ block: "center" });
      setHighlighted(turnId);
    });
    const timer = setTimeout(() => setHighlighted(null), 2_000);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [ready]);

  return (
    <main id="main" className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">대화 전문</h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/sessions/${sessionId}/report`}>리포트로 돌아가기</Link>
        </Button>
      </div>

      {transcript.isPending ? (
        <LoadingCard lines={8} />
      ) : transcript.isError ? (
        <ErrorState
          error={transcript.error}
          onRetry={() => void transcript.refetch()}
        />
      ) : transcript.data.turns.length === 0 ? (
        <EmptyState title="이 세션에는 남은 대화가 없습니다" />
      ) : (
        <div className="space-y-3">
          {transcript.data.turns
            .slice()
            .sort((a, b) => a.seq - b.seq)
            .map((turn) => (
              <TranscriptTurn
                key={turn.id}
                turn={turn}
                question={findQuestion(transcript.data.questions, turn.questionId)}
                highlighted={highlighted === turn.id}
              />
            ))}
        </div>
      )}
    </main>
  );
}

function findQuestion(questions: Question[], id: string | null): Question | null {
  if (!id) return null;
  return questions.find((question) => question.id === id) ?? null;
}

function TranscriptTurn({
  turn,
  question,
  highlighted,
}: {
  turn: Turn;
  question: Question | null;
  highlighted: boolean;
}) {
  const depth = question?.depth ?? 0;

  return (
    <Card
      id={`turn-${turn.id}`}
      className={cn(
        "transition-colors",
        highlighted && "border-primary bg-muted",
        depth > 0 && "ml-4 sm:ml-8",
      )}
    >
      <CardContent className="space-y-2 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={turn.role === "interviewer" ? "secondary" : "outline"}>
            {turn.role === "interviewer" ? "면접관" : "내 답변"}
          </Badge>
          {question && question.questionKind === "follow_up" ? (
            <Badge variant="outline">꼬리질문 {question.depth}단계</Badge>
          ) : null}
          {turn.isCorrected ? (
            <Badge variant="outline">사용자가 정정한 답변</Badge>
          ) : null}
        </div>

        <p className="text-sm whitespace-pre-wrap">{turn.transcriptText}</p>

        {/* 정본은 `transcriptText`라는 사실을 화면 위계로 표현합니다 — 원문은 기본 접힘. */}
        {turn.isCorrected && turn.transcriptRaw ? (
          <Accordion type="single" collapsible>
            <AccordionItem value="raw">
              <AccordionTrigger className="text-sm">
                정정 전 받아쓴 내용 보기
              </AccordionTrigger>
              <AccordionContent className="text-sm whitespace-pre-wrap text-muted-foreground">
                {turn.transcriptRaw}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}
      </CardContent>
    </Card>
  );
}
