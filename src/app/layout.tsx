import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Replai — AI 모의면접",
    template: "%s · Replai",
  },
  description:
    "이력서와 채용공고를 읽고 꼬리질문을 던지는 AI 면접관과 모의면접을 보고, 근거가 붙은 리포트를 받아 보세요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {/* 건너뛰기 링크 — 각 레이아웃이 id="main"을 제공한다 */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:ring-2 focus:ring-ring"
        >
          본문으로 건너뛰기
        </a>
        {children}
        {/* 06_ui_plan.md 13절 — Toaster는 루트에 하나만 둔다 */}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
