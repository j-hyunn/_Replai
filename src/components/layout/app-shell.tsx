"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDashboard } from "@/hooks/use-sessions";
import { cn } from "@/lib/utils";

/**
 * `(app)` 레이아웃의 껍데기 (06_ui_plan.md 5절).
 *
 * "이력" 링크의 미열람 배지는 **앱 내 배지만**입니다 — 이메일 알림 경로는 없습니다(D2).
 */

const NAV = [
  { href: "/dashboard", label: "홈" },
  { href: "/sessions", label: "면접 이력" },
  { href: "/documents", label: "문서 보관함" },
  { href: "/settings/account", label: "설정" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // 대시보드 조회가 실패해도 헤더는 그대로 보여야 합니다 — 배지만 빠집니다.
  const { data } = useDashboard();
  const unread = data?.unreadReportCount ?? 0;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
            Replai
          </Link>
          <nav aria-label="주요 메뉴" className="flex flex-wrap items-center gap-1">
            {NAV.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Button
                  key={item.href}
                  asChild
                  variant="ghost"
                  size="sm"
                  className={cn(active && "bg-muted text-foreground")}
                >
                  <Link href={item.href} aria-current={active ? "page" : undefined}>
                    {item.label}
                    {item.href === "/sessions" && unread > 0 ? (
                      <Badge variant="secondary" className="ml-1">
                        새 리포트 {unread}
                      </Badge>
                    ) : null}
                  </Link>
                </Button>
              );
            })}
          </nav>
          <div className="ml-auto">
            <Button asChild size="sm">
              <Link href="/sessions/new">새 면접 시작</Link>
            </Button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
