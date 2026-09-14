"use client";

import { Badge } from "@/components/ui/badge";
import type { SessionStatus } from "@/lib/api/types";
import { SESSION_STATUS_LABEL } from "@/lib/session/labels";

/**
 * `status` → 한국어 라벨의 **유일한 사본** (06_ui_plan.md 5절 재사용 원칙 2).
 * 화면마다 매핑을 다시 쓰면 같은 상태가 화면마다 다르게 불립니다.
 *
 * **색만으로 상태를 구분하지 않습니다** — 언제나 한국어 텍스트 레이블이 함께 있습니다(U6).
 */

const VARIANT: Record<SessionStatus, "default" | "secondary" | "outline" | "destructive"> = {
  created: "outline",
  configuring: "outline",
  ready: "secondary",
  in_progress: "default",
  paused: "secondary",
  completed: "secondary",
  evaluating: "secondary",
  evaluated: "default",
  failed: "destructive",
  abandoned: "outline",
  canceled: "outline",
};

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return <Badge variant={VARIANT[status]}>{SESSION_STATUS_LABEL[status]}</Badge>;
}
