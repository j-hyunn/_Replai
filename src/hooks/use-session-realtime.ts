"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { queryKeys } from "@/lib/api/query-keys";
import { createClient } from "@/lib/supabase/client";

/**
 * Realtime 구독 (계약 2.1절 **E1**).
 *
 * ⚠️ **페이로드를 반환하지 않습니다.** Postgres가 직접 브로드캐스트하므로 필드가
 * **snake_case**이고, 값을 렌더링하는 순간 프론트에 snake_case가 새어 들어옵니다.
 * "변경됐다"는 신호로만 쓰고 즉시 해당 GET을 재조회합니다.
 * 반환 타입에 페이로드를 넣지 않는 것이 E1을 **타입으로 강제**하는 방법입니다.
 */
export function useSessionRealtime(sessionId: string | null): { connected: boolean } {
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "interview_sessions",
          filter: `id=eq.${sessionId}`,
        },
        () => {
          // 페이로드를 읽지 않습니다. 재조회 트리거일 뿐입니다.
          void client.invalidateQueries({ queryKey: queryKeys.session(sessionId) });
          void client.invalidateQueries({ queryKey: queryKeys.evaluation(sessionId) });
        },
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
      setConnected(false);
    };
  }, [client, sessionId]);

  return { connected };
}
