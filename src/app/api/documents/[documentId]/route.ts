import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { compound, single } from "@/lib/api/respond";
import { handle, readJson, requireUser } from "@/lib/api/route";
import {
  toDocumentDto,
  type DocumentDetailDto,
  type DocumentRow,
} from "@/lib/api/serialize";
import { MAX_EXTRACTED_CHARS } from "@/lib/documents/extract";
import type { Database } from "@/lib/supabase/database.types";

/**
 * #34 GET · #27 PATCH · #28 DELETE — `/api/documents/[documentId]`.
 *
 * 셋 다 **`server.ts`(anon + 쿠키)** 로만 동작합니다 (계약 8절). `documents`에는 네 정책이 모두
 * 있으므로 RLS가 소유권의 두 번째 그물이 되고, `linkedSessionCount`도 같은 클라이언트로 셉니다 —
 * RLS가 **남의 세션을 세지 않게** 막아 줍니다.
 *
 * ## #28은 세션을 건드리지 않습니다 (`04_data_layer.md` 9.2절)
 *
 * FK가 `set null`이라 참조하던 세션의 `resume_document_id`·`jd_document_id`만 비고, **스냅샷은
 * 그대로 남습니다.** 과거 리포트·전사·질문 근거는 온전하며, 잃는 것은 원본 파일 열람·재추출뿐입니다.
 * **"과거 리포트가 손상된다"는 취지의 경고 문구는 사실이 아니므로 쓰지 마세요**(계약 12.4절).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MAX_TITLE_CHARS = 120;

/**
 * **둘 다 선택이지만 둘 다 비면 400입니다.** 빈 PATCH를 200으로 돌려주면 프론트는 저장이 됐다고
 * 믿고 사용자는 사라진 편집을 보게 됩니다.
 */
const patchSchema = z
  .object({
    title: z.string().min(1).max(MAX_TITLE_CHARS).optional(),
    extractedText: z.string().min(1).max(MAX_EXTRACTED_CHARS).optional(),
  })
  .refine(
    (value) => value.title !== undefined || value.extractedText !== undefined,
    { message: "바꿀 항목이 없습니다.", path: ["title"] },
  );

type UserClient = SupabaseClient<Database>;

export function GET(
  _request: Request,
  context: RouteContext<"/api/documents/[documentId]">,
) {
  return handle(async () => {
    const { documentId } = await context.params;
    const { supabase } = await requireUser();

    const document = await loadOwnedDocument(supabase, documentId);
    const counts = await countLinkedSessions(supabase, document.id);

    const detail: DocumentDetailDto = { ...toDocumentDto(document), ...counts };
    return single("document", detail);
  });
}

export function PATCH(
  request: Request,
  context: RouteContext<"/api/documents/[documentId]">,
) {
  return handle(async () => {
    const { documentId } = await context.params;
    const { supabase } = await requireUser();
    const body = await readJson(request, patchSchema);

    // 존재 확인을 먼저 합니다 — 바로 UPDATE하면 남의 문서와 없는 문서가 둘 다 "0행"이라
    // 404와 403을 구분할 수 없는 것이 아니라, **어느 쪽인지 모르는 채로 200을 줄 위험**이 있습니다.
    await loadOwnedDocument(supabase, documentId);

    const patch: Database["public"]["Tables"]["documents"]["Update"] = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.extractedText !== undefined) {
      patch.extracted_text = body.extractedText;
      // 사용자가 손댄 텍스트는 **재추출이 덮어쓰면 안 됩니다.** #26이 이 플래그를 봅니다.
      patch.is_edited_by_user = true;
      patch.extraction_status = "succeeded";
      patch.extraction_error = null;
    }

    const { data, error } = await supabase
      .from("documents")
      .update(patch)
      .eq("id", documentId)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
    }
    if (!data) throw new ApiError("not_found", "문서를 찾을 수 없습니다.");

    return single("document", toDocumentDto(data));
  });
}

export function DELETE(
  _request: Request,
  context: RouteContext<"/api/documents/[documentId]">,
) {
  return handle(async () => {
    const { documentId } = await context.params;
    const { supabase } = await requireUser();

    const document = await loadOwnedDocument(supabase, documentId);
    // **삭제 전에** 셉니다. 지운 뒤에는 FK가 `set null`로 끊어 놓아 0이 나옵니다.
    const counts = await countLinkedSessions(supabase, document.id);

    // Storage 객체는 여기서 지우지 않습니다 — `before delete` 트리거가 `storage_cleanup_queue`에
    // 경로를 넣고 스위퍼가 실제로 지웁니다(`04_data_layer.md` 9.2절 3단계).
    const { error } = await supabase.from("documents").delete().eq("id", documentId);
    if (error) {
      throw new ApiError("internal_error", "문서를 삭제하지 못했습니다.", { cause: error });
    }

    // 돌려줄 리소스가 없습니다 — 행이 사라졌습니다. 대신 영향 범위를 함께 보냅니다.
    return compound({
      ok: true as const,
      affectedSessionCount: counts.linkedSessionCount,
      configuringSessionCount: counts.configuringSessionCount,
    });
  });
}

/** 없는 문서와 남의 문서를 **똑같이 404**로 답합니다 (계약 7.3절). */
async function loadOwnedDocument(
  supabase: UserClient,
  documentId: string,
): Promise<DocumentRow> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
  }
  if (!data) throw new ApiError("not_found", "문서를 찾을 수 없습니다.");

  return data;
}

/**
 * `linkedSessionCount` — 이 문서를 `resume_document_id` **또는** `jd_document_id`로 참조하는
 * 세션 수입니다. `canceled`·`abandoned`도 셉니다("이 문서가 쓰인 이력" 전부).
 *
 * `configuringSessionCount` — 그중 `created`·`configuring` 세션 수이며 **이쪽만 실질 피해**입니다.
 * 아직 스냅샷을 복사하지 않았으므로 문서가 사라지면 `configuring → ready` 가드를 통과하지 못합니다.
 */
async function countLinkedSessions(
  supabase: UserClient,
  documentId: string,
): Promise<{ linkedSessionCount: number; configuringSessionCount: number }> {
  const { data, error } = await supabase
    .from("interview_sessions")
    .select("status")
    .or(`resume_document_id.eq.${documentId},jd_document_id.eq.${documentId}`);

  if (error) {
    throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
  }

  return {
    linkedSessionCount: data.length,
    configuringSessionCount: data.filter(
      (row) => row.status === "created" || row.status === "configuring",
    ).length,
  };
}
