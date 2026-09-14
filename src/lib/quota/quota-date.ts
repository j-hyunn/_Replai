import "server-only";

import { serverEnv } from "@/lib/env.server";

/**
 * `quota_date` 계산 (05_api_contract.md 4.7.1절 · 05_deploy.md 1.2절).
 *
 * **`new Date().toISOString().slice(0, 10)`을 쓰면 안 됩니다.** 그것은 UTC 날짜이고,
 * Gemini의 RPD는 **태평양 시간 자정**에 리셋됩니다. UTC로 계산하면 하루 최대 8시간 동안
 * 예약 원장의 날짜와 실제 한도의 날짜가 어긋나, 리셋 직후인데 어제 원장을 보고 거절하거나
 * 반대로 리셋 전인데 새 원장을 열어 **한도의 두 배를 배급**합니다.
 */

/** `Intl`로 타임존 날짜를 뽑습니다 — `en-CA` 로케일이 곧 `YYYY-MM-DD`입니다. */
function dateInTimeZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** 리셋 타임존 기준의 오늘 날짜(`YYYY-MM-DD`). DB 함수에 그대로 넘깁니다. */
export function currentQuotaDate(now: Date = new Date()): string {
  return dateInTimeZone(now, serverEnv().AI_QUOTA_RESET_TIMEZONE);
}

/**
 * 다음 리셋(= 리셋 타임존 기준 다음 자정)의 ISO 시각.
 * `capacity_unavailable`의 `availableAtIso`와 `Retry-After` 계산에 씁니다.
 *
 * 타임존 오프셋을 상수로 가정하지 않습니다 — 서머타임 경계에서 한 시간 어긋납니다.
 * "리셋 타임존의 날짜가 바뀌는 첫 순간"을 분 단위로 이분 탐색해 찾습니다.
 */
export function nextQuotaResetAt(now: Date = new Date()): Date {
  const timeZone = serverEnv().AI_QUOTA_RESET_TIMEZONE;
  const today = dateInTimeZone(now, timeZone);

  const MINUTE = 60_000;
  // 어떤 타임존에서도 26시간 안에 날짜가 바뀝니다(최대 오프셋 ±14h + 서머타임 ±1h).
  let low = now.getTime();
  let high = low + 26 * 60 * MINUTE;

  while (high - low > MINUTE) {
    const mid = low + Math.floor((high - low) / 2 / MINUTE) * MINUTE;
    if (mid === low) break;
    if (dateInTimeZone(new Date(mid), timeZone) === today) low = mid;
    else high = mid;
  }

  // 경계는 분 단위로 맞아떨어지므로 초·밀리초를 버립니다.
  return new Date(Math.ceil(high / MINUTE) * MINUTE);
}

/** 지금부터 다음 리셋까지의 초. `Retry-After` 헤더 값입니다. */
export function secondsUntilQuotaReset(now: Date = new Date()): number {
  return Math.max(1, Math.ceil((nextQuotaResetAt(now).getTime() - now.getTime()) / 1000));
}
