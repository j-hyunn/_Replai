import { z } from "zod";

import { decodeCursor, encodeCursor, readLimit } from "@/lib/api/cursor";
import { ApiError } from "@/lib/api/errors";
import { list, single } from "@/lib/api/respond";
import { handle, readJson, requireUser } from "@/lib/api/route";
import { DOC_TYPES, toDocumentDto } from "@/lib/api/serialize";
import { isExtractableMimeType, MAX_EXTRACTED_CHARS } from "@/lib/documents/extract";
import type { Database } from "@/lib/supabase/database.types";

type DocumentInsert = Database["public"]["Tables"]["documents"]["Insert"];

/**
 * #24 `GET /api/documents` — 보관함 목록 · #25 `POST /api/documents` — 행 생성.
 *
 * **`admin.ts`를 쓰지 않습니다** (계약 8절). `documents`에는 select/insert/update/delete 정책이
 * 전부 있으므로 `server.ts`(anon + 쿠키)로 쓰면 RLS가 소유권을 한 번 더 지켜 줍니다.
 * service_role로 쓰면 편하지만 그 두 번째 그물을 스스로 걷어내는 것이고, 라우트의 소유권 검사
 * 한 줄이 빠지는 순간 방어가 0이 됩니다.
 *
 * **#25는 업로드가 아닙니다.** 파일은 클라이언트가 anon 키로 Storage에 직접 올리고(계약 2.1절 E2),
 * 이 라우트는 그 뒤에 **행만** 만듭니다. 그래서 함수 실행 시간도 페이로드 한도도 쓰지 않습니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** `04_data_layer.md` 3.2절 — 제목 CHECK와 **같은 값**입니다. */
const MAX_TITLE_CHARS = 120;
/** 같은 절의 `byte_size` CHECK(10 MiB)와 같은 값입니다. */
const MAX_BYTE_SIZE = 10_485_760;

/**
 * 요청 body는 **discriminated union**입니다 (계약 12절 `DocumentCreate`).
 * 두 경로를 하나의 선택 필드 덩어리로 받으면 `source_type='file'`인데 `storagePath`가 없는
 * 요청이 통과해 DB의 `documents_source_shape` CHECK에서야 터집니다.
 */
const createSchema = z.discriminatedUnion("sourceType", [
  z.object({
    docType: z.enum(DOC_TYPES),
    sourceType: z.literal("file"),
    title: z.string().min(1).max(MAX_TITLE_CHARS),
    /** 업로드 **전에** 클라이언트가 만든 uuid입니다. Storage 객체 경로와 같은 값이어야 합니다. */
    documentId: z.uuid(),
    storagePath: z.string().min(1),
    mimeType: z.string().min(1),
    byteSize: z.number().int().positive().max(MAX_BYTE_SIZE),
  }),
  z.object({
    docType: z.enum(DOC_TYPES),
    sourceType: z.literal("text"),
    title: z.string().min(1).max(MAX_TITLE_CHARS),
    extractedText: z.string().min(1).max(MAX_EXTRACTED_CHARS),
  }),
]);

export function GET(request: Request) {
  return handle(async () => {
    const { user, supabase } = await requireUser();
    const params = new URL(request.url).searchParams;

    const docType = readDocType(params.get("docType"));
    const limit = readLimit(params.get("limit"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const rawCursor = params.get("cursor");

    let query = supabase
      .from("documents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (docType !== null) query = query.eq("doc_type", docType);

    if (rawCursor) {
      const cursor = decodeCursor(rawCursor);
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
    }

    const page = data.slice(0, limit);
    const last = page.at(-1);
    const nextCursor =
      data.length > limit && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;

    return list("documents", page.map(toDocumentDto), nextCursor);
  });
}

export function POST(request: Request) {
  return handle(async () => {
    const { user, supabase } = await requireUser();
    const body = await readJson(request, createSchema);

    const insert: DocumentInsert =
      body.sourceType === "file"
        ? {
            // 클라이언트가 준 id를 그대로 씁니다 — Storage 객체 경로가 이미 그 값을 담고 있어,
            // 여기서 새 uuid를 만들면 행과 객체가 서로를 못 찾습니다.
            id: body.documentId,
            user_id: user.id,
            doc_type: body.docType,
            source_type: "file" as const,
            title: body.title,
            storage_path: body.storagePath,
            mime_type: body.mimeType,
            byte_size: body.byteSize,
            // 추출은 #26이 따로 돕니다 — 생성 시점에는 `pending`입니다. 버킷 정책이 통과시킬
            // 수 없는 MIME이면 대기시키지 않고 바로 `failed`로 둡니다(#26이 같은 판정을 내리므로
            // 사용자를 "추출하기"를 한 번 누르게 만들 이유가 없습니다).
            extraction_status: isExtractableMimeType(body.mimeType) ? "pending" : "failed",
            extraction_error: isExtractableMimeType(body.mimeType)
              ? null
              : "unsupported_mime_type",
          }
        : {
            user_id: user.id,
            doc_type: body.docType,
            source_type: "text" as const,
            title: body.title,
            extracted_text: body.extractedText,
            // 텍스트 직접 입력은 추출할 것이 없습니다 — CHECK가 이 값을 요구합니다(04 3.2절).
            extraction_status: "not_required" as const,
            is_edited_by_user: true,
          };

    const { data, error } = await supabase.from("documents").insert(insert).select("*").single();

    if (error || !data) {
      throw new ApiError("internal_error", "문서를 저장하지 못했습니다.", { cause: error });
    }

    return single("document", toDocumentDto(data), { status: 201 });
  });
}

/** 계약에 없는 `docType`은 400입니다 — 조용히 무시하면 사용자가 필터를 켠 줄 착각합니다. */
function readDocType(raw: string | null): (typeof DOC_TYPES)[number] | null {
  if (raw === null) return null;

  const found = DOC_TYPES.find((candidate) => candidate === raw);
  if (found === undefined) {
    throw new ApiError("validation_failed", "요청 내용을 확인해 주세요.", {
      details: { fields: { docType: "알 수 없는 문서 종류입니다." } },
    });
  }
  return found;
}
