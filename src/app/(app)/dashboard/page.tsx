"use client";

import { FileText, Plus } from "lucide-react";
import Link from "next/link";

import { BlockedNotice } from "@/components/common/blocked-notice";
import { EmptyState, ErrorState, LoadingCard } from "@/components/common/states";
import { SessionListItem } from "@/components/session/session-list-item";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCapacity } from "@/hooks/use-account";
import { useDashboard } from "@/hooks/use-sessions";
import { blockedCodeFor } from "@/lib/blocked/blocked-copy";
import {
  ACTIVE_GROUP_LABEL,
  ACTIVE_GROUP_ORDER,
  groupActiveSessions,
} from "@/lib/session/group-active";

/**
 * `/dashboard` — 홈 (06_ui_plan.md 4.3절).
 *
 * 오류가 나도 **"새 면접 시작" 버튼은 남깁니다** — 대시보드가 죽어도 진입은 살아 있어야 합니다.
 */
export default function DashboardPage() {
  const dashboard = useDashboard();
  // **`useCapacity`가 실패해도 화면을 오류로 덮지 않습니다** — 부차 정보입니다(3.1절).
  const capacity = useCapacity();

  const blocked = capacity.data?.canStartSession === false;
  const groups = groupActiveSessions(dashboard.data?.activeSessions ?? []);
  const hasActive = ACTIVE_GROUP_ORDER.some((key) => groups[key].length > 0);

  return (
    <main id="main" className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">홈</h1>
          {dashboard.data && dashboard.data.unreadReportCount > 0 ? (
            <Badge>새 리포트 {dashboard.data.unreadReportCount}개</Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {blocked ? (
            <Button size="lg" disabled>
              새 면접 시작
            </Button>
          ) : (
            <Button asChild size="lg">
              <Link href="/sessions/new">
                <Plus aria-hidden />
                새 면접 시작
              </Link>
            </Button>
          )}
          {blocked ? <Badge variant="outline">오늘 예약 마감</Badge> : null}
        </div>

        {/* `keyStatus === 'connected'`이면 이 영역을 아예 렌더하지 않습니다. */}
        {blocked && capacity.data ? (
          <BlockedNotice
            code={blockedCodeFor("capacity_unavailable", capacity.data.keyStatus)}
            returnTo="/dashboard"
            availableAtIso={capacity.data.availableAtIso}
          />
        ) : null}
      </section>

      <Separator />

      <section className="space-y-3" aria-labelledby="active-heading">
        <h2 id="active-heading" className="text-lg font-semibold tracking-tight">
          이어서 할 일
        </h2>

        {dashboard.isPending ? (
          <LoadingCard />
        ) : dashboard.isError ? (
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        ) : !hasActive ? (
          <EmptyState
            icon={FileText}
            title="아직 진행 중인 면접이 없습니다"
            description="이력서와 채용공고를 넣고 첫 모의면접을 시작해 보세요."
            action={
              blocked ? (
                <Button size="sm" disabled>
                  새 면접 시작
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link href="/sessions/new">새 면접 시작</Link>
                </Button>
              )
            }
          />
        ) : (
          ACTIVE_GROUP_ORDER.filter((key) => groups[key].length > 0).map((key) => (
            <div key={key} className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                {ACTIVE_GROUP_LABEL[key]}
              </h3>
              {groups[key].map((session) => (
                <SessionListItem key={session.id} session={session} />
              ))}
            </div>
          ))
        )}
      </section>

      <Separator />

      <section className="space-y-3" aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="text-lg font-semibold tracking-tight">
          최근 면접
        </h2>

        {dashboard.isPending ? (
          <LoadingCard />
        ) : dashboard.isError ? null : dashboard.data.recentSessions.length === 0 ? (
          <EmptyState
            title="아직 면접 기록이 없습니다"
            description="첫 면접을 마치면 여기에 리포트가 쌓입니다."
          />
        ) : (
          <div className="space-y-2">
            {dashboard.data.recentSessions.map((session) => (
              <SessionListItem key={session.id} session={session} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
