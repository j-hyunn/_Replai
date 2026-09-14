-- 05_api_contract.md 4.7.3절 1번 — `→ completed`의 **부분 반납**을 함수가 표현할 수 있게 합니다 (D34).
--
--   결함: 계약은 완주 반납이 `greatest(reserved - consumed - 6, 0)`이고 예약 행이 `held`로 남아야
--   한다고 정했지만, 기존 `release_session_quota(uuid, text[], text)`는 전량 반납밖에 못 합니다.
--   그대로 부르면 면접이 끝나는 순간 평가자 4 + 코치 2가 쓸 여력까지 반납돼
--   **완주한 세션이 리포트를 받지 못합니다.** 반대로 부르지 않으면 세션당 34가 하루 종일 묶입니다.
--
--   해법: `p_keep`을 더합니다. 기본값 0이므로 2~6번(정산·취소·포기·실패·만료)의 동작은 그대로입니다.
--   남길 양은 애플리케이션 상수(`COMPLETED_KEEP_CALLS`)이며 DB는 정책을 모릅니다.

-- 인자 목록이 바뀌므로 교체합니다(같은 이름의 오버로드를 남기면 호출이 모호해집니다).
drop function if exists public.release_session_quota(uuid, text[], text);

create function public.release_session_quota(
  p_session_id uuid,
  p_buckets    text[] default null,
  p_reason     text default 'settled',
  p_keep       int  default 0
)
returns table (model_bucket text, released int)
language plpgsql
security definer
set search_path = public
as $$
declare
  r         record;
  v_release int;
  v_keep    int := greatest(coalesce(p_keep, 0), 0);
begin
  -- p_reason은 호출 측 관측용입니다. 이 함수는 값을 저장하지 않고
  -- 라우트가 session_events(quota_released)의 detail.reason으로 남깁니다(3.6절).
  for r in
    select res.id, res.model_bucket, res.quota_date, res.reserved_calls, res.consumed_calls
      from public.ai_quota_reservations res
     where res.session_id = p_session_id
       and res.status = 'held'
       and (p_buckets is null or res.model_bucket = any (p_buckets))
     for update
  loop
    v_release := greatest(r.reserved_calls - r.consumed_calls - v_keep, 0);

    if v_release > 0 then
      update public.ai_quota_ledger l
         set held_calls = greatest(l.held_calls - v_release, 0),
             updated_at = now()
       where l.quota_date = r.quota_date and l.model_bucket = r.model_bucket;
    end if;

    if v_keep > 0 then
      -- 부분 반납: 행은 held로 남고 보유분만 줄어듭니다. 뒤이은 전량 반납이 남은 v_keep을
      -- 마저 가져갑니다 — 그래서 여기서 status를 바꾸면 안 됩니다(세션당 v_keep이 영구히 샙니다).
      -- least()인 이유: 이미 보유분이 v_keep 이하면 늘리지 않습니다(이중 반납의 반대 방향 사고).
      update public.ai_quota_reservations res
         set reserved_calls = least(res.reserved_calls, res.consumed_calls + v_keep),
             released_calls = res.released_calls + v_release,
             updated_at     = now()
       where res.id = r.id;
    else
      update public.ai_quota_reservations res
         set status         = 'released',
             released_calls = res.released_calls + v_release,
             updated_at     = now()
       where res.id = r.id;
    end if;

    model_bucket := r.model_bucket;
    released     := v_release;
    return next;
  end loop;

  return;
end $$;

comment on function public.release_session_quota(uuid, text[], text, int) is
  'held 예약을 반납합니다. p_keep > 0이면 그만큼 남기고 행을 held로 유지하는 부분 반납(→ completed, 05_api_contract.md 4.7.3절)';

revoke execute on function public.release_session_quota(uuid, text[], text, int) from public, anon, authenticated;
grant  execute on function public.release_session_quota(uuid, text[], text, int) to service_role;
