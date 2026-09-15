"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { ConfirmCancelDialog } from "@/components/common/confirm-cancel-dialog";
import { ConfirmDeleteDialog } from "@/components/common/confirm-delete-dialog";
import { EmptyState, ErrorState, LoadingCard } from "@/components/common/states";
import { SessionListItem } from "@/components/session/session-list-item";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useCancelSession,
  useDeleteSession,
} from "@/hooks/use-session-mutations";
import { useSessions } from "@/hooks/use-sessions";
import type { SessionSummary } from "@/lib/api/types";
import { isCancelable } from "@/lib/session/labels";
import { routeForStatus } from "@/lib/session/route-for-status";

/**
 * `/sessions` — 세션 이력 (06_ui_plan.md 4.9절).
 *
 * ⚠️ **"그만두기"(#33)와 "삭제"(#23)는 분리된 별개 항목입니다** (D19).
 * 취소는 행이 남고, 삭제는 대화 기록까지 사라집니다.
 */
export default function SessionsPage() {
  // `useSearchParams()`는 Suspense 경계가 필요합니다 — 없으면 프리렌더가 실패합니다.
  return (
    <Suspense
      fallback={
        <main id="main" className="mx-auto w-full max-w-3xl px-4 py-8">
          <LoadingCard lines={2} />
        </main>
      }
    >
      <SessionHistory />
    </Suspense>
  );
}

function SessionHistory() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 딥링크(`?includeCanceled=true`)가 토글의 초기값이 됩니다 — `route-for-status`가
  // 취소된 세션을 이 URL로 보내므로, 무시하면 자기 자신이 보이지 않는 목록이 됩니다.
  const [includeCanceled, setIncludeCanceled] = useState(
    searchParams.get("includeCanceled") === "true",
  );

  // 토글을 바꾸면 커서가 무효가 되므로 쿼리 키가 바뀌며 처음부터 다시 조회됩니다(계약 4.3절).
  const sessions = useSessions({ includeCanceled });

  return (
    <main id="main" className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">면접 이력</h1>
        <div className="flex items-center gap-2">
          <Switch
            id="include-canceled"
            checked={includeCanceled}
            onCheckedChange={(checked) => {
              setIncludeCanceled(checked);
              router.replace(checked ? "/sessions?includeCanceled=true" : "/sessions");
            }}
          />
          <Label htmlFor="include-canceled">그만둔 면접 보기</Label>
        </div>
      </div>

      {sessions.isPending ? (
        <div className="space-y-2">
          <LoadingCard lines={2} />
          <LoadingCard lines={2} />
        </div>
      ) : sessions.isError ? (
        <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
      ) : sessions.data.sessions.length === 0 ? (
        <EmptyState
          title="아직 면접 기록이 없습니다"
          description="이력서와 채용공고를 넣고 첫 모의면접을 시작해 보세요."
          action={
            <Button asChild size="sm">
              <Link href="/sessions/new">새 면접 시작</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {sessions.data.sessions.map((session) => (
            <SessionListItem
              key={session.id}
              session={session}
              action={<SessionRowMenu session={session} />}
            />
          ))}
        </div>
      )}
    </main>
  );
}

/** 행 메뉴는 3개 항목입니다 — 열기 / 이 면접 그만두기 / 이 면접 삭제. */
function SessionRowMenu({ session }: { session: SessionSummary }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const cancelSession = useCancelSession();
  const deleteSession = useDeleteSession();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="이 면접의 작업 메뉴">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={routeForStatus(session.status, session.id)}>열기</Link>
          </DropdownMenuItem>
          {/* 취소를 부를 수 있는 출발 상태 7개일 때만 노출합니다 — 409를 UI로 받는 것보다 정확합니다. */}
          {isCancelable(session.status) ? (
            <DropdownMenuItem onSelect={() => setCancelOpen(true)}>
              이 면접 그만두기
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            이 면접 삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        pending={cancelSession.isPending}
        onConfirm={() => {
          cancelSession.mutate(session.id, {
            onSuccess: () => {
              setCancelOpen(false);
              toast.success("이 면접을 그만둔 것으로 처리했습니다. 기록은 그대로 남아 있습니다.");
            },
            onError: (error) => toast.error(error.message),
          });
        }}
      />

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        pending={deleteSession.isPending}
        title="이 면접을 삭제할까요?"
        lost={["대화 전문과 질문 기록", "평가 리포트와 점수"]}
        kept={["이력서·채용공고 문서 (보관함에 그대로 남습니다)"]}
        confirmLabel="이 면접 삭제"
        onConfirm={() => {
          deleteSession.mutate(session.id, {
            onSuccess: () => {
              setDeleteOpen(false);
              toast.success("면접을 삭제했습니다.");
            },
            onError: (error) => toast.error(error.message),
          });
        }}
      />
    </>
  );
}
