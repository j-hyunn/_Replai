"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { JobRole, Modality, Persona } from "@/lib/api/types";
import { JOB_ROLES, MODALITIES, PERSONAS, PERSONA_BUDGET } from "@/lib/session/persona";
import {
  JOB_ROLE_LABEL,
  MODALITY_DESCRIPTION,
  MODALITY_LABEL,
  PERSONA_DESCRIPTION,
  PERSONA_LABEL,
} from "@/lib/session/labels";
import { cn } from "@/lib/utils";

/**
 * 세션 설정 섹션의 선택 컴포넌트 (06_ui_plan.md 4.4절).
 *
 * 페르소나 카드의 숫자는 `PERSONA_BUDGET`(= `01_state_machine.md` 3절)에서 읽습니다.
 * 세션 행의 `mainQuestionBudget`은 `ready` 이후에나 확정되므로 설정 화면에서는 쓸 수 없고,
 * **이 상수가 상태 머신과 어긋나면 사용자에게 거짓말이 되므로 QA 대조 항목입니다.**
 */

export function JobRoleRadioGroup({
  value,
  onChange,
  disabled,
}: {
  value: JobRole | null;
  onChange: (value: JobRole) => void;
  disabled?: boolean;
}) {
  return (
    <RadioGroup
      value={value ?? ""}
      onValueChange={(next) => onChange(next as JobRole)}
      disabled={disabled}
      className="grid gap-2 sm:grid-cols-2"
      aria-label="직군"
    >
      {JOB_ROLES.map((role) => (
        <Label
          key={role}
          htmlFor={`job-role-${role}`}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm",
            value === role && "border-primary bg-muted",
          )}
        >
          <RadioGroupItem id={`job-role-${role}`} value={role} />
          {JOB_ROLE_LABEL[role]}
        </Label>
      ))}
    </RadioGroup>
  );
}

export function PersonaPicker({
  value,
  onChange,
  disabled,
}: {
  value: Persona | null;
  onChange: (value: Persona) => void;
  disabled?: boolean;
}) {
  return (
    <RadioGroup
      value={value ?? ""}
      onValueChange={(next) => onChange(next as Persona)}
      disabled={disabled}
      className="grid gap-2 sm:grid-cols-2"
      aria-label="면접관 유형"
    >
      {PERSONAS.map((persona) => {
        const budget = PERSONA_BUDGET[persona];
        return (
          <Card
            key={persona}
            className={cn(value === persona && "border-primary bg-muted")}
          >
            <CardContent className="space-y-2 py-4">
              <Label
                htmlFor={`persona-${persona}`}
                className="flex cursor-pointer items-center gap-2 text-sm font-medium"
              >
                <RadioGroupItem id={`persona-${persona}`} value={persona} />
                {PERSONA_LABEL[persona]}
              </Label>
              <p className="text-sm text-muted-foreground">
                {PERSONA_DESCRIPTION[persona]}
              </p>
              <p className="text-xs text-muted-foreground">
                주질문 {budget.mainQuestionBudget}개 · 꼬리질문 최대{" "}
                {budget.maxFollowUpDepth}단계
              </p>
            </CardContent>
          </Card>
        );
      })}
    </RadioGroup>
  );
}

/**
 * 텍스트 모드는 **처음부터 선택 가능**해야 합니다
 * (`03_voice_pipeline.md` 10.4절 "시작 경로 동등").
 * 음성을 실패해야만 도달하는 경로로 만들지 않습니다.
 */
export function ModalityRadioGroup({
  value,
  onChange,
  disabled,
}: {
  value: Modality | null;
  onChange: (value: Modality) => void;
  disabled?: boolean;
}) {
  return (
    <RadioGroup
      value={value ?? ""}
      onValueChange={(next) => onChange(next as Modality)}
      disabled={disabled}
      className="grid gap-2 sm:grid-cols-2"
      aria-label="대화 방식"
    >
      {MODALITIES.map((modality) => (
        <Label
          key={modality}
          htmlFor={`modality-${modality}`}
          className={cn(
            "flex cursor-pointer flex-col gap-1 rounded-lg border border-border p-3 text-sm",
            value === modality && "border-primary bg-muted",
          )}
        >
          <span className="flex items-center gap-2 font-medium">
            <RadioGroupItem id={`modality-${modality}`} value={modality} />
            {MODALITY_LABEL[modality]}
          </span>
          <span className="text-muted-foreground">
            {MODALITY_DESCRIPTION[modality]}
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}
