"use client";

import { AudioLines, Ear, Loader2, PencilLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { LiveRegion } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/**
 * 음성 4상태 UI — **문자 단위 계약**입니다 (06_ui_plan.md 6.1절, U1).
 *
 * ```
 * listening | transcribing | thinking | speaking
 * ```
 *
 * 번역·축약·변형 금지. 값은 영어 그대로 두고 **표시 문구만** 한국어입니다.
 *
 * 보조 4상태(`idle` `requesting_permission` `error` `text_fallback`)는 **다른 필드**인
 * `overlay`에 둡니다 — 한 필드에 넣으면 배타가 강제되어, `thinking`을 보여주면서 동시에
 * 오류 배너를 띄우는 정상적인 조합이 표현 불가능해집니다.
 */

export type VoiceState = "listening" | "transcribing" | "thinking" | "speaking";

export type InterviewOverlay = {
  kind: "idle" | "requesting_permission" | "error" | "text_fallback";
  messageKo: string;
} | null;

const STATE_META: Record<
  VoiceState,
  { label: string; icon: LucideIcon; className: string }
> = {
  listening: {
    label: "듣는 중",
    icon: Ear,
    className: "bg-state-listening text-state-listening-foreground",
  },
  transcribing: {
    label: "받아쓰는 중",
    icon: PencilLine,
    className: "bg-state-transcribing text-state-transcribing-foreground",
  },
  thinking: {
    label: "면접관이 생각 중",
    icon: Loader2,
    className: "bg-state-thinking text-state-thinking-foreground",
  },
  speaking: {
    label: "말하는 중",
    icon: AudioLines,
    className: "bg-state-speaking text-state-speaking-foreground",
  },
};

export function VoiceStatePanel({
  state,
  overlay,
  /** `thinking`이 길어질 때의 보조 문구. 3초 → 8초 단계는 호출부가 정합니다. */
  hint,
}: {
  state: VoiceState;
  overlay: InterviewOverlay;
  hint?: string | null;
}) {
  const meta = STATE_META[state];
  const Icon = meta.icon;

  return (
    <div className="space-y-2">
      {/* **색·애니메이션만으로 상태를 표현하지 않습니다** — 항상 한국어 텍스트가 함께 있습니다(U6). */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
          meta.className,
        )}
      >
        <Icon
          className={cn("size-4", state === "thinking" && "animate-spin")}
          aria-hidden
        />
        <span>{meta.label}</span>
        {hint ? <span className="text-sm font-normal opacity-80">{hint}</span> : null}
      </div>

      {/* 상태 전환은 스크린리더에도 알립니다. */}
      <LiveRegion message={`${meta.label}${hint ? `. ${hint}` : ""}`} />

      {overlay ? (
        <Alert variant={overlay.kind === "error" ? "destructive" : "default"}>
          <AlertTitle>
            {overlay.kind === "requesting_permission"
              ? "마이크 권한을 확인하고 있습니다"
              : overlay.kind === "text_fallback"
                ? "텍스트로 진행합니다"
                : overlay.kind === "error"
                  ? "문제가 생겼습니다"
                  : "대기 중"}
          </AlertTitle>
          <AlertDescription>{overlay.messageKo}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
