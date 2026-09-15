import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { compound, ok } from "@/lib/api/respond";
import { handle, readJson, requireUser } from "@/lib/api/route";
import { toProfileDto, type AccountStatsDto } from "@/lib/api/serialize";
import { publicEnv } from "@/lib/env.public";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * #30 `GET /api/account` — 프로필과 요약 수치 · #31 `DELETE /api/account` — **계정 실제 삭제**.
 *
 * 삭제 순서는 `04_data_layer.md` 9.3절 그대로이며 **바꾸면 안 됩니다.**
 *
 * 1. 재인증(비밀번호 재확인)
 * 2. **Storage 먼저** — `documents/{user_id}/` 아래 객체를 나열해 일괄 삭제.
 *    DB보다 먼저 하는 이유: `profiles`가 사라지면 **어떤 경로를 지워야 할지 알 수 없게 됩니다.**
 * 3. `auth.admin.deleteUser()` — `auth.users` 삭제가 CASCADE로 전부를 끌고 갑니다.
 *    (`user_api_keys`의 Vault 암호문은 `before delete` 트리거가, 예약은 반납 트리거가 처리합니다.)
 *
 * **2단계와 3단계는 이중 안전장치입니다.** Storage 삭제가 실패해도 `documents`의 트리거가
 * 남은 경로를 `storage_cleanup_queue`에 넣으므로 파일이 조용히 남는 일이 없습니다.
 *
 * ⚠️ **반납 호출을 두지 않습니다** (계약 4.7.3절). `before delete` 트리거가 이미 반납하므로
 * 라우트가 한 번 더 부르면 **이중 반납**이 되어 원장이 부풀어 오릅니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// vercel.json 과 **같은 값**입니다. Storage 목록·일괄 삭제가 최악 구간입니다(계약 11.2절).
export const maxDuration = 120;

/** Storage `list()` 한 페이지 크기. 문서가 이보다 많으면 이어서 훑습니다. */
const STORAGE_PAGE_SIZE = 100;
/** 한 요청에서 훑을 페이지 수 상한 — 문서 10,000건. 그보다 많으면 큐에 맡깁니다. */
const MAX_STORAGE_PAGES = 100;

const deleteSchema = z.object({
  password: z.string().min(1).max(200),
});

export function GET() {
  return handle(async () => {
    const { user, supabase } = await requireUser();

    // 읽기만 합니다(계약 8절 — #30은 `admin.ts`를 쓰지 않습니다).
    const [profile, sessions, documents] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("interview_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase.from("documents").select("byte_size").eq("user_id", user.id),
    ]);

    const failure = profile.error ?? sessions.error ?? documents.error;
    if (failure) {
      throw new ApiError("internal_error", "요청을 처리하지 못했습니다.", { cause: failure });
    }
    if (!profile.data) throw new ApiError("not_found", "계정을 찾을 수 없습니다.");

    const documentRows = documents.data ?? [];
    const stats: AccountStatsDto = {
      sessionCount: sessions.count ?? 0,
      documentCount: documentRows.length,
      // 텍스트 직접 입력 문서는 `byte_size`가 `null`입니다 — Storage를 쓰지 않으므로 0으로 셉니다.
      storageBytes: documentRows.reduce((sum, row) => sum + (row.byte_size ?? 0), 0),
    };

    // `email`은 `profiles`에 없습니다 — `auth.users`가 원본이고 그 값을 여기서 합칩니다.
    return compound({ profile: toProfileDto(profile.data, user.email ?? ""), stats });
  });
}

export function DELETE(request: Request) {
  return handle(async () => {
    const { user } = await requireUser();
    const body = await readJson(request, deleteSchema);

    if (!user.email) {
      // 비밀번호 로그인이 아닌 계정은 재인증 수단이 다릅니다 — 추측해서 통과시키지 않습니다.
      throw new ApiError("guard_failed", "이 계정은 비밀번호로 확인할 수 없습니다.", {
        details: { guard: "no_password_identity" },
      });
    }

    await reauthenticate(user.email, body.password);

    // RLS 우회가 필요한 이유: Storage 일괄 삭제와 `auth.admin.deleteUser()`는 service_role
    // 전용이며, 사용자 문맥 클라이언트에는 admin API 자체가 없습니다(04_data_layer.md 9.3절).
    const admin = createAdminClient();

    await purgeStorage(admin, user.id);

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      throw new ApiError("internal_error", "계정을 삭제하지 못했습니다.", { cause: error });
    }

    // 돌려줄 리소스가 없습니다 — 계정이 사라졌습니다.
    return ok();
  });
}

/**
 * 재인증 — **이 확인 없이 삭제하지 않습니다.**
 *
 * 쿠키에 손대지 않는 **독립 클라이언트**로 확인합니다. `server.ts`(쿠키 바인딩)로 로그인하면
 * 성공·실패 어느 쪽이든 응답에 세션 쿠키가 덮어써져, 삭제가 중간에 실패했을 때 사용자의
 * 로그인 상태가 알 수 없는 모양으로 남습니다.
 */
async function reauthenticate(email: string, password: string): Promise<void> {
  const client = createSupabaseClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    // 400이 아니라 401입니다 — 요청 모양이 아니라 **자격 증명**이 틀렸습니다.
    throw new ApiError("unauthenticated", "비밀번호가 올바르지 않습니다.", { status: 401 });
  }

  // 확인용으로 만든 세션을 남겨 두지 않습니다.
  await client.auth.signOut();
}

/**
 * `documents/{user_id}/` 아래를 비웁니다. **DB 삭제보다 먼저** 돕니다.
 *
 * 실패해도 던지지 않습니다 — 여기서 멈추면 사용자는 계정을 지울 수 없게 되고, 남은 객체는
 * `documents`의 `before delete` 트리거가 `storage_cleanup_queue`에 넣어 스위퍼가 처리합니다.
 */
async function purgeStorage(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<void> {
  try {
    // **언제나 첫 페이지를 다시 읽습니다.** 방금 지운 만큼 목록이 앞으로 당겨지므로 offset을
    // 올리면 그 폭만큼 파일을 건너뜁니다. 종료 조건은 "목록이 비었다" 하나입니다.
    for (let page = 0; page < MAX_STORAGE_PAGES; page += 1) {
      const { data, error } = await admin.storage
        .from("documents")
        .list(userId, { limit: STORAGE_PAGE_SIZE });

      if (error || !data || data.length === 0) return;

      await admin.storage.from("documents").remove(data.map((file) => `${userId}/${file.name}`));
    }

    // 여기까지 왔으면 비정상적으로 파일이 많거나 삭제가 먹히지 않은 것입니다. 함수 실행 시간을
    // 다 태우지 않고 넘깁니다 — 남은 객체는 큐가 가져갑니다.
    console.error("[account] Storage 정리를 다 끝내지 못했습니다 — 큐가 이어받습니다", { userId });
  } catch (error) {
    console.error("[account] Storage 정리에 실패했습니다 — 큐가 이어받습니다", { userId, error });
  }
}
