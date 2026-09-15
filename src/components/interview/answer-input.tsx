"use client";

import { Mic, Send } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * 입력 영역 — **모달리티에 따라 교체되는 유일한 영역**입니다 (06_ui_plan.md 5절·6.3절).
 * 대화 로그는 두 모드에서 완전히 같은 트리로 그려집니다.
 */

/** 텍스트 모드 — 음성과 **동등한 1급 시민**입니다. */
export function AnswerInputText({
  value,
  onChange,
  onSubmit,
  disabled,
  onSwitchToVoice,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  onSwitchToVoice?: () => void;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor="answer-text" className="text-sm font-medium">
        답변
      </label>
      <Textarea
        id="answer-text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        placeholder="답변을 입력해 주세요."
        disabled={disabled}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onSubmit} disabled={disabled || value.trim().length === 0}>
          <Send aria-hidden />
          보내기
        </Button>
        {onSwitchToVoice ? (
          <Button variant="ghost" size="sm" onClick={onSwitchToVoice}>
            <Mic aria-hidden />
            음성으로 전환
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 음성 모드 입력 영역.
 *
 * ⚠️ **오디오 파이프라인(`src/lib/voice/*`)은 아직 이 저장소에 없습니다.**
 * 마이크 캡처·STT·VU 미터·침묵 카운트다운이 붙기 전까지, 이 컴포넌트는 4상태 계약의
 * **자리만 유지**하고 실제 입력은 텍스트로 받습니다 — 사용자가 답변을 못 하는 화면을
 * 만들지 않기 위해서입니다. [답변 완료] 버튼(D14)의 위치와 Tab 순서는 그대로 두었습니다.
 */
export function AnswerInputVoice({
  onSwitchToText,
  onSubmitTranscript,
  disabled,
}: {
  onSwitchToText: () => void;
  onSubmitTranscript: (text: string) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        마이크 입력은 아직 준비 중입니다. 그동안에는 아래에 답변을 입력해 주세요. 평가 결과는
        음성과 동일합니다.
      </p>
      <Textarea
        id="answer-voice-fallback"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={4}
        aria-label="답변"
        disabled={disabled}
      />
      <div className="flex flex-wrap items-center gap-2">
        {/* [답변 완료]는 `listening` 중 **항상 활성**이며 Tab 순서 첫 번째입니다(D14, U3). */}
        <Button
          disabled={disabled || draft.trim().length === 0}
          onClick={() => {
            onSubmitTranscript(draft);
            setDraft("");
          }}
        >
          답변 완료
        </Button>
        <Button variant="ghost" size="sm" onClick={onSwitchToText}>
          텍스트로 전환
        </Button>
      </div>
    </div>
  );
}
