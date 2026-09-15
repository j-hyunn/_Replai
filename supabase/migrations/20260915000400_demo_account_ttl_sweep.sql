-- D35-2 — 익명(데모) 계정 TTL 24시간 스윕. 크론 C1의 **6종째** 워치독이 부를 DB 함수
--
--   원본 명세: `_workspace/00_input/decisions.md` D35-2 "정리 정책 — 즉시 삭제가 아니라 TTL 24시간",
--              `_workspace/01_state_machine.md` 5절(크론 6종), `_workspace/01_domain_model.md` 4절.
--
--   즉시 삭제를 기각한 이유는 단순합니다 — **평가는 비동기이고 리포트가 데모의 결론입니다.**
--   면접이 끝나는 순간 계정을 지우면 방문자는 방금 받은 점수를 못 봅니다.
--
--   삭제 기준: auth.users.is_anonymous = true AND created_at < now() - interval '24 hours'
--   연쇄:      auth.users → profiles(on delete cascade) → interview_sessions → questions/turns/
--              evaluations/evaluation_scores/evaluation_citations/report_feedback/score_disputes,
--              trial_consents, session_events, ai_quota_reservations
--              (마지막 것의 `before delete` 트리거가 원장에 여력을 반납합니다 — 3.14.2절)
--
--   **Storage 객체는 생기지 않습니다.** 데모는 파일 업로드를 제공하지 않고 시드 문서만 씁니다(D35-3).
--   그래서 `storage_cleanup_queue`에 들어갈 것이 없고 삭제 경로가 DB 연쇄 하나로 끝납니다.
--   이것은 부수 효과가 아니라 데모가 업로드를 제공하지 않는 이유 중 하나입니다.
--
--   **왜 DB 함수인가.** 라우트에서 `auth.admin.deleteUser()`를 N번 부르면 왕복이 N번이고
--   부분 실패 시 어디까지 지웠는지 알 수 없습니다. 한 문장으로 지우면 연쇄와 여력 반납이
--   같은 트랜잭션에서 일어납니다.

create or replace function public.sweep_expired_demo_accounts(
  p_ttl_hours int default 24,
  p_limit     int default 200
)
returns table (user_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ttl   int := greatest(coalesce(p_ttl_hours, 24), 1);
  v_limit int := greatest(least(coalesce(p_limit, 200), 1000), 1);
begin
  -- 배치 상한을 두는 이유는 크론의 240초 예산 때문입니다. 못 끝낸 잔여는 다음 날 이어서
  -- 처리됩니다 — 기준이 "생성 후 24시간"이라 한 번 걸린 행은 계속 걸립니다(멱등).
  return query
  with expired as (
    select u.id, u.created_at
      from auth.users u
     where u.is_anonymous is true
       and u.created_at < now() - make_interval(hours => v_ttl)
     order by u.created_at
     limit v_limit
     -- 다른 트랜잭션(수동 계정 삭제 등)이 이미 잡은 행은 건너뜁니다.
     for update skip locked
  ),
  deleted as (
    delete from auth.users u
     using expired e
     where u.id = e.id
    returning u.id, u.created_at
  )
  select d.id, d.created_at from deleted d;
end $$;

comment on function public.sweep_expired_demo_accounts(int, int) is
  '익명(데모) 계정 TTL 스윕. 생성 후 p_ttl_hours(기본 24)가 지난 auth.users(is_anonymous) 행을 최대 p_limit건 삭제하고, 연쇄로 profiles 이하 전부를 정리합니다. ai_quota_reservations의 before delete 트리거가 원장에 여력을 반납합니다 (크론 C1 워치독 6번, D35-2)';

-- 서버 전용입니다. authenticated가 실행할 수 있으면 아무나 남의 데모 계정을 지울 수 있습니다.
revoke execute on function public.sweep_expired_demo_accounts(int, int) from public, anon, authenticated;
grant  execute on function public.sweep_expired_demo_accounts(int, int) to service_role;
