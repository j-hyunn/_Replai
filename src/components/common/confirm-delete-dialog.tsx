"use client";

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
import { Separator } from "@/components/ui/separator";

/**
 * **삭제 전용** 확인 다이얼로그 — 삭제 3종(세션·문서·계정)의 공통 껍데기
 * (06_ui_plan.md 10절).
 *
 * "잃는 것 / 남는 것"을 props로 받습니다. **"되돌릴 수 없습니다"를 명시**하고
 * 확인 버튼에 파괴적 스타일을 씁니다 — 취소(#33)와 다른 동작입니다.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  pending = false,
  title,
  lost,
  kept,
  confirmLabel = "삭제",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
  title: string;
  /** 이 동작으로 **사라지는 것**. */
  lost: string[];
  /** 이 동작에도 **남는 것**. 비어 있으면 영역을 렌더하지 않습니다. */
  kept?: string[];
  confirmLabel?: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            이 동작은 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium text-foreground">사라지는 것</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              {lost.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          {kept && kept.length > 0 ? (
            <>
              <Separator />
              <div>
                <p className="font-medium text-foreground">그대로 남는 것</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {kept.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>돌아가기</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={pending}
            className="bg-destructive/10 text-destructive hover:bg-destructive/20"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
