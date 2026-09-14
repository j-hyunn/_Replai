"use client";

import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { Turn } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * 대화 로그 (06_ui_plan.md 5절 재사용 원칙 1 · 6.2절).
 *
 * ⚠️ **이 컴포넌트는 모달리티를 모릅니다.** `turns`만 받습니다. 음성이든 텍스트든 같은 트리가
 * 그려지고, 교체되는 것은 입력 영역 하나뿐입니다. 두 모드를 다른 페이지로 나누면
 * 세션 중 전환이 불가능해집니다.
 */

export function TurnBubble({
  turn,
  correction,
}: {
  turn: Turn;
  /** 직전 답변 정정 슬롯. 정정 창이 닫혔으면 `null`을 넘깁니다. */
  correction?: React.ReactNode;
}) {
  const isInterviewer = turn.role === "interviewer";

  return (
    <div
      id={`turn-${turn.id}`}
      className={cn("flex flex-col gap-1", isInterviewer ? "items-start" : "items-end")}
    >
      <span className="text-xs text-muted-foreground">
        {isInterviewer ? "면접관" : "내 답변"}
      </span>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
          isInterviewer
            ? "bg-muted text-foreground"
            : "border border-border bg-card text-card-foreground",
        )}
      >
        {turn.transcriptText}
      </div>
      <div className="flex items-center gap-2">
        {turn.isCorrected ? <Badge variant="outline">정정됨</Badge> : null}
        {/* `sttConfidence`는 **보조 신호일 뿐**이며 `null`이 흔합니다(L6). */}
        {turn.sttConfidence !== null && turn.sttConfidence < 0.6 ? (
          <span className="text-xs text-muted-foreground">
            인식이 불확실합니다. 확인해 주세요
          </span>
        ) : null}
        {correction}
      </div>
    </div>
  );
}

/** 스트리밍 중인 면접관 발화 + 깜빡이는 커서. */
export function StreamingTurn({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-start gap-1" aria-busy="true">
      <span className="text-xs text-muted-foreground">면접관</span>
      <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
        {text}
        <span className="ml-0.5 animate-pulse" aria-hidden>
          ▍
        </span>
      </div>
    </div>
  );
}

export function ConversationLog({
  turns,
  streamingText,
  correctionFor,
}: {
  turns: Turn[];
  /** 비어 있으면 스트리밍 버블을 그리지 않습니다. */
  streamingText: string;
  /** 정정 창이 열려 있는 턴 id. 그 턴에만 연필 버튼이 붙습니다. */
  correctionFor?: { turnId: string; render: (turn: Turn) => React.ReactNode };
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  // **자동 스크롤은 사용자가 맨 아래에 있을 때만.** 위로 스크롤해 과거 발화를 읽는 중이면
  // 강제로 내리지 않습니다.
  useEffect(() => {
    if (pinned) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, streamingText, pinned]);

  return (
    <div className="relative">
      {/*
        스트리밍 중 글자마다 읽히면 안 되므로 컨테이너는 `aria-live="off"`입니다.
        완성된 발화는 상위 화면의 `LiveRegion`이 한 번에 읽습니다(6.2절).
      */}
      <ScrollArea className="h-[52vh] rounded-lg border border-border">
        <div
          ref={containerRef}
          aria-live="off"
          className="space-y-4 p-4"
          onScroll={(event) => {
            const el = event.currentTarget;
            setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
          }}
        >
          {turns.map((turn) => (
            <TurnBubble
              key={turn.id}
              turn={turn}
              correction={
                correctionFor && correctionFor.turnId === turn.id
                  ? correctionFor.render(turn)
                  : null
              }
            />
          ))}
          {streamingText.length > 0 ? <StreamingTurn text={streamingText} /> : null}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {!pinned ? (
        <Button
          size="sm"
          variant="outline"
          className="absolute right-4 bottom-4"
          onClick={() => {
            setPinned(true);
            bottomRef.current?.scrollIntoView({ block: "end" });
          }}
        >
          새 발화 보기
        </Button>
      ) : null}
    </div>
  );
}

/**
 * 직전 답변 정정 (06_ui_plan.md 6.7절).
 *
 * 문구는 **"고친 내용은 평가에 반영됩니다."** — "면접관이 다시 듣습니다"가 아닙니다(U7).
 * 창은 다음 면접관 발화의 `utterance_done` 도착과 함께 닫힙니다.
 */
export function TranscriptCorrection({
  turn,
  onSave,
  pending,
}: {
  turn: Turn;
  onSave: (text: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(turn.transcriptText);

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="xs"
        onClick={() => {
          setText(turn.transcriptText);
          setOpen(true);
        }}
      >
        <Pencil aria-hidden />
        답변 고치기
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2">
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        aria-label="답변 정정"
      />
      <p className="text-xs text-muted-foreground">고친 내용은 평가에 반영됩니다.</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || text.trim().length === 0}
          onClick={() => {
            onSave(text);
            setOpen(false);
          }}
        >
          저장
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          취소
        </Button>
      </div>
    </div>
  );
}
