"use client";

import { use } from "react";

export default function Page({ params }: PageProps<"/sessions/[sessionId]/ready">) {
  const { sessionId } = use(params);

  return (
    <main id="main" className="mx-auto w-full max-w-3xl space-y-2 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">면접 시작 준비</h1>
      <p className="text-sm text-muted-foreground">마이크를 확인하고 면접을 시작합니다. (구현 예정)</p>
      <p className="text-xs text-muted-foreground">sessionId: {sessionId}</p>
    </main>
  );
}
