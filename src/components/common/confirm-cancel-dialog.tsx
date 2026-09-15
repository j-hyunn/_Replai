"use client";

import type { ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * **취소(#33) 전용** 확인 다이얼로그 (06_ui_plan.md 10.1절).
 *
 * ⚠️ `ConfirmDeleteDialog`와 합치지 않습니다 (D19). 한 컴포넌트로 묶고 prop으로 문구만
 * 바꾸면 `variant="destructive"`와 "되돌릴 수 없습니다"가 **취소 흐름에 새어 들어옵니다.**
 * 두 동작이 다르다는 사실을 **컴포넌트 경계로 강제**합니다.
 *
 * 취소는 파괴적 동작이 아닙니다 — **대화 기록은 남습니다.**
 */
export function ConfirmCancelDialog({
  open,
  onOpenChange,
  onConfirm,
  pending = false,
  title = "이 면접을 그만둘까요?",
  description = "지금까지의 대화 기록은 그대로 남습니다. 이어서 진행하지 않는 것으로 처리하며, 면접 이력에서 다시 볼 수 있습니다.",
  confirmLabel = "이 면접 그만두기",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  children?: ReactNode;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>돌아가기</AlertDialogCancel>
          {/* 파괴적 스타일을 쓰지 않습니다 — 기록이 사라지는 동작이 아닙니다. */}
          <AlertDialogAction onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
