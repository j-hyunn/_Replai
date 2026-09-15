"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { safeNextPath } from "@/lib/auth/next-path";
import { signInWithGoogle } from "@/lib/auth/sign-in";

/**
 * 로그인 카드 (06_ui_plan.md 4.2절 · D35-4).
 *
 * ## 3단 위계 — 이 순서를 바꾸지 마세요
 *
 * ```
 * ┌ Card ─────────────────────────────────────┐
 * │  ① [ Google로 계속하기 ]  ← 기본 Button, w-full │
 * │     ────────── 또는 ──────────  (Separator)   │
 * │  ② 이메일 로그인 섹션                          │
 * └───────────────────────────────────────────┘
 *    ③ 로그인 없이 데모 체험하기  ← Card 바깥, ghost
 * ```
 *
 * **③을 ①과 나란히 두지 않습니다.** 두 버튼이 같은 무게로 보이면 가입하려던 사용자가 데모로
 * 샙니다 — 데모의 목적은 가입 전 확신을 주는 것이지 가입을 대체하는 것이 아닙니다.
 * 그리고 `demoEnabled`가 거짓이면 ③은 **`disabled`가 아니라 렌더되지 않습니다** — 누를 수 없는
 * 버튼은 고장으로 읽힙니다.
 *
 * ## `?next=`와 `?error=`
 *
 * - `next`는 **`safeNextPath()`** 로 검증합니다. 이 함수가 `/settings/api-key` 복귀와
 *   `/auth/callback`이 쓰는 것과 **같은 사본**입니다 — 두 벌로 만들면 오픈 리다이렉트가 남습니다.
 * - `/auth/callback`은 실패 시 `/login?error=oauth_failed`로 돌아옵니다. 프로바이더 원문을
 *   노출하지 않고 고정 문안을 띄웁니다.
 */
export function LoginCard({ demoEnabled }: { demoEnabled: boolean }) {
  const searchParams = useSearchParams();
  const oauthFailed = searchParams.get("error") === "oauth_failed";
  // 검증은 여기서 한 번, `/auth/callback`에서 다시 한 번 — 같은 함수입니다.
  const next = safeNextPath(searchParams.get("next"));

  const [pending, setPending] = useState(false);
  const [startFailed, setStartFailed] = useState<string | null>(null);

  async function startGoogle() {
    setPending(true);
    setStartFailed(null);
    // 성공하면 브라우저가 Google로 떠나므로 이 아래로 돌아오지 않습니다.
    const failure = await signInWithGoogle(next);
    if (failure) {
      setStartFailed(failure.error);
      setPending(false);
    }
  }

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">로그인</h1>
        <p className="text-sm text-muted-foreground">
          계정을 만들면 내 이력서로 면접을 보고 리포트를 보관할 수 있습니다.
        </p>
      </div>

      {oauthFailed ? (
        <Alert variant="destructive">
          <AlertTitle>Google 로그인을 완료하지 못했어요</AlertTitle>
          <AlertDescription>다시 시도해 주세요.</AlertDescription>
        </Alert>
      ) : null}

      {startFailed ? (
        <Alert variant="destructive">
          <AlertDescription>{startFailed}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">계속하기</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ① 가장 눈에 띄는 자리. 자격 증명은 외부에서 설정되며 이 코드에 등장하지 않습니다. */}
          <Button
            className="w-full"
            disabled={pending}
            onClick={() => {
              void startGoogle();
            }}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Google로 계속하기
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">또는</span>
            <Separator className="flex-1" />
          </div>

          {/*
            ② 이메일 로그인 — **이번 범위 밖입니다.** D35는 Google 로그인과 데모만 올렸고,
            이메일 폼(D8 문구·D23 재설정 링크 포함)은 아직 구현되지 않았습니다. 폼처럼 보이는
            껍데기를 만들면 눌리지 않는 입력란이 생기므로 문구만 둡니다.
          */}
          <div className="space-y-1 rounded-md border border-dashed border-border p-4">
            <p className="text-sm font-medium">이메일로 로그인</p>
            <p className="text-sm text-muted-foreground">
              이메일과 비밀번호로 로그인합니다. (구현 예정)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ③ 카드 **바깥**. 플래그가 꺼져 있으면 렌더하지 않습니다(D35-1). */}
      {demoEnabled ? (
        <div className="space-y-1 text-center">
          <Button asChild variant="ghost">
            <Link href="/demo">로그인 없이 데모 체험하기</Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            미리 준비된 이력서로 진짜 AI 면접관을 만나봅니다 (약 10분)
          </p>
        </div>
      ) : null}
    </>
  );
}
