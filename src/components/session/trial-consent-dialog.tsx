"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TRIAL_CONSENT_TEXT } from "@/lib/consent/trial-consent";
import { apiKeyHref } from "@/lib/ui/format";

/**
 * 체험 데이터 처리 동의 다이얼로그 (06_ui_plan.md 4.13절, D29).
 *
 * **문구 원본은 `src/lib/consent/trial-consent.ts` 한 곳**이며 이 컴포넌트가 그 상수를
 * import 합니다 — 두 번째 사본을 만들면 화면과 `consent_text_sha256`이 갈라집니다.
 *
 * 동의 거부는 막다른 길이 아닙니다. 세션은 `configuring`에 남고 설정이 보존되므로,
 * 키를 연결하고 돌아오면 같은 화면에서 이어서 준비합니다(계약 4.9.2절).
 */
export function TrialConsentDialog({
  open,
  onOpenChange,
  onAgree,
  pending = false,
  /** 키 연결 후 돌아올 내부 경로. **경로 외의 어떤 값도 싣지 않습니다.** */
  returnTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAgree: () => void;
  pending?: boolean;
  returnTo: string;
}) {
  const [heading, ...body] = TRIAL_CONSENT_TEXT.split("\n\n");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            아래 내용을 확인하신 뒤 진행해 주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-foreground">
          {body.map((paragraph) => (
            <p key={paragraph} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>

        <DialogFooter>
          <Button asChild variant="outline" disabled={pending}>
            <Link href={apiKeyHref(returnTo)}>내 키를 연결할게요</Link>
          </Button>
          <Button onClick={onAgree} disabled={pending}>
            동의하고 시작하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
