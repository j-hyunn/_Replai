"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiClientError } from "@/lib/api/fetch-json";
import type {
  AnswerCommit,
  SessionNotice,
  StreamError,
  UtteranceChunk,
  UtteranceDone,
} from "@/lib/api/types";

/**
 * #9 면접관 스트리밍 훅 (06_ui_plan.md 3.3절 · 계약 5절).
 *
 * 어긋나면 안 되는 것:
 * 1. `fetch()` + `ReadableStream` 수동 파싱. **`EventSource`를 쓰지 않습니다**(POST 본문을 못 보냅니다).
 * 2. **`res.json()`을 절대 호출하지 않습니다.**
 * 3. `stream_error`가 오면 `utterance_done`은 **오지 않습니다.** `done`을 기다리며 매달리면 안 됩니다.
 * 4. 스트림이 끊기면 재요청이 아니라 `useTurnsResync`(#10)로 재동기화합니다.
 * 5. `409 turn_seq_conflict`는 `details.currentSeq`로 재동기화하고 **LLM을 다시 부르지 않습니다.**
 * 6. `byok_*` 2종은 `retryable: false`이고 서버가 이미 세션을 `paused`로 옮겼습니다 —
 *    재시도하지 말고 재개 패널로 넘깁니다.
 */

export type InterviewStreamState = {
  phase: "idle" | "streaming" | "done" | "error";
  /** 지금까지 받은 `utterance_chunk.text`의 누적. */
  text: string;
  chunks: UtteranceChunk[];
  /** 스트림당 정확히 1회. */
  done: UtteranceDone | null;
  notice: SessionNotice | null;
  error: StreamError | null;
  /** 409 `turn_seq_conflict`로 재동기화가 필요해진 경우의 서버 기준 seq. */
  conflictSeq: number | null;
};

const INITIAL: InterviewStreamState = {
  phase: "idle",
  text: "",
  chunks: [],
  done: null,
  notice: null,
  error: null,
  conflictSeq: null,
};

/** SSE 프레임 하나를 `event:`/`data:` 줄로 쪼갭니다. `:`로 시작하는 하트비트는 버립니다. */
function parseFrame(frame: string): { event: string; data: string } | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

export function useInterviewStream(sessionId: string) {
  const [state, setState] = useState<InterviewStreamState>(INITIAL);
  const controllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  // 화면을 떠날 때 프로바이더 스트림까지 끊어 쿼터를 태우지 않습니다.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const reset = useCallback(() => setState(INITIAL), []);

  const submit = useCallback(
    async (answer: AnswerCommit) => {
      abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ ...INITIAL, phase: "streaming" });

      let response: Response;
      try {
        response = await fetch(`/api/sessions/${sessionId}/turns`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(answer),
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          phase: "error",
          error: {
            code: "llm_failed",
            retryable: true,
            messageKo: "연결이 불안정합니다. 잠시 후 다시 시도해 주세요.",
          },
        }));
        return;
      }

      // 스트림이 시작되기 **전**의 실패만 JSON 오류로 옵니다(계약 5절).
      if (!response.ok || !response.body) {
        const body = await response.text();
        let code = "internal_error";
        let message = "요청을 처리하지 못했습니다.";
        let details: Record<string, unknown> | undefined;
        try {
          const parsed = JSON.parse(body) as {
            error?: { code?: string; message?: string; details?: Record<string, unknown> };
          };
          code = parsed.error?.code ?? code;
          message = parsed.error?.message ?? message;
          details = parsed.error?.details;
        } catch {
          // 본문이 JSON이 아니면 기본 문구를 씁니다.
        }

        const currentSeq =
          code === "turn_seq_conflict" && typeof details?.currentSeq === "number"
            ? details.currentSeq
            : null;

        setState((prev) => ({
          ...prev,
          phase: "error",
          conflictSeq: currentSeq,
          error: {
            code: "llm_failed",
            // 409 seq 충돌은 재시도가 아니라 재동기화의 신호입니다.
            retryable: false,
            messageKo: message,
          },
        }));
        throw new ApiClientError(response.status, code, message, details);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");

            const parsed = parseFrame(frame);
            if (!parsed) continue;

            switch (parsed.event) {
              case "utterance_chunk": {
                const chunk = JSON.parse(parsed.data) as UtteranceChunk;
                setState((prev) => ({
                  ...prev,
                  text: prev.text + chunk.text,
                  chunks: [...prev.chunks, chunk],
                }));
                break;
              }
              case "session_notice": {
                const notice = JSON.parse(parsed.data) as SessionNotice;
                setState((prev) => ({ ...prev, notice }));
                break;
              }
              case "utterance_done": {
                const payload = JSON.parse(parsed.data) as UtteranceDone;
                setState((prev) => ({ ...prev, phase: "done", done: payload }));
                break;
              }
              case "stream_error": {
                const error = JSON.parse(parsed.data) as StreamError;
                // `stream_error`로 끝나면 `utterance_done`은 오지 않습니다.
                setState((prev) => ({ ...prev, phase: "error", error }));
                break;
              }
              default:
                break;
            }
          }
        }
      } catch {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          phase: "error",
          error: {
            code: "llm_failed",
            retryable: true,
            messageKo: "연결이 끊어졌어요. 대화 내용을 다시 불러옵니다.",
          },
        }));
      } finally {
        controllerRef.current = null;
      }
    },
    [abort, sessionId],
  );

  return { state, submit, abort, reset };
}
