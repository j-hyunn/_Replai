/**
 * 안내 문구 3종의 **유일한 사본** (06_ui_plan.md 4.14절).
 *
 * 세 상황은 원인 주체와 복구 경로가 전부 다릅니다. **문구를 합치거나 서로 베끼지 마세요.**
 * 호출부는 문구가 아니라 **`code`**를 넘깁니다 — 문구를 prop으로 받게 만드는 순간
 * 호출부에서 아무 문장이나 들어올 수 있습니다.
 *
 * 금칙어(4.14.4절): "무료 티어" "티어" "쿼터" "레이트 리밋" "RPD" "RPM" "예약분" "토큰"
 * "버킷" "잔여" "남은 횟수". **"한도"는 4.14.3절 한 곳에서만** 허용합니다 — 그것은 우리
 * 내부 사정이 아니라 사용자 본인 계정의 사실이기 때문입니다.
 */

export type BlockedCode =
  | "capacity_unavailable"
  | "byok_key_invalid"
  | "byok_quota_exhausted";

export type BlockedAction = {
  label: string;
  /** `href`가 있으면 링크, 없으면 호출부가 `onAction`으로 처리합니다. */
  kind: "connect_key" | "replace_key" | "past_reports" | "resume" | "finish";
  variant: "default" | "outline" | "ghost";
};

export type BlockedCopy = {
  title: string;
  /** 문단 배열. 줄바꿈을 문자열에 넣지 않습니다. */
  body: string[];
  actions: BlockedAction[];
};

export const BLOCKED_COPY: Record<BlockedCode, BlockedCopy> = {
  // 4.14.1 공용 여력 소진 — 원인 주체는 **우리**. 1순위 버튼은 "키 연결하기"입니다.
  capacity_unavailable: {
    title: "지금은 새 면접을 시작할 수 없어요",
    body: [
      "오늘 진행할 수 있는 면접이 모두 찼습니다.",
      "본인 API 키를 연결하면 지금 바로 시작할 수 있어요.",
      "이미 진행 중인 면접과 지난 리포트는 그대로 보실 수 있습니다.",
    ],
    actions: [
      { label: "키 연결하기", kind: "connect_key", variant: "default" },
      { label: "지난 리포트 보기", kind: "past_reports", variant: "ghost" },
    ],
  },

  // 4.14.2 사용자 키 무효 — 기다린다고 풀리지 않습니다. 사용자가 키를 고쳐야 합니다.
  byok_key_invalid: {
    title: "연결하신 키를 다시 확인해 주세요",
    body: [
      "연결하신 키로 접속할 수 없었어요. 키가 삭제되었거나 권한이 바뀌었을 수 있습니다.",
      "새 키로 교체하시면 마지막 질문부터 이어서 진행합니다.",
    ],
    actions: [
      { label: "키 교체하기", kind: "replace_key", variant: "default" },
      { label: "여기서 마치기", kind: "finish", variant: "outline" },
    ],
  },

  // 4.14.3 사용자 키 사용량 소진 — **시각을 지어내지 않습니다.** 확인할 곳을 알려 줍니다.
  byok_quota_exhausted: {
    title: "연결하신 키를 지금은 쓸 수 없어요",
    body: [
      "연결하신 키의 사용량이 오늘 한도에 도달했어요. Google AI Studio에서 확인하실 수 있습니다.",
      "사용량이 회복되면 마지막 질문부터 이어서 진행합니다.",
    ],
    actions: [
      { label: "이어서 하기", kind: "resume", variant: "default" },
      { label: "여기서 마치기", kind: "finish", variant: "outline" },
    ],
  },
};

/** 4.14.3 본문에서만 노출하는 링크입니다. */
export const GOOGLE_AI_STUDIO_URL = "https://aistudio.google.com/app/apikey";

/**
 * 503 `capacity_unavailable`을 받았을 때의 **단 한 줄 분기** (계약 14절 함정 1).
 *
 * `keyStatus === 'invalid'`이면 진짜 원인은 여력이 아니라 무효한 키입니다 —
 * 이 사용자에게 "오늘 면접이 모두 찼습니다"라고 말하면 내일 다시 와도 똑같이 막힙니다.
 */
export function blockedCodeFor(
  errorCode: string,
  keyStatus: "none" | "connected" | "invalid" | undefined,
): BlockedCode {
  if (errorCode === "byok_key_invalid") return "byok_key_invalid";
  if (errorCode === "byok_quota_exhausted") return "byok_quota_exhausted";
  return keyStatus === "invalid" ? "byok_key_invalid" : "capacity_unavailable";
}

/**
 * `availableAtIso`가 **`null`이 아닐 때만** 덧붙이는 부차 정보입니다.
 * `null`이면 이 줄을 아예 렌더하지 않습니다 — 기다려도 풀리지 않는 벽입니다.
 */
export function reopenNoticeKo(availableAtIso: string | null): string | null {
  if (!availableAtIso) return null;
  const at = new Date(availableAtIso);
  if (Number.isNaN(at.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
  return `${formatted} 이후에 다시 열립니다.`;
}
