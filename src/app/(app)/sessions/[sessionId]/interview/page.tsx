"use client";

import { use } from "react";

export default function Page({ params }: PageProps<"/sessions/[sessionId]/interview">) {
  const { sessionId } = use(params);

  return (
    <main id="main" className="mx-auto w-full max-w-3xl space-y-2 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">면접 진행</h1>
      <p className="text-sm text-muted-foreground">음성 또는 텍스트로 면접을 진행합니다. (구현 예정)</p>
      <p className="text-xs text-muted-foreground">sessionId: {sessionId}</p>
    </main>
  );
}
