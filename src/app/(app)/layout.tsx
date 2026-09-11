import type { ReactNode } from "react";

/**
 * AppShell — 헤더·네비게이션·미열람 배지가 들어갈 자리.
 * 06_ui_plan.md 1절의 `(app)` 라우트 그룹 레이아웃. (구현 예정)
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-col">{children}</div>;
}
