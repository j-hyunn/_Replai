import { ApiError } from "@/lib/api/errors";
import { compound } from "@/lib/api/respond";
import { handle, requireUser } from "@/lib/api/route";

/**
 * #29 `GET /api/documents/[documentId]/download-url` — **만료 60초 서명 URL**.
 *
 * 공개 URL을 만들지 않습니다(`04_data_layer.md` 7.4절 4항). 버킷은 private이고, 원본 파일에
 * 닿는 유일한 길은 매번 새로 발급되는 이 짧은 URL입니다.
 *
 * **`server.ts`(anon + 쿠키)로 발급합니다.** Storage 정책이 경로 첫 세그먼트를 `auth.uid()`와
 * 대조하므로(7.3절), 남의 문서 id를 넣으면 서명 발급 자체가 실패합니다 — RLS와 Storage 정책이
 * 소유권의 두 번째 그물입니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** 계약 4절 #29 — 응답의 `expiresInSec`와 **같은 값**이어야 합니다. */
const EXPIRES_IN_SEC = 60;

export function GET(
  _request: Request,
  context: RouteContext<"/api/documents/[documentId]/download-url">,
) {
  return handle(async () => {
    const { documentId } = await context.params;
    const { supabase } = await requireUser();

    const { data: document, error } = await supabase
      .from("documents")
      .select("storage_path")
      .eq("id", documentId)
      .maybeSingle();

    if (error) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: error });
    }
    // 없는 문서와 남의 문서를 똑같이 404로 답합니다 (계약 7.3절).
    if (!document) throw new ApiError("not_found", "문서를 찾을 수 없습니다.");

    // 텍스트 직접 입력 문서에는 내려받을 원본이 없습니다. 404가 맞습니다 —
    // 문서는 존재하지만 **이 리소스(파일)** 는 존재하지 않습니다.
    if (!document.storage_path) {
      throw new ApiError("not_found", "내려받을 원본 파일이 없습니다.");
    }

    const signed = await supabase.storage
      .from("documents")
      .createSignedUrl(document.storage_path, EXPIRES_IN_SEC);

    if (signed.error || !signed.data) {
      throw new ApiError("internal_error", "다운로드 링크를 만들지 못했습니다.", {
        cause: signed.error,
      });
    }

    return compound({ url: signed.data.signedUrl, expiresInSec: EXPIRES_IN_SEC as 60 });
  });
}
