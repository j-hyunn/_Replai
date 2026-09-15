import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FundingSource } from "@/lib/api/types";

/**
 * 데모 표시 — 배지와 배너 (06_ui_plan.md 4.16절 · `01_product_spec.md` 6.6.3절 · D35).
 *
 * **배지 컴포넌트는 이 파일 하나이고 면접·리포트·전문 3화면이 공유합니다.** 화면마다 배지를
 * 다시 만들면 문구가 갈라지고, 24시간 삭제 안내가 한 화면에서만 빠지는 일이 생깁니다.
 *
 * ## 분기는 `fundingSource === 'demo'`로 **정확히** 씁니다
 *
 * `demo`를 `trial_shared`와 묶으면(예: "체험 세션이면 키 연결 CTA") 익명 사용자가
 * **들어갈 수 없는 화면**(`/settings/api-key`)으로 떨어집니다 — 프록시가 `/login`으로
 * 튕겨내므로 사용자에게는 "버튼이 고장났다"로만 보입니다.
 */

export function isDemoSession(fundingSource: FundingSource): boolean {
  return fundingSource === "demo";
}

/**
 * 세션을 떠난 뒤 갈 곳.
 *
 * 익명 사용자에게 `/sessions`·`/sessions/new`·`/dashboard`는 **프록시가 `/login`으로 튕겨내는
 * 경로**입니다(D35-2 접근 매트릭스). 튕김에 맡기면 사용자에게는 "버튼을 눌렀더니 엉뚱한
 * 화면"으로 보이므로, 데모 세션에서는 처음부터 `/login`으로 보냅니다.
 */
export function sessionExitHref(
  fundingSource: FundingSource,
  registeredHref: string,
): string {
  return fundingSource === "demo" ? "/login" : registeredHref;
}

/** 제목 옆에 붙는 상시 배지. 음성 전용 사용자에게도 전달되어야 하므로 `aria-label`을 답니다. */
export function DemoBadge() {
  return (
    <Badge variant="secondary" aria-label="데모 세션">
      데모
    </Badge>
  );
}

/**
 * 화면당 1회 붙는 안내 배너. **닫을 수 없습니다** — 24시간 뒤 삭제된다는 것은 사용자가
 * 놓치면 안 되는 사실입니다(D35-2).
 */
export function DemoBanner() {
  return (
    <Alert role="status">
      <AlertDescription>
        <p>
          이 면접은 미리 준비된 이력서로 진행한 데모 체험입니다. 기록은 24시간 뒤 자동으로
          삭제됩니다.
        </p>
        <p>내 이력서로 면접을 보려면 계정을 만들어 주세요.</p>
      </AlertDescription>
    </Alert>
  );
}

/**
 * 데모 리포트 하단의 전환 CTA — 체험 사용자의 키 연결 CTA와 **같은 자리, 다른 목적지**입니다
 * (4.16절). 익명 사용자에게 `/settings/api-key`를 권하지 않는 이유가 여기 있습니다.
 */
export function DemoSignUpCta() {
  return (
    <Alert role="status">
      <AlertTitle>마음에 드셨나요?</AlertTitle>
      <AlertDescription>
        <p>
          계정을 만들면 내 이력서로 면접을 보고, 리포트를 계속 보관할 수 있습니다. 이 데모
          기록은 24시간 뒤 사라집니다.
        </p>
        <div className="mt-3">
          <Button asChild size="sm">
            <Link href="/login">내 이력서로 면접 보기</Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
