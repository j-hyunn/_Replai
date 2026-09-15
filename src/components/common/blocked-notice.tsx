"use client";

import { Info } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  BLOCKED_COPY,
  GOOGLE_AI_STUDIO_URL,
  reopenNoticeKo,
  type BlockedAction,
  type BlockedCode,
} from "@/lib/blocked/blocked-copy";
import { apiKeyHref } from "@/lib/ui/format";

/**
 * 안내 3종의 **유일한 껍데기** (06_ui_plan.md 4.14절).
 *
 * **문구를 받지 않고 `code`를 받습니다.** 문구를 prop으로 받게 만드는 순간 호출부에서
 * 아무 문장이나 들어올 수 있고, 금칙어 검사 지점이 흩어집니다.
 */
export function BlockedNotice({
  code,
  /** 키 연결·교체 후 돌아올 내부 경로. **경로 외의 어떤 값도 싣지 않습니다.** */
  returnTo,
  /** `capacity_unavailable`에서만, 그리고 `null`이 아닐 때만 한 줄 덧붙입니다. */
  availableAtIso = null,
  /** #6에서 거절된 경우에만 true — 세션이 `configuring`에 남아 있다는 사실이 참입니다. */
  configPreserved = false,
  keyLast4 = null,
  onResume,
  onFinish,
}: {
  code: BlockedCode;
  returnTo: string;
  availableAtIso?: string | null;
  configPreserved?: boolean;
  keyLast4?: string | null;
  onResume?: () => void;
  onFinish?: () => void;
}) {
  const copy = BLOCKED_COPY[code];
  const reopen = code === "capacity_unavailable" ? reopenNoticeKo(availableAtIso) : null;

  function renderAction(action: BlockedAction) {
    switch (action.kind) {
      case "connect_key":
      case "replace_key":
        return (
          <Button key={action.kind} asChild variant={action.variant} size="sm">
            <Link href={apiKeyHref(returnTo)}>{action.label}</Link>
          </Button>
        );
      case "past_reports":
        return (
          <Button key={action.kind} asChild variant={action.variant} size="sm">
            <Link href="/sessions">{action.label}</Link>
          </Button>
        );
      case "resume":
        return onResume ? (
          <Button
            key={action.kind}
            variant={action.variant}
            size="sm"
            onClick={onResume}
          >
            {action.label}
          </Button>
        ) : null;
      case "finish":
        return onFinish ? (
          <Button
            key={action.kind}
            variant={action.variant}
            size="sm"
            onClick={onFinish}
          >
            {action.label}
          </Button>
        ) : null;
    }
  }

  return (
    <Alert>
      <Info aria-hidden />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        {copy.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {/* `details.keyLast4`가 오면 어느 키인지 짚어 줍니다. 그 외 키 값은 표시하지 않습니다. */}
        {keyLast4 && code !== "capacity_unavailable" ? (
          <p>••••{keyLast4} 키입니다.</p>
        ) : null}
        {reopen ? <p>{reopen}</p> : null}
        {configPreserved ? <p>지금까지 입력하신 설정은 그대로 저장돼 있어요.</p> : null}
        {code === "byok_quota_exhausted" ? (
          <p>
            <a
              href={GOOGLE_AI_STUDIO_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              Google AI Studio에서 확인하기
            </a>
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {copy.actions.map(renderAction)}
        </div>
      </AlertDescription>
    </Alert>
  );
}
