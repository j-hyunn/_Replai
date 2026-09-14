"use client";

import type { LucideIcon } from "lucide-react";
import { AlertCircle, Inbox, SearchX } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isApiClientError } from "@/lib/api/fetch-json";
import { cn } from "@/lib/utils";

/**
 * 로딩·빈 상태·오류·404의 공용 표현 (06_ui_plan.md 4절 상태 규약).
 *
 * **색 토큰만 씁니다.** 하드코딩된 색을 넣으면 다크 모드가 즉시 깨집니다.
 */

/** 빈 상태 — 아이콘 + 한 문장 + **다음 행동 버튼 1개**. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <Icon className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/**
 * 오류 상태 — 서버가 준 **한국어** `message`를 그대로 보여 줍니다.
 * 계약 13절의 `message`는 사용자에게 보여도 되는 문구입니다.
 */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const message = isApiClientError(error)
    ? error.message
    : "요청을 처리하지 못했습니다.";

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-6",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 text-destructive" aria-hidden />
        <p className="text-sm text-foreground">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          다시 시도
        </Button>
      ) : null}
    </div>
  );
}

/**
 * 404 전용.
 *
 * API는 남의 리소스와 없는 리소스를 **똑같이 404**로 답합니다(계약 7.3절).
 * UI도 구분하지 않습니다 — **"권한이 없습니다"라고 쓰지 않습니다.** 그 문구가 곧
 * "그 id는 존재한다"는 누설입니다.
 */
export function NotFoundState({
  title = "찾을 수 없는 세션입니다",
  href = "/sessions",
  linkLabel = "면접 이력으로 가기",
}: {
  title?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <EmptyState
      icon={SearchX}
      title={title}
      description="주소가 바뀌었거나 이미 삭제되었을 수 있습니다."
      action={
        <Button asChild variant="outline" size="sm">
          <Link href={href}>{linkLabel}</Link>
        </Button>
      }
    />
  );
}

/** 스피너 대신 **실제 레이아웃 모양의 스켈레톤**을 씁니다(레이아웃 점프 방지). */
export function LoadingCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <Skeleton className="h-5 w-1/3" />
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * 스크린리더 전용 라이브 리전 (06_ui_plan.md 11절).
 * 상태 변화를 시각뿐 아니라 **소리로도** 알립니다.
 */
export function LiveRegion({
  message,
  assertive = false,
}: {
  message: string;
  assertive?: boolean;
}) {
  return (
    <p
      className="sr-only"
      role="status"
      aria-live={assertive ? "assertive" : "polite"}
      aria-atomic="true"
    >
      {message}
    </p>
  );
}
