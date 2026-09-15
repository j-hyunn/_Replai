import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

/**
 * `(app)` 라우트 그룹 레이아웃 (06_ui_plan.md 1절).
 * 라우트 그룹 `(app)`은 **URL에 나타나지 않습니다** — `/dashboard`, `/sessions` …
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
