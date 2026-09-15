import { ApiError } from "@/lib/api/errors";

/**
 * 목록 커서 (`05_api_contract.md` 1절 — `nextCursor`는 항상 존재하고 마지막 페이지에서 `null`).
 *
 * **오프셋이 아니라 키셋입니다.** `(created_at desc, id desc)` 정렬의 마지막 행을 그대로 담으므로,
 * 페이지를 넘기는 사이에 행이 추가·삭제돼도 건너뛰거나 중복되지 않습니다.
 * 오프셋으로 하면 새 세션 하나가 생길 때마다 다음 페이지의 첫 행이 반복해서 나옵니다.
 *
 * **불투명 문자열입니다.** 프론트는 받은 값을 그대로 되돌려 보낼 뿐 해석하지 않습니다 —
 * 훅이 커서를 파싱하기 시작하면 정렬 키를 바꿀 수 없게 됩니다.
 */

export type Cursor = { createdAt: string; id: string };

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString("base64url");
}

/**
 * 깨진 커서는 **400 `validation_failed`** 입니다. 조용히 무시하고 첫 페이지를 돌려주면
 * 무한 스크롤이 같은 페이지를 영원히 반복합니다.
 */
export function decodeCursor(raw: string): Cursor {
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  const separator = decoded.lastIndexOf("|");
  const createdAt = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);

  if (separator <= 0 || createdAt.length === 0 || id.length === 0) {
    throw new ApiError("validation_failed", "요청 내용을 확인해 주세요.", {
      details: { fields: { cursor: "커서 형식이 올바르지 않습니다." } },
    });
  }

  return { createdAt, id };
}

/** 쿼리스트링의 `limit`. 값이 없으면 기본값, 범위를 벗어나면 400입니다. */
export function readLimit(raw: string | null, fallback: number, max: number): number {
  if (raw === null) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new ApiError("validation_failed", "요청 내용을 확인해 주세요.", {
      details: { fields: { limit: `1 이상 ${max} 이하의 정수여야 합니다.` } },
    });
  }
  return parsed;
}
