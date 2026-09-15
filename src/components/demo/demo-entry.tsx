"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ErrorState, LoadingCard } from "@/components/common/states";
import {
  JobRoleRadioGroup,
  ModalityRadioGroup,
} from "@/components/session/config-pickers";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useDemoCapacity, useStartDemo } from "@/hooks/use-demo";
import { detailString, isApiClientError } from "@/lib/api/fetch-json";
import type { JobRole, Modality } from "@/lib/api/types";
import { DEMO_CONSENT_TEXT } from "@/lib/consent/trial-consent";

/**
 * 데모 입장 화면 (06_ui_plan.md 4.15절 · `01_product_spec.md` 6.6절 · D35).
 *
 * ## 한 화면에서 끝냅니다
 *
 * 단계가 늘어나면 가입 전 방문자는 이탈합니다. `/sessions/new`(설정 화면)를 재사용하지 않는
 * 이유가 이것입니다 — 그 화면은 업로드·보관함·문서 편집을 전제로 만들어져 있고 데모에는
 * 그 중 어느 것도 없습니다. 방문자가 고르는 것은 **직군과 대화 방식뿐**이며 면접관 유형은
 * `deep_pressure` 고정입니다(서버가 정합니다 — 화면은 보내지 않습니다).
 *
 * ## 동의는 다이얼로그가 아니라 체크박스입니다
 *
 * 화면이 하나뿐이라 모달을 띄우면 한 화면에서 모달이 두 번 뜹니다(D29의 체험 동의와 다른 점).
 * 문구는 `src/lib/consent/trial-consent.ts`의 **단일 상수**를 그립니다 — 사본을 만들면 서버가
 * 기록하는 `consent_text_sha256`과 화면이 갈라집니다. **접기 없이 전부 보입니다.**
 *
 * ## 시작 버튼 한 번에 일어나는 일
 *
 * ```
 * signInAnonymouslyForDemo()  → POST /api/demo/sessions → /sessions/{session.id}/ready
 * ```
 *
 * 응답 봉투는 **한 겹**이고 이동할 id는 **`session.id`** 입니다. 상태는 항상 `ready`이므로
 * `routeForStatus()`에 넘기지 않고 곧장 `ready` 화면으로 `replace` 합니다 — 넘기면 데모
 * 방문자가 쓰지 않는 `/sessions/new`로 떨어질 여지가 생깁니다.
 *
 * ## 여력이 없을 때 키 연결 CTA를 두지 않습니다
 *
 * 4.14.1절(체험 여력 부족)과 다른 점입니다. 익명 사용자는 `/settings/api-key`에 들어갈 수
 * 없으므로(프록시가 `/login`으로 튕깁니다) 출구는 **가입** 하나뿐입니다. 금칙어 규칙(4.14.4절)도
 * 그대로 적용됩니다 — "데모 정원"·"하루 10회" 같은 표현을 쓰지 않습니다.
 */
export function DemoEntry() {
  const router = useRouter();
  const capacity = useDemoCapacity();
  const startDemo = useStartDemo();

  const [jobRole, setJobRole] = useState<JobRole | null>(null);
  const [modality, setModality] = useState<Modality>("voice");
  const [agreed, setAgreed] = useState(false);
  const consentRef = useRef<HTMLElement | null>(null);

  const [heading, ...consentBody] = DEMO_CONSENT_TEXT.split("\n\n");
  // 마지막 문단이 체크박스 라벨이고, 그 앞이 본문입니다.
  const agreeLabel = consentBody[consentBody.length - 1];
  const paragraphs = consentBody.slice(0, -1);

  const pending = startDemo.isPending;

  if (capacity.isPending) {
    return (
      <main id="main" className="mx-auto w-full max-w-2xl space-y-4 px-4 py-10">
        <LoadingCard lines={6} />
      </main>
    );
  }

  // 조회 자체가 실패한 경우입니다 — 여력 소진과 구분해 재시도를 줍니다.
  if (capacity.isError) {
    return (
      <main id="main" className="mx-auto w-full max-w-2xl space-y-4 px-4 py-10">
        <ErrorState error={capacity.error} onRetry={() => void capacity.refetch()} />
      </main>
    );
  }

  const demo = capacity.data;

  return (
    <main id="main" className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          로그인 없이 면접을 체험해 보세요
        </h1>
        <p className="text-sm text-muted-foreground">
          미리 준비된 이력서로 짧은 면접을 진행하고 리포트까지 받아 보실 수 있습니다. 진짜 AI
          면접관이 이력서를 읽고 꼬리질문을 던집니다.
        </p>
      </div>

      {/* 24시간 1회 제한에 이미 걸린 브라우저 — 리포트로 보냅니다(폴백 없음). */}
      {demo.demoStatus === "consumed" ? (
        <AlreadyConsumed existingSessionId={demo.existingSessionId} />
      ) : null}

      {/* 정원 소진. **키 연결 출구가 없습니다** — 익명 사용자는 키를 연결할 수 없습니다. */}
      {demo.demoStatus === "available" && !demo.canStartDemo ? (
        <CapacityUnavailable />
      ) : null}

      <StartError
        error={startDemo.error}
        onFocusConsent={() => {
          consentRef.current?.scrollIntoView({ block: "center" });
          consentRef.current?.querySelector("button")?.focus();
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">어떤 면접을 볼까요?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-sm font-medium">직군</h2>
            <JobRoleRadioGroup
              value={jobRole}
              onChange={setJobRole}
              disabled={pending}
            />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium">대화 방식</h2>
            <ModalityRadioGroup
              value={modality}
              onChange={setModality}
              disabled={pending}
            />
          </section>

          <Separator />

          {/* 동의 — 접기 없이 전부 보입니다. */}
          <section ref={consentRef} className="space-y-3">
            <h2 className="text-sm font-medium">{heading}</h2>
            {paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-sm whitespace-pre-line text-muted-foreground">
                {paragraph}
              </p>
            ))}
            <Label
              htmlFor="demo-consent"
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm"
            >
              <Checkbox
                id="demo-consent"
                checked={agreed}
                disabled={pending}
                onCheckedChange={(checked) => setAgreed(checked === true)}
              />
              <span>{agreeLabel}</span>
            </Label>
          </section>

          <div className="space-y-2">
            <Button
              size="lg"
              className="w-full"
              disabled={!demo.canStartDemo || !jobRole || !agreed || pending}
              onClick={() => {
                if (!jobRole) return;
                startDemo.mutate(
                  { jobRole, modality, consentVersion: demo.consentVersion },
                  {
                    // 상태는 항상 `ready`입니다 — 이동할 id는 `session.id` 하나뿐입니다.
                    onSuccess: (session) =>
                      router.replace(`/sessions/${session.id}/ready`),
                  },
                );
              }}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {pending ? "면접을 준비하고 있어요" : "면접 시작하기"}
            </Button>

            {/* 비활성 이유를 버튼 아래 한 줄로 설명합니다 — 이유 없는 비활성은 고장으로 읽힙니다. */}
            <p className="text-center text-sm text-muted-foreground" role="status">
              {pending
                ? "면접관이 이력서를 읽고 첫 질문을 만들고 있습니다. 20초쯤 걸립니다."
                : disabledReason(demo.canStartDemo, jobRole, agreed)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="text-center">
        <Button asChild variant="ghost">
          <Link href="/login">계정 만들고 내 이력서로 하기</Link>
        </Button>
      </div>
    </main>
  );
}

function disabledReason(
  canStartDemo: boolean,
  jobRole: JobRole | null,
  agreed: boolean,
): string {
  if (!canStartDemo) return "지금은 데모를 시작할 수 없습니다.";
  if (!jobRole) return "직군을 하나 골라 주세요.";
  if (!agreed) return "위 안내를 확인하고 동의해 주시면 시작할 수 있습니다.";
  return "약 12분, 주질문 2개로 진행됩니다. 기록은 24시간 뒤 삭제됩니다.";
}

/**
 * 오류는 **`error.code`로 직접 분기**합니다(4.4절과 같은 규칙 — 소거법 금지).
 * `demo_already_consumed`의 목적지는 `details.existingSessionId` **하나뿐**이며,
 * 없으면 링크를 걸지 않습니다 — 폴백으로 아무 세션이나 고르지 않습니다(D30에서 배운 것).
 */
function StartError({
  error,
  onFocusConsent,
}: {
  error: unknown;
  onFocusConsent: () => void;
}) {
  if (!error) return null;

  if (!isApiClientError(error)) {
    // 익명 로그인 단계의 실패입니다 — 서버 오류 봉투가 아닙니다.
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error instanceof Error ? error.message : "요청을 처리하지 못했습니다."}
        </AlertDescription>
      </Alert>
    );
  }

  if (error.code === "capacity_unavailable") return <CapacityUnavailable />;

  if (error.code === "demo_already_consumed") {
    return <AlreadyConsumed existingSessionId={detailString(error, "existingSessionId")} />;
  }

  if (error.code === "trial_consent_required" || error.code === "consent_version_stale") {
    return (
      <Alert>
        <AlertTitle>동의가 필요합니다</AlertTitle>
        <AlertDescription>
          <p>아래 안내를 확인하고 동의 항목에 체크해 주세요.</p>
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={onFocusConsent}>
              동의 항목으로 이동
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return <ErrorState error={error} />;
}

/** 정원 소진 — 1순위 버튼은 **[계정 만들기]** 입니다. 키 연결 CTA를 두지 않습니다. */
function CapacityUnavailable() {
  return (
    <Alert>
      <AlertTitle>지금은 데모 자리가 모두 찼어요</AlertTitle>
      <AlertDescription>
        <p>잠시 뒤 다시 시도하거나, 계정을 만들면 바로 시작할 수 있어요.</p>
        <div className="mt-3">
          <Button asChild size="sm">
            <Link href="/login">계정 만들기</Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

/** 24시간 1회 제한. 기존 리포트로 보내고, 없으면 가입으로만 안내합니다. */
function AlreadyConsumed({ existingSessionId }: { existingSessionId: string | null }) {
  return (
    <Alert>
      <AlertTitle>이미 데모를 체험하셨어요</AlertTitle>
      <AlertDescription>
        <p>
          24시간 뒤에 다시 시도하거나, 계정을 만들고 내 이력서로 진짜 면접을 시작해 보세요.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {existingSessionId ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/sessions/${existingSessionId}/report`}>
                받은 리포트 다시 보기
              </Link>
            </Button>
          ) : null}
          <Button asChild size="sm">
            <Link href="/login">계정 만들기</Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
