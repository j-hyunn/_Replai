-- 04_data_layer.md 10절 #12 — D27 예약 원장
--   명세 원본은 02_ai_architecture.md 8.3절·13.6.1절이며 그대로 구현합니다.
--   두 테이블 모두 RLS 켜고 정책 0개(서버 전용). 함수 3종은 service_role에만 실행 권한을 줍니다.

create table public.ai_quota_ledger (
  quota_date    date not null,
  model_bucket  text not null,
  -- 그날 유효한도의 스냅샷. DB는 환경변수를 읽을 수 없으므로 애플리케이션이 계산해 넘깁니다.
  limit_calls   int not null,
  held_calls    int not null default 0,
  granted_total int not null default 0,
  denied_count  int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint ai_quota_ledger_pkey primary key (quota_date, model_bucket),
  constraint ledger_model_bucket_check check (model_bucket in ('flash_lite', 'flash', 'pro')),
  constraint ledger_limit_calls_check check (limit_calls >= 0),
  constraint ledger_held_calls_check check (held_calls >= 0),
  constraint ledger_granted_total_check check (granted_total >= 0),
  constraint ledger_denied_count_check check (denied_count >= 0)
);

comment on table public.ai_quota_ledger is
  '그날·그 버킷의 원자적 카운터. 하루 3행. 복합 PK가 곧 조회 인덱스 (04_data_layer.md 3.13절)';

create trigger trg_ai_quota_ledger_updated_at
  before update on public.ai_quota_ledger
  for each row execute function public.set_updated_at();

-- 읽히면 서비스 전체 여력이 노출되고 UI 금칙어("한도"·"쿼터")가 그대로 드러납니다.
alter table public.ai_quota_ledger enable row level security;

create table public.ai_quota_reservations (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.interview_sessions (id) on delete cascade,
  model_bucket   text not null,
  quota_date     date not null,
  reserved_calls int not null default 0,
  -- 상한 CHECK를 걸지 않습니다(13.6.1절 명시). 초과는 막아야 할 사고가 아니라 관측 신호이고,
  -- CHECK를 걸면 AI 호출 직전의 consume이 예외를 던져 면접이 통째로 끊깁니다.
  consumed_calls int not null default 0,
  released_calls int not null default 0,
  status         text not null default 'held',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint quota_res_model_bucket_check check (model_bucket in ('flash_lite', 'flash', 'pro')),
  constraint quota_res_reserved_calls_check check (reserved_calls >= 0),
  constraint quota_res_consumed_calls_check check (consumed_calls >= 0),
  constraint quota_res_released_calls_check check (released_calls >= 0),
  constraint quota_res_status_check check (status in ('held', 'released', 'overflow')),
  -- 인덱스 #18 — 멱등 재예약의 근거
  constraint quota_res_session_bucket_unique unique (session_id, model_bucket)
);

comment on table public.ai_quota_reservations is
  'funding_source = trial_shared 세션만 행을 가집니다. BYOK 세션은 예약하지 않습니다(D28, 3.14절)';

create trigger trg_ai_quota_reservations_updated_at
  before update on public.ai_quota_reservations
  for each row execute function public.set_updated_at();

-- 인덱스 #19 — 크론 만료 스윕(부분 인덱스)
create index idx_quota_res_held
  on public.ai_quota_reservations (quota_date)
  where status = 'held';

alter table public.ai_quota_reservations enable row level security;

-- ---------------------------------------------------------------------------
-- 3.14.1 함수 3종 — 전부 security definer, set search_path = public
-- ---------------------------------------------------------------------------

create or replace function public.reserve_session_quota(
  p_session_id uuid,
  p_quota_date date,
  p_request    jsonb,
  p_limits     jsonb
)
returns table (model_bucket text, granted int, held_after int, limit_calls int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id            uuid;
  v_funding            text;
  v_existing_session_id uuid;
  v_bucket             text;
  v_target             int;
  v_limit              int;
  v_existing_reserved  int;
  v_existing_status    text;
  v_existing_date      date;
  v_held_already       int;
  v_delta              int;
  v_held               int;
begin
  -- ① 재원 가드 (D28) — user_id를 함께 읽습니다
  select s.user_id, s.funding_source
    into v_user_id, v_funding
    from public.interview_sessions s
   where s.id = p_session_id;

  if v_funding is null then
    raise exception 'session not found: %', p_session_id;
  end if;
  if v_funding <> 'trial_shared' then
    raise exception 'quota_not_applicable:%', v_funding;
  end if;

  -- ② 동시 예약 가드 (D30) — 확인과 삽입 사이의 경쟁을 사용자 단위로 직렬화합니다
  perform pg_advisory_xact_lock(
    hashtextextended('trial_quota_reservation:' || v_user_id::text, 0)
  );

  select r.session_id
    into v_existing_session_id
    from public.ai_quota_reservations r
    join public.interview_sessions s on s.id = r.session_id
   where s.user_id = v_user_id
     and r.status = 'held'
     and r.session_id <> p_session_id   -- 같은 세션의 멱등 재예약(top-up)은 통과
   limit 1;

  if v_existing_session_id is not null then
    raise exception 'trial_reservation_exists:%', v_existing_session_id
      using errcode = 'P0001',
            hint = 'resume or cancel the existing session first';
  end if;

  -- ③ 버킷 처리 순서 고정: pro → flash → flash_lite (희소한 것 먼저 + 데드락 회피)
  foreach v_bucket in array array['pro', 'flash', 'flash_lite'] loop
    v_target := coalesce((p_request ->> v_bucket)::int, 0);
    continue when v_target <= 0;

    v_limit := coalesce((p_limits ->> v_bucket)::int, 0);

    insert into public.ai_quota_ledger as l (quota_date, model_bucket, limit_calls)
    values (p_quota_date, v_bucket, v_limit)
    -- 추론 컬럼 목록은 plpgsql이 표현식으로 파싱해 OUT 파라미터(model_bucket)와 충돌합니다.
    -- 제약 이름으로 지정해 모호성을 없앱니다.
    on conflict on constraint ai_quota_ledger_pkey do nothing;

    select r.reserved_calls, r.status, r.quota_date
      into v_existing_reserved, v_existing_status, v_existing_date
      from public.ai_quota_reservations r
     where r.session_id = p_session_id and r.model_bucket = v_bucket;

    -- 멱등: 목표치와의 차이만 잡습니다. 기준은 "지금 이 날짜의 원장이 실제로 들고 있는 양"입니다.
    -- released/overflow 행이거나 날짜가 다르면 원장에 남은 보유분이 없으므로 0에서 다시 잡습니다
    -- (여기서 reserved_calls를 그대로 기준으로 쓰면 재예약이 원장을 늘리지 않고 통과합니다).
    if v_existing_status = 'held' and v_existing_date = p_quota_date then
      v_held_already := coalesce(v_existing_reserved, 0);
    else
      v_held_already := 0;
    end if;
    v_delta := v_target - v_held_already;

    if v_delta > 0 then
      update public.ai_quota_ledger l
         set held_calls    = l.held_calls + v_delta,
             granted_total = l.granted_total + v_delta,
             updated_at    = now()
       where l.quota_date = p_quota_date
         and l.model_bucket = v_bucket
         and l.held_calls + v_delta <= l.limit_calls;   -- 조건부 UPDATE

      if not found then
        -- 이 증가는 아래 raise로 함께 롤백됩니다(같은 트랜잭션).
        -- 거절 횟수를 실제로 남기려면 라우트가 예외를 잡은 뒤 별도 트랜잭션에서 기록해야 합니다.
        update public.ai_quota_ledger l
           set denied_count = l.denied_count + 1, updated_at = now()
         where l.quota_date = p_quota_date and l.model_bucket = v_bucket;

        raise exception 'quota_exhausted:%', v_bucket;   -- 전체 롤백
      end if;
    end if;

    -- 예약 행 upsert. unique 충돌 시 top-up이며 released였으면 held로 되돌립니다.
    -- 되돌릴 때 consumed_calls를 0으로 초기화합니다 — 반납 때 원장에 남겨 둔 소비분을
    -- 다시 차감하면 이중 반납이 됩니다(3.14.2절과 같은 이유).
    insert into public.ai_quota_reservations as r
      (session_id, model_bucket, quota_date, reserved_calls, status)
    values (p_session_id, v_bucket, p_quota_date, v_target, 'held')
    on conflict on constraint quota_res_session_bucket_unique do update
       set reserved_calls = case
                              when r.status = 'held' and r.quota_date = excluded.quota_date
                              then greatest(r.reserved_calls, excluded.reserved_calls)
                              else excluded.reserved_calls
                            end,
           consumed_calls = case
                              when r.status = 'held' and r.quota_date = excluded.quota_date
                              then r.consumed_calls
                              else 0
                            end,
           quota_date     = excluded.quota_date,
           status         = 'held',
           updated_at     = now();

    select l.held_calls, l.limit_calls
      into v_held, v_limit
      from public.ai_quota_ledger l
     where l.quota_date = p_quota_date and l.model_bucket = v_bucket;

    model_bucket := v_bucket;
    granted      := greatest(v_delta, 0);
    held_after   := v_held;
    limit_calls  := v_limit;
    return next;
  end loop;

  return;
end $$;

comment on function public.reserve_session_quota(uuid, date, jsonb, jsonb) is
  '체험 세션의 여력 예약. 재원 가드(BYOK 거절)·동시 예약 가드(사용자당 held 1세션) 후 pro→flash→flash_lite 순서로 처리(3.14.1절)';

create or replace function public.release_session_quota(
  p_session_id uuid,
  p_buckets    text[] default null,
  p_reason     text default 'settled'
)
returns table (model_bucket text, released int)
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_release int;
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
    v_release := greatest(r.reserved_calls - r.consumed_calls, 0);

    if v_release > 0 then
      update public.ai_quota_ledger l
         set held_calls = greatest(l.held_calls - v_release, 0),
             updated_at = now()
       where l.quota_date = r.quota_date and l.model_bucket = r.model_bucket;
    end if;

    update public.ai_quota_reservations res
       set status         = 'released',
           released_calls = res.released_calls + v_release,
           updated_at     = now()
     where res.id = r.id;

    model_bucket := r.model_bucket;
    released     := v_release;
    return next;
  end loop;

  return;
end $$;

comment on function public.release_session_quota(uuid, text[], text) is
  'held 예약을 released로 바꾸고 미사용분을 원장에 반납합니다. p_buckets가 null이면 전체(3.14.1절)';

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
  v_qdate := coalesce(v_qdate, current_date);

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
  'AI 호출 직전 소비 기록. 예약 행이 없으면 overflow 행을 만듭니다. BYOK 세션은 0 반환(3.14.1절)';

-- security definer 함수를 authenticated가 실행할 수 있으면 RLS 0개 정책이 무의미해집니다.
revoke execute on function public.reserve_session_quota(uuid, date, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.release_session_quota(uuid, text[], text)        from public, anon, authenticated;
revoke execute on function public.consume_session_quota(uuid, text, int)           from public, anon, authenticated;

grant execute on function public.reserve_session_quota(uuid, date, jsonb, jsonb) to service_role;
grant execute on function public.release_session_quota(uuid, text[], text)        to service_role;
grant execute on function public.consume_session_quota(uuid, text, int)           to service_role;

-- ---------------------------------------------------------------------------
-- 3.14.2 before delete 트리거 — 없으면 삭제가 여력을 영구히 먹습니다
-- ---------------------------------------------------------------------------

create or replace function public.release_quota_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release int;
begin
  if old.status = 'held' then
    v_release := greatest(old.reserved_calls - old.consumed_calls, 0);
    if v_release > 0 then
      update public.ai_quota_ledger
         set held_calls = greatest(held_calls - v_release, 0),
             updated_at = now()
       where quota_date = old.quota_date and model_bucket = old.model_bucket;
    end if;
  end if;
  -- status = 'released' 행은 이미 반납됐으므로 건드리지 않습니다(이중 반납이 더 나쁩니다).
  return old;
end $$;

create trigger trg_quota_release_on_delete
  before delete on public.ai_quota_reservations
  for each row execute function public.release_quota_before_delete();
