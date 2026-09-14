"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BLOCKED_COPY,
  GOOGLE_AI_STUDIO_URL,
} from "@/lib/blocked/blocked-copy";
import type { PauseReason, Session } from "@/lib/api/types";
import { apiKeyHref, formatDateTime, resumeDeadline } from "@/lib/ui/format";

/**
 * 재개 패널 (`paused`) — 06_ui_plan.md 4.6.1절.
 *
 * `pauseReason` **5종을 전부 분기**합니다(D28). 모르는 값이 오면 `user_requested`의
 * 중립 문구로 폴백합니다 — 모르는 값 때문에 패널이 비면 사용자가 세션에 갇힙니다.
 *
 * ⚠️ **`byok_*` 2종에 재개 가능 시각을 표시하지 않습니다.** 둘 다 `resumableAfter`가
 * `null`이고, `rate_limited`용 카운트다운을 재사용하면 "Invalid Date"가 렌더됩니다.
 * [이어서 하기]도 `disabled`로 두지 않습니다 — 키를 고친 사용자는 지금 당장 이어서 할 수
 * 있어야 합니다.
 */

type PanelCopy = { title: string; body: string[] };

function copyFor(reason: PauseReason | null, session: Session): PanelCopy {
  switch (reason) {
    case "rate_limited":
      return {
        title: "지금은 이어갈 수 없습니다",
        body: [
          session.resumableAfter
            ? `${formatDateTime(session.resumableAfter)} 이후 "이어서 하기"를 누르면 마지막 질문부터 계속됩니다.`
            : "잠시 후 \"이어서 하기\"를 누르면 마지막 질문부터 계속됩니다.",
        ],
      };
    case "connection_lost":
      return {
        title: "연결이 끊어져 면접이 멈췄습니다",
        body: ["마지막 질문부터 이어서 진행합니다."],
      };
    case "byok_key_invalid":
      return {
        title: BLOCKED_COPY.byok_key_invalid.title,
        body: BLOCKED_COPY.byok_key_invalid.body,
      };
    case "byok_quota_exhausted":
      return {
        title: BLOCKED_COPY.byok_quota_exhausted.title,
        body: BLOCKED_COPY.byok_quota_exhausted.body,
      };
    case "user_requested":
    default:
      return {
        title: "면접을 일시정지했습니다",
        body: ["마지막 질문부터 이어서 진행합니다."],
      };
  }
}

export function ResumePanel({
  session,
  onResume,
  onFinish,
  onCancel,
  pending,
}: {
  session: Session;
  onResume: () => void;
  onFinish: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const reason = session.pauseReason;
  const copy = copyFor(reason, session);
  const deadline = resumeDeadline(session.pausedAt);

  // 현재 시각은 렌더 중에 읽지 않습니다 — 렌더는 순수해야 합니다. 타이머로 밀어 넣습니다.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const frame = requestAnimationFrame(tick);
    const interval = setInterval(tick, 1_000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
    };
  }, []);

  // `rate_limited`에서만 시각 가드가 있습니다. `byok_*` 2종은 `resumableAfter`가 `null`이므로
  // 이 분기에 들어올 수 없고, [이어서 하기]가 `disabled`로 잠기지 않습니다.
  const waiting =
    reason === "rate_limited" &&
    session.resumableAfter !== null &&
    now !== null &&
    Date.parse(session.resumableAfter) > now;

  // "여기서 마치기"는 답변한 주질문이 1개 이상이어야 합니다(전이 가드).
  const canFinish = session.answeredMainQuestionCount >= 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {copy.body.map((paragraph) => (
          <p key={paragraph} className="text-muted-foreground">
            {paragraph}
          </p>
        ))}

        {reason === "byok_quota_exhausted" ? (
          <p>
            <a
              href={GOOGLE_AI_STUDIO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-4"
            >
              Google AI Studio에서 확인하기
            </a>
          </p>
        ) : null}

        {/* 세션은 잃지 않습니다 — 대화 로그는 그대로이고 7일 재개 창이 동일합니다(D7). */}
        {deadline ? (
          <p className="text-muted-foreground">
            이 면접은 {deadline}까지 이어서 할 수 있습니다.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {reason === "byok_key_invalid" ? (
            <Button asChild>
              <Link href={apiKeyHref(`/sessions/${session.id}/interview`)}>
                키 교체하기
              </Link>
            </Button>
          ) : null}
          <Button
            variant={reason === "byok_key_invalid" ? "outline" : "default"}
            onClick={onResume}
            disabled={pending || waiting}
          >
            이어서 하기
          </Button>
          <Button variant="outline" onClick={onFinish} disabled={pending || !canFinish}>
            여기서 마치기
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            이 면접 그만두기
          </Button>
        </div>
        {!canFinish ? (
          <p className="text-xs text-muted-foreground">
            답변한 주질문이 1개 이상이어야 평가할 수 있습니다.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * `session_notice(distress_guard)` 3지 선택 (06_ui_plan.md 6.2절).
 * G4가 발동하면 사용자는 "계속 / 잠시 쉬기 / 여기서 마치기"를 받아야 합니다.
 */
export function DistressChoiceDialog({
  open,
  onOpenChange,
  messageKo,
  onPause,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageKo: string;
  onPause: () => void;
  onComplete: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>잠시 숨을 고를까요?</DialogTitle>
          <DialogDescription>{messageKo}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onComplete}>
            여기서 마치기
          </Button>
          <Button variant="outline" onClick={onPause}>
            잠시 쉬기
          </Button>
          <Button onClick={() => onOpenChange(false)}>계속하기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
