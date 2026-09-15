"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { ReasonCode, ReportFeedback } from "@/lib/api/types";
import { REASON_CODE_LABEL } from "@/lib/session/labels";

/**
 * 유용성 피드백 (지표 4 · 06_ui_plan.md 7.5절).
 *
 * 초기 상태는 **`evaluation.myFeedback`에서 복원**합니다(D20) — 별도 조회 훅을 만들지 않습니다.
 * `PUT`이 멱등이므로 **수정은 언제나 열려 있습니다.**
 */
export function HelpfulnessFeedback({
  myFeedback,
  onSubmit,
  pending,
}: {
  myFeedback: ReportFeedback | null;
  onSubmit: (input: { isHelpful: boolean; comment: string | null }) => void;
  pending: boolean;
}) {
  const [isHelpful, setIsHelpful] = useState<boolean | null>(
    myFeedback ? myFeedback.isHelpful : null,
  );
  const [comment, setComment] = useState(myFeedback?.comment ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">이 피드백이 도움이 되었나요?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={isHelpful === true ? "default" : "outline"}
            size="sm"
            aria-pressed={isHelpful === true}
            onClick={() => setIsHelpful(true)}
          >
            <ThumbsUp aria-hidden />
            도움됐어요
          </Button>
          <Button
            variant={isHelpful === false ? "default" : "outline"}
            size="sm"
            aria-pressed={isHelpful === false}
            onClick={() => setIsHelpful(false)}
          >
            <ThumbsDown aria-hidden />
            아쉬워요
          </Button>
        </div>

        <Label htmlFor="feedback-comment">
          어떤 점이 그랬는지 알려 주세요 (선택)
        </Label>
        <Textarea
          id="feedback-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            disabled={isHelpful === null || pending}
            onClick={() => {
              if (isHelpful === null) return;
              onSubmit({ isHelpful, comment: comment.trim() || null });
            }}
          >
            저장
          </Button>
          {myFeedback ? (
            <p className="text-sm text-muted-foreground">
              의견을 남겨 주셔서 감사합니다. 언제든 바꿀 수 있습니다.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 이의 제기 (지표 5 · D4 · 06_ui_plan.md 7.6절).
 *
 * 제출 직후 다이얼로그를 닫지 말고 **확인 화면으로 바꿉니다.**
 * **"재평가 중"으로 오해할 수 있는 표현을 쓰지 않습니다** — 스피너·진행률을 띄우지 않습니다.
 */
export function DisputeDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
  submitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { reasonCode: ReasonCode; comment: string | null }) => void;
  pending: boolean;
  submitted: boolean;
}) {
  const [reasonCode, setReasonCode] = useState<ReasonCode>("misinterpreted");
  const [comment, setComment] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {submitted ? (
          <>
            <DialogHeader>
              <DialogTitle>의견이 접수되었습니다.</DialogTitle>
              <DialogDescription>
                이 의견으로 지금 점수가 다시 계산되지는 않습니다. 남겨 주신 사유는 채점 기준과
                질문을 다듬는 데 쓰이며, 다음 개선에 반영됩니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>닫기</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>어떤 점이 아쉬우셨나요?</DialogTitle>
              <DialogDescription>
                가장 가까운 이유를 하나 골라 주세요.
              </DialogDescription>
            </DialogHeader>

            {/* 값은 **영어 그대로 전송**하고 화면 문구만 한국어입니다. */}
            <RadioGroup
              value={reasonCode}
              onValueChange={(next) => setReasonCode(next as ReasonCode)}
              className="space-y-2"
              aria-label="이의 제기 사유"
            >
              {(Object.keys(REASON_CODE_LABEL) as ReasonCode[]).map((code) => (
                <Label
                  key={code}
                  htmlFor={`dispute-${code}`}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <RadioGroupItem id={`dispute-${code}`} value={code} />
                  {REASON_CODE_LABEL[code]}
                </Label>
              ))}
            </RadioGroup>

            <Label htmlFor="dispute-comment">덧붙일 말 (선택)</Label>
            <Textarea
              id="dispute-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
            />

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button
                disabled={pending}
                onClick={() => onSubmit({ reasonCode, comment: comment.trim() || null })}
              >
                의견 보내기
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
