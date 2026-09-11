"use client";

import { use } from "react";

export default function Page({ params }: PageProps<"/sessions/[sessionId]/transcript">) {
  const { sessionId } = use(params);

  return (
    <main id="main" className="mx-auto w-full max-w-3xl space-y-2 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">대화 전문</h1>
      <p className="text-sm text-muted-foreground">면접에서 오간 대화를 전부 봅니다. (구현 예정)</p>
      <p className="text-xs text-muted-foreground">sessionId: {sessionId}</p>
    </main>
  );
}
