import { notFound } from "next/navigation";

import { DemoEntry } from "@/components/demo/demo-entry";
import { publicEnv } from "@/lib/env.public";

/**
 * `/demo` — 데모 입장 (06_ui_plan.md 4.15절 · `01_product_spec.md` 6.6절 · D35).
 *
 * **`(app)`·`(auth)` 그룹 밖에 둡니다.** `(app)`은 AppShell과 인증 가드 아래이고, 이 화면은
 * **미인증 진입이 정상**입니다. 라우트 그룹은 URL에 나타나지 않으므로 경로는 `/demo`입니다.
 *
 * 플래그가 꺼져 있으면 **404입니다 — 403이 아닙니다.** 403은 "여기 있지만 당신은 안 된다"이고,
 * 꺼진 기능은 **없는 것**이어야 합니다(D35-1). 서버 라우트(`assertDemoEnabled()`)와 같은 판정을
 * 화면에서도 하므로, 플래그가 꺼진 배포에서 주소를 직접 쳐도 빈 화면이 아니라 404를 봅니다.
 */
export default function DemoPage() {
  if (!publicEnv.demoEnabled) notFound();

  return <DemoEntry />;
}
