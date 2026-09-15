"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { Citation, Evaluation, EvaluationAxis, Persona } from "@/lib/api/types";
import { AXIS_LABEL } from "@/lib/report/axis-meta";
import { PERSONA_LABEL } from "@/lib/session/labels";
import { formatScore } from "@/lib/ui/format";

/**
 * 리포트 점수 표현 (06_ui_plan.md 7.1~7.3절).
 *
 * **점수는 언제나 인용과 함께** 보여 줍니다 — 인용 없는 점수는 이 제품에서 성립하지
 * 않습니다(핵심 가치 2). 그래서 축 카드는 `Accordion`이 아니라 **항상 펼쳐진 `Card`**입니다.
 */

export function OverallScoreCard({
  evaluation,
  persona,
}: {
  evaluation: Evaluation;
  persona: Persona | null;
}) {
  const score = evaluation.overallScore;

  return (
    <Card>
      <CardContent className="space-y-3 py-6">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight">
            {formatScore(score)}
          </span>
          <span className="text-lg text-muted-foreground">/ 5.0</span>
        </div>

        {/* 가중치가 다르면 다른 척도입니다 — 페르소나와 채점 기준을 총점 옆에 **반드시** 함께 (D1). */}
        <p className="text-sm text-muted-foreground">
          {persona ? `${PERSONA_LABEL[persona]} · ` : ""}
          채점 기준 {evaluation.rubricVersion}
        </p>

        {score === null ? (
          <p className="text-sm text-muted-foreground">
            이번 세션에서는 점수를 낼 근거가 부족했습니다.
          </p>
        ) : (
          <>
            <Progress value={(score / 5) * 100} />
            <p className="text-sm text-muted-foreground">
              5축 중 {evaluation.scoredAxisCount}축이 총점에 반영되었습니다.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** 인용 — 리포트에서 대화 전문으로 가는 딥링크를 함께 둡니다. */
function CitationBlock({
  citation,
  sessionId,
  disputed,
  onDispute,
}: {
  citation: Citation;
  sessionId: string;
  disputed: boolean;
  onDispute: () => void;
}) {
  return (
    <li className="space-y-1 rounded-lg border border-border p-3">
      <blockquote className="text-sm">❝ {citation.quoteText} ❞</blockquote>
      {citation.comment ? (
        <p className="text-sm text-muted-foreground">{citation.comment}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="xs">
          <Link href={`/sessions/${sessionId}/transcript#turn-${citation.turnId}`}>
            전문에서 보기 →
          </Link>
        </Button>
        {disputed ? (
          <Badge variant="outline">의견 보냄</Badge>
        ) : (
          <Button variant="ghost" size="xs" onClick={onDispute}>
            이건 아닌 것 같아요
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * 근거 부족 축 — **0점처럼 보이면 안 됩니다** (7.3절).
 * 판정 기준은 `isInsufficientEvidence === true` 하나입니다(숫자 0과 `null`을 헷갈릴 여지 제거).
 */
function InsufficientEvidenceCard({
  axis,
  disputed,
  onDispute,
}: {
  axis: EvaluationAxis;
  disputed: boolean;
  onDispute: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {AXIS_LABEL[axis.axis]}
          <Badge variant="outline">근거 부족</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="font-medium">채점하지 않음</p>
        <p className="text-muted-foreground">
          이번 세션에서는 판단할 근거가 부족했습니다. 이 축은 총점 계산에서 제외되었습니다.
        </p>
        <p className="text-muted-foreground">
          다음 세션에서 이 축이 채점되려면: {axis.rationale}
        </p>
        {/* "근거가 있었는데 못 찾았다"가 정확히 사용자가 알려 줄 수 있는 것입니다. */}
        <div>
          {disputed ? (
            <Badge variant="outline">의견 보냄</Badge>
          ) : (
            <Button variant="ghost" size="xs" onClick={onDispute}>
              이건 아닌 것 같아요
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AxisScoreCard({
  axis,
  sessionId,
  disputedScoreIds,
  disputedCitationIds,
  onDispute,
  onViewed,
}: {
  axis: EvaluationAxis;
  sessionId: string;
  disputedScoreIds: Set<string>;
  disputedCitationIds: Set<string>;
  onDispute: (input: { scoreId: string; citationId: string | null }) => void;
  /** 지표 5의 **분모**입니다 — 빠지면 지표가 계산되지 않습니다(7.2절). */
  onViewed: (axis: EvaluationAxis) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reported = useRef(false);

  // 뷰포트에 50% 이상 1초 이상 들어오면 축당 **1회** 보냅니다.
  useEffect(() => {
    const element = ref.current;
    if (!element || reported.current) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !reported.current) {
          timer = setTimeout(() => {
            reported.current = true;
            onViewed(axis);
          }, 1_000);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(element);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [axis, onViewed]);

  const disputed = disputedScoreIds.has(axis.id);

  if (axis.isInsufficientEvidence) {
    return (
      <div ref={ref}>
        <InsufficientEvidenceCard
          axis={axis}
          disputed={disputed}
          onDispute={() => onDispute({ scoreId: axis.id, citationId: null })}
        />
      </div>
    );
  }

  return (
    <div ref={ref}>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {AXIS_LABEL[axis.axis]}
            <span className="text-sm font-normal text-muted-foreground">
              {axis.score} / 5 · 가중치 {axis.weight.toFixed(2)}
            </span>
            {disputed ? (
              <Badge variant="outline">의견 보냄</Badge>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onDispute({ scoreId: axis.id, citationId: null })}
              >
                이건 아닌 것 같아요
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{axis.rationale}</p>

          {axis.citations.length > 0 ? (
            <>
              <Separator />
              <p className="font-medium">근거가 된 내 답변</p>
              <ul className="space-y-2">
                {axis.citations.map((citation) => (
                  <CitationBlock
                    key={citation.id}
                    citation={citation}
                    sessionId={sessionId}
                    // 축 단위와 인용 단위는 **별개**입니다 — 두 Set을 섞지 않습니다.
                    disputed={disputedCitationIds.has(citation.id)}
                    onDispute={() =>
                      onDispute({ scoreId: axis.id, citationId: citation.id })
                    }
                  />
                ))}
              </ul>
            </>
          ) : null}

          {/* `improvement === null`이면 이 영역을 **통째로 감춥니다** — "생성 실패"를 축마다 반복하지 않습니다. */}
          {axis.improvement ? (
            <>
              <Separator />
              <p className="font-medium">이렇게 해보세요</p>
              <p className="text-muted-foreground">{axis.improvement}</p>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
