import "server-only";

/**
 * 파일 → 텍스트 추출 (#26 · `04_data_layer.md` 7.1절의 허용 MIME 4종).
 *
 * **라우트가 라이브러리를 직접 부르지 않습니다.** 추출기를 바꾸거나 포맷을 늘릴 때 고칠 곳을
 * 한 파일로 묶어 두고, 라우트는 "성공/실패와 그 사유"만 다룹니다.
 *
 * 무거운 두 파서(`unpdf` · `mammoth`)는 **필요할 때만 동적으로 import** 합니다. 텍스트 직접
 * 입력 경로(`source_type='text'`)와 `.txt`/`.md` 업로드는 이 두 모듈을 아예 로드하지 않습니다.
 */

export const EXTRACTABLE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
] as const;

export type ExtractableMimeType = (typeof EXTRACTABLE_MIME_TYPES)[number];

export function isExtractableMimeType(value: string | null): value is ExtractableMimeType {
  return EXTRACTABLE_MIME_TYPES.some((candidate) => candidate === value);
}

/**
 * `documents.extracted_text`의 CHECK 상한과 **같은 값**입니다(`04_data_layer.md` 3.2절).
 * 넘치면 INSERT가 제약 위반으로 실패하므로 여기서 먼저 자릅니다 — 200자 남기고 터지는 것보다
 * 자르고 성공하는 편이 사용자에게 낫고, 이력서·JD는 앞부분이 본문입니다.
 */
export const MAX_EXTRACTED_CHARS = 200_000;

/** 추출 실패의 사유. `documents.extraction_error`에 그대로 들어갑니다(영어 식별자). */
export type ExtractionFailureCode =
  | "unsupported_mime_type"
  | "download_failed"
  | "parse_failed"
  | "empty_text";

export type ExtractionResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; code: ExtractionFailureCode };

export async function extractText(
  bytes: ArrayBuffer,
  mimeType: string | null,
): Promise<ExtractionResult> {
  if (!isExtractableMimeType(mimeType)) {
    return { ok: false, code: "unsupported_mime_type" };
  }

  let raw: string;
  try {
    raw = await parse(bytes, mimeType);
  } catch (error) {
    // 파서 예외를 그대로 올리지 않습니다 — 스택에 파일 내용 조각이 섞여 로그로 나갑니다.
    console.error("[extract] 파싱에 실패했습니다", { mimeType, error });
    return { ok: false, code: "parse_failed" };
  }

  const text = normalize(raw);
  // 스캔 PDF(이미지만 있는 문서)가 여기로 옵니다. **`parse_failed`와 구분합니다** —
  // 사용자가 할 일이 다릅니다(재시도가 아니라 텍스트 직접 입력).
  if (text.length === 0) return { ok: false, code: "empty_text" };

  return text.length > MAX_EXTRACTED_CHARS
    ? { ok: true, text: text.slice(0, MAX_EXTRACTED_CHARS), truncated: true }
    : { ok: true, text, truncated: false };
}

async function parse(bytes: ArrayBuffer, mimeType: ExtractableMimeType): Promise<string> {
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    return new TextDecoder("utf-8").decode(bytes);
  }

  if (mimeType === "application/pdf") {
    const { extractText: extractPdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }

  const mammoth = await import("mammoth");
  // `extractRawText`입니다 — HTML 변환은 이력서 텍스트에 마크업 잡음을 섞습니다.
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return value;
}

/**
 * 줄 끝 공백과 3줄 이상 연속 빈 줄을 정리합니다.
 *
 * **내용을 바꾸지 않습니다** — 문단 구분은 남기고 잡음만 접습니다. 여기서 공격적으로 정규화하면
 * 인용 오프셋(계약 9.2절)이 원문과 어긋나기 시작합니다.
 */
function normalize(raw: string): string {
  return raw
    .replace(/\r\n?/gu, "\n")
    .replace(/[^\S\n]+$/gmu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}
