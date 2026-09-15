import { Suspense } from "react";

import { LoginCard } from "@/components/auth/login-card";
import { LoadingCard } from "@/components/common/states";
import { publicEnv } from "@/lib/env.public";

/**
 * `/login` — 로그인·회원가입 (06_ui_plan.md 4.2절 · D35-4).
 *
 * **서버 컴포넌트입니다.** 하는 일은 `NEXT_PUBLIC_DEMO_ENABLED`를 읽어 데모 버튼의 렌더 여부를
 * 정하는 것뿐이고, 상호작용은 전부 `LoginCard`(클라이언트)가 맡습니다.
 *
 * 플래그를 `NEXT_PUBLIC_`으로 두는 것이 맞는지 한 번 더 확인했습니다 — **키가 아니라 단순
 * on/off 불리언**이고, 노출되어도 알려지는 사실은 "이 배포에 데모가 켜져 있다"뿐입니다.
 * 그 사실은 `/demo`가 200을 돌려주는 것으로 이미 공개되어 있습니다. 데모의 실제 잠금장치는
 * 서버 쪽 `assertDemoEnabled()`와 `GEMINI_API_KEY_DEMO`(서버 전용)입니다.
 *
 * `useSearchParams()`를 쓰는 클라이언트 트리는 **`Suspense`로 감쌉니다** — 감싸지 않으면
 * 정적 생성 시 빌드가 실패합니다.
 */
export default function LoginPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-md space-y-4 px-4 py-12">
      <Suspense fallback={<LoadingCard lines={4} />}>
        <LoginCard demoEnabled={publicEnv.demoEnabled} />
      </Suspense>
    </main>
  );
}
