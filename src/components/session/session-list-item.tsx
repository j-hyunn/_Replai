"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { SessionStatusBadge } from "@/components/session/session-status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { SessionSummary } from "@/lib/api/types";
import { JOB_ROLE_LABEL, PERSONA_LABEL } from "@/lib/session/labels";
import { routeForStatus } from "@/lib/session/route-for-status";
import { formatDate, formatScore } from "@/lib/ui/format";

/**
 * `/dashboard`·`/sessions` 공용 행 (06_ui_plan.md 4.9절).
 *
 * **`Table`이 아니라 `Card` 리스트**입니다 — 모바일에서 표는 가로 스크롤을 만듭니다.
 * **`overallScore`를 `scoredAxisCount` 없이 단독으로 보여주지 않습니다**(계약 9.1절):
 * 2축만 채점된 4.5와 5축 전부 채점된 4.5는 같은 숫자가 아닙니다.
 */
export function SessionListItem({
  session,
  /** 행 메뉴 등 우측 슬롯. 대시보드에서는 비웁니다. */
  action,
}: {
  session: SessionSummary;
  action?: ReactNode;
}) {
  const href = routeForStatus(session.status, session.id);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <SessionStatusBadge status={session.status} />
            {session.jobRole ? (
              <Badge variant="outline">{JOB_ROLE_LABEL[session.jobRole]}</Badge>
            ) : null}
            {session.persona ? (
              <Badge variant="outline">{PERSONA_LABEL[session.persona]}</Badge>
            ) : null}
            {session.isReportUnread ? <Badge>새 리포트</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatDate(session.createdAt)}
            {session.overallScore !== null || session.scoredAxisCount !== null ? (
              <>
                {" · 총점 "}
                {formatScore(session.overallScore)}
                {session.scoredAxisCount !== null
                  ? ` (5축 중 ${session.scoredAxisCount}축 채점)`
                  : null}
              </>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
          >
            열기
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
          {action}
        </div>
      </CardContent>
    </Card>
  );
}
