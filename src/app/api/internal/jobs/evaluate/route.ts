import { ApiError } from "@/lib/api/errors";
import { fail } from "@/lib/api/respond";

/**
 * 내부 워커 — 평가자 → 코치를 한 호출 안에서 순차 실행 (I2, D31). JOB_SECRET 검사 필수.
 * 소프트 데드라인 210초를 넘기면 새 단계·새 재시도를 시작하지 않습니다 (11.2.1절).
 *
 * ⚠️ 자리 표시자입니다 — 스캐폴딩 단계에서 라우트 파일과 런타임·maxDuration만 잡아 둔 것입니다.
 * 본문은 후속 작업에서 구현합니다. 계약: 05_api_contract.md 4.1절 · 6.2절 · D31
 */

// 05_api_contract.md 11.1절 — 전 라우트 nodejs
export const runtime = "nodejs";
// 인증 응답이 캐시되면 남의 데이터가 보입니다.
export const dynamic = "force-dynamic";
// vercel.json 과 **같은 값**으로 둡니다. 한쪽만 두면 파일이 옮겨졌을 때
// 조용히 기본값으로 떨어집니다 (05_deploy.md 2.2절).
export const maxDuration = 240;

export async function POST() {
  return fail(
    new ApiError("internal_error", "아직 구현되지 않은 엔드포인트입니다.", {
      status: 501,
    }),
  );
}
