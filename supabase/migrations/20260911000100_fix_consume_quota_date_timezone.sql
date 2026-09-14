-- 04_data_layer.md 3.14.1절 — consume_session_quota의 quota_date 폴백을 리셋 타임존 기준으로 정정
--
-- 결함 (2026-09-11 라이브 검증에서 발견).
--   20260910000100_ai_quota.sql:308의 `v_qdate := coalesce(v_qdate, current_date);`가
--   **UTC 날짜**를 씁니다(이 프로젝트의 DB TimeZone은 UTC — 실측 확인).
--   그러나 `quota_date`의 정의는 "프로바이더 리셋 시각 기준 날짜"이고
--   `AI_QUOTA_RESET_TIMEZONE = America/Los_Angeles`로 확정돼 있습니다
--   (`05_deploy.md` 1.2절·3.1절, `04_data_layer.md` 3.13절).
--
--   LA는 UTC보다 7~8시간 뒤이므로 **매일 UTC 00:00~07:00/08:00 구간에서 두 날짜가 어긋납니다.**
--   그 구간에 overflow 경로가 타면 원장 UPDATE의 `where quota_date = v_qdate`가
--   **아직 존재하지 않는 다음 날 원장 행**을 겨냥해 0행을 갱신하고, 그날 실제 소비가
--   `held_calls`에 반영되지 않습니다 → 그날 정원이 실제보다 크게 계산됩니다(D27이 막으려던 실패).
--
-- 영향 범위는 overflow 경로 하나뿐입니다. 예약 행이 있는 정상 경로는
-- `max(r.quota_date)`(예약 시점에 라우트가 넘긴 값)를 그대로 쓰므로 영향이 없습니다.
--
-- 고치는 방향.
--   시그니처는 **그대로 둡니다** — `05_api_contract.md`의 호출 계약과 라우트를 건드리지 않기 위해서입니다.
--   날짜의 원본은 여전히 애플리케이션(환경변수 → 라우트 → p_quota_date)이고,
--   이 폴백은 "예약 없이 소비된" 비정상 경로의 **마지막 방어선**일 뿐입니다.
--   타임존 값은 GUC `app.quota_reset_timezone`으로 덮어쓸 수 있게 하되,
--   비어 있으면 확정값 America/Los_Angeles로 떨어집니다(UTC로 떨어지지 않습니다).

create or replace function public.quota_reset_today()
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz date;
  v_name text;
begin
  v_name := coalesce(nullif(current_setting('app.quota_reset_timezone', true), ''), 'America/Los_Angeles');
  begin
    v_tz := (now() at time zone v_name)::date;
  exception when others then
    -- 잘못된 타임존 이름이 들어와도 UTC로 떨어지지 않게 확정값으로 복구합니다.
    v_tz := (now() at time zone 'America/Los_Angeles')::date;
  end;
  return v_tz;
end $$;

comment on function public.quota_reset_today() is
  'AI_QUOTA_RESET_TIMEZONE(기본 America/Los_Angeles) 기준의 오늘 날짜. quota_date 폴백 전용 — 정상 경로의 원본은 라우트가 넘기는 p_quota_date입니다 (04_data_layer.md 3.13절)';

create or replace function public.consume_session_quota(
  p_session_id uuid,
  p_bucket     text,
  p_n          int default 1
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_funding  text;
  v_consumed int;
  v_qdate    date;
begin
  select s.funding_source into v_funding
    from public.interview_sessions s where s.id = p_session_id;

  -- BYOK(또는 없는 세션)이면 조용히 0을 반환합니다. 여기서 예외를 던지면
  -- 분기 실수가 곧 면접 중단이 됩니다 — 예약은 막고(사전), 소비는 흘려보냅니다(사후).
  if v_funding is distinct from 'trial_shared' then
    return 0;
  end if;

  update public.ai_quota_reservations r
     set consumed_calls = r.consumed_calls + p_n,
         updated_at     = now()
   where r.session_id = p_session_id and r.model_bucket = p_bucket
  returning r.consumed_calls, r.quota_date into v_consumed, v_qdate;

  if found then
    return v_consumed;
  end if;

  -- 예약 없이 소비된 경우: overflow 행을 만들고 원장 held_calls를 조건 없이 +n 합니다.
  -- (한도 초과를 허용해야 다음 예약이 정확히 막힙니다.)
  select max(r.quota_date) into v_qdate
    from public.ai_quota_reservations r where r.session_id = p_session_id;
  -- 2026-09-11 정정: current_date(UTC)가 아니라 리셋 타임존 기준의 오늘입니다.
  v_qdate := coalesce(v_qdate, public.quota_reset_today());

  insert into public.ai_quota_reservations
    (session_id, model_bucket, quota_date, reserved_calls, consumed_calls, status)
  values (p_session_id, p_bucket, v_qdate, 0, p_n, 'overflow');

  -- 원장 행이 없으면 만들지 않습니다. limit_calls를 0으로 박으면 그날의 모든 예약이
  -- 막히기 때문입니다(한도의 원본은 애플리케이션 환경변수뿐입니다 — 3.13절).
  update public.ai_quota_ledger l
     set held_calls = l.held_calls + p_n, updated_at = now()
   where l.quota_date = v_qdate and l.model_bucket = p_bucket;

  return p_n;
end $$;

comment on function public.consume_session_quota(uuid, text, int) is
  'AI 호출 직전 소비 기록. 예약 행이 없으면 overflow 행을 만듭니다. BYOK 세션은 0 반환. quota_date 폴백은 리셋 타임존 기준(3.14.1절)';

-- create or replace는 기존 권한을 유지하지만, 명시적으로 다시 못박습니다.
revoke execute on function public.consume_session_quota(uuid, text, int) from public, anon, authenticated;
grant  execute on function public.consume_session_quota(uuid, text, int) to service_role;

-- 헬퍼도 서버 전용입니다. 여력 관련 값은 클라이언트에 닿지 않습니다(3.13절).
revoke execute on function public.quota_reset_today() from public, anon, authenticated;
grant  execute on function public.quota_reset_today() to service_role;
