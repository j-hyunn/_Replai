import { ApiError } from "@/lib/api/errors";
import { single } from "@/lib/api/respond";
import { handle, requireUser } from "@/lib/api/route";
import { toDocumentDto } from "@/lib/api/serialize";
import { extractText } from "@/lib/documents/extract";

/**
 * #26 `POST /api/documents/[documentId]/extract` — 문서 텍스트 추출 (D26: **동기 라우트 유지**).
 *
 * ## 실패는 문서 상태이지 세션의 종료가 아닙니다 (계약 4.4절)
 *
 * 추출이 실패해도 **어떤 세션도 전이시키지 않습니다.** 문서는 세션에 종속되지 않아 여러 세션이
 * 같은 문서를 참조할 수 있고, 한 문서의 실패가 그 문서를 참조하는 모든 세션을 `failed`로 만들면
 * **남의 세션까지 끌고 죽습니다.** 그 시점에도 사용자에게는 재추출·텍스트 직접 입력·다른 문서
 * 선택이 남아 있고, 준비를 포기하는 전이의 유일한 진입점은 **#35**입니다.
 *
 * ## 응답은 성공·실패 모두 200 `{ document }` 입니다
 *
 * `extractionStatus`가 `'failed'`인 문서를 200으로 돌려주는 것은 계약대로입니다(#26 행) —
 * "추출에 실패했다"는 **문서의 상태**이고, 요청 처리 자체는 성공했습니다. 오류 바디로 내보내면
 * 프론트가 `extraction_error`를 읽을 방법이 사라집니다.
 *
 * **`admin.ts`를 쓰지 않습니다** (계약 8절) — `documents`에는 update 정책이 있습니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// vercel.json 과 **같은 값**입니다. 10MB PDF 최악 ~25s + Storage 다운로드를 담을 관측 구간입니다.
export const maxDuration = 120;

export function POST(
  _request: Request,
  context: RouteContext<"/api/documents/[documentId]/extract">,
) {
  return handle(async () => {
    const { documentId } = await context.params;
    const { supabase } = await requireUser();

    const { data: document, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .maybeSingle();

    if (error) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
    }
    if (!document) throw new ApiError("not_found", "문서를 찾을 수 없습니다.");

    // 계약 13절 — 같은 문서에 추출이 이미 돌고 있으면 409입니다. 두 번 돌면 마지막에 끝난
    // 쪽이 이기므로, 사용자가 편집한 텍스트를 옛 추출 결과가 덮어쓸 수 있습니다.
    if (document.extraction_status === "running") {
      throw new ApiError("extraction_in_progress", "이미 텍스트를 추출하고 있습니다.");
    }

    if (document.source_type !== "file" || !document.storage_path) {
      // 텍스트 직접 입력 문서는 추출할 것이 없습니다(`extraction_status='not_required'`).
      throw new ApiError("guard_failed", "이 문서는 추출할 원본 파일이 없습니다.", {
        details: { guard: "no_source_file" },
      });
    }

    // **사용자가 손댄 텍스트를 재추출이 덮어쓰지 않습니다.** 직접 고쳐 넣은 내용을 파일에서
    // 다시 뽑은 것으로 되돌리면, 사용자는 자기 편집이 사라진 이유를 알 수 없습니다.
    if (document.is_edited_by_user) {
      throw new ApiError("guard_failed", "직접 수정한 문서는 다시 추출하지 않습니다.", {
        details: { guard: "edited_by_user" },
      });
    }

    // 진행 중임을 먼저 남깁니다 — 이 라우트가 최대 120초를 쓰므로, 그 사이의 두 번째 요청이
    // 위의 409 가드에 걸려야 합니다.
    await supabase
      .from("documents")
      .update({ extraction_status: "running", extraction_error: null })
      .eq("id", documentId);

    const downloaded = await supabase.storage.from("documents").download(document.storage_path);

    const result = downloaded.error || !downloaded.data
      ? ({ ok: false, code: "download_failed" } as const)
      : await extractText(await downloaded.data.arrayBuffer(), document.mime_type);

    const patch = result.ok
      ? {
          extracted_text: result.text,
          extraction_status: "succeeded" as const,
          extraction_error: null,
        }
      : {
          extraction_status: "failed" as const,
          // 영어 식별자 그대로입니다 — 사용자에게 보이는 한국어 문구는 UI가 매핑합니다.
          extraction_error: result.code,
        };

    const updated = await supabase
      .from("documents")
      .update(patch)
      .eq("id", documentId)
      .select("*")
      .single();

    if (updated.error || !updated.data) {
      throw new ApiError("internal_error", "추출 결과를 저장하지 못했습니다.", {
        cause: updated.error,
      });
    }

    return single("document", toDocumentDto(updated.data));
  });
}
