-- D35-1 / D35-3 — 데모 재원(`demo`)과 전용 쿼터 버킷(`flash_lite_demo`)
--
--   원본 명세: `_workspace/00_input/decisions.md` D35-1,
--              `_workspace/01_state_machine.md` 1절·2절·10절,
--              `_workspace/01_domain_model.md` 3.3절.
--
--   이 파일은 **순수 추가**입니다. 기존 2개 재원(`trial_shared`·`byok`)과
--   기존 3개 버킷(`flash_lite`·`flash`·`pro`)의 의미는 한 글자도 바뀌지 않습니다.
--
--   버킷의 정의를 D35가 정정했습니다 — 버킷은 "모델"이 아니라
--   **"(키 풀 × 모델) 하나에 대응하는 독립 RPD 카운터"** 입니다.
--   `flash_lite_demo`는 `GEMINI_API_KEY_DEMO`(운영 공용 키와 다른 프로젝트의 키) × `flash-lite`이며,
--   `flash_lite`(체험 425 / 하루 12세션)와 **원장 행 자체가 다르므로** 산술적으로 교차하지 않습니다.

-- ---------------------------------------------------------------------------
-- 1. CHECK 확장 3종
-- ---------------------------------------------------------------------------

alter table public.interview_sessions
  drop constraint sessions_funding_source_check;

alter table public.interview_sessions
  add constraint sessions_funding_source_check
  check (funding_source in ('trial_shared', 'byok', 'demo'));

comment on column public.interview_sessions.funding_source is
  'trial_shared | byok | demo. 세션 생성 시 확정되고 변경 불가(트리거가 강제 — #13). 기본값 없음(D28, demo는 D35)';

alter table public.ai_quota_ledger
  drop constraint ledger_model_bucket_check;

alter table public.ai_quota_ledger
  add constraint ledger_model_bucket_check
  check (model_bucket in ('flash_lite', 'flash', 'pro', 'flash_lite_demo'));

comment on table public.ai_quota_ledger is
  '그날·그 버킷의 원자적 카운터. 버킷 = (키 풀 × 모델) 하나에 대응하는 독립 RPD 카운터(D35). 복합 PK가 곧 조회 인덱스';

alter table public.ai_quota_reservations
  drop constraint quota_res_model_bucket_check;

alter table public.ai_quota_reservations
  add constraint quota_res_model_bucket_check
  check (model_bucket in ('flash_lite', 'flash', 'pro', 'flash_lite_demo'));

comment on table public.ai_quota_reservations is
  'funding_source가 trial_shared(버킷 flash_lite) 또는 demo(버킷 flash_lite_demo)인 세션만 행을 가집니다. BYOK 세션은 예약하지 않습니다(D28·D35)';

-- ---------------------------------------------------------------------------
-- 2. reserve_session_quota — 재원↔버킷 짝 강제 + 처리 순서 맨 끝에 확장 (D35-1 ③)
--
--   시그니처는 **불변**입니다. 바뀌는 것은 두 곳뿐입니다.
--     (1) 재원 가드가 2분기(trial_shared / 그 외 예외) → 3분기(재원별 허용 버킷 1개)
--     (2) 고정 버킷 순서 `pro → flash → flash_lite` 뒤에 `flash_lite_demo`를 **맨 끝에** 추가
--         (순서를 바꾸면 데드락 회피 근거가 깨집니다 — 02_ai_architecture.md 8.3.5절)
--
--   짝을 DB에서 강제하는 이유는 D30과 같습니다. 라우트에만 두면 분기 하나를 빠뜨리는 순간
--   데모가 체험 정원을 갉아먹고, 증상은 "체험 정원이 왜인지 부족하다"로만 보여 원인을 찾을 수 없습니다.
--
--   `p_request`에서 요청량이 0인 버킷을 건너뛰는 `continue`는 그대로입니다.
--   데모는 `{"pro":0,"flash":0,"flash_lite":0,"flash_lite_demo":17}`로 부르므로
--   **`flash_lite` 원장 행을 읽지도, 만들지도, 잠그지도 않습니다** — 격리가 코드가 아니라 데이터입니다.
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
  v_allowed_bucket     text;
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
  -- ① 재원 가드 (D28 + D35-1 ③) — user_id를 함께 읽습니다
  select s.user_id, s.funding_source
    into v_user_id, v_funding
    from public.interview_sessions s
   where s.id = p_session_id;

  if v_funding is null then
    raise exception 'session not found: %', p_session_id;
  end if;

  -- 재원 → 허용 버킷 1:1. 없는 재원(byok)은 예약 자체를 하지 않습니다.
  v_allowed_bucket := case v_funding
                        when 'trial_shared' then 'flash_lite'
                        when 'demo'         then 'flash_lite_demo'
                        else null
                      end;

  if v_allowed_bucket is null then
    raise exception 'quota_not_applicable:%', v_funding;
  end if;

  -- ② 동시 예약 가드 (D30) — 확인과 삽입 사이의 경쟁을 사용자 단위로 직렬화합니다.
  --    데모 방문자도 auth.users 행을 가진 진짜 사용자이므로(D35-2) 이 가드가 그대로 걸립니다.
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

  -- ③ 버킷 처리 순서 고정: pro → flash → flash_lite → flash_lite_demo
  --    (희소한 것 먼저 + 데드락 회피. 새 값은 반드시 **맨 끝**)
  foreach v_bucket in array array['pro', 'flash', 'flash_lite', 'flash_lite_demo'] loop
    v_target := coalesce((p_request ->> v_bucket)::int, 0);
    continue when v_target <= 0;

    -- 재원↔버킷 짝 강제. 요청량이 0인 버킷은 위에서 이미 건너뛰었으므로,
    -- 여기 도달한 버킷은 "실제로 잡으려는" 버킷입니다.
    if v_bucket <> v_allowed_bucket then
      raise exception 'quota_bucket_mismatch:%', v_funding
        using errcode = 'P0001',
              hint = 'funding_source and model_bucket must be paired (trial_shared/flash_lite, demo/flash_lite_demo)';
    end if;

    v_limit := coalesce((p_limits ->> v_bucket)::int, 0);

    insert into public.ai_quota_ledger as l (quota_date, model_bucket, limit_calls)
    values (p_quota_date, v_bucket, v_limit)
    on conflict on constraint ai_quota_ledger_pkey do nothing;

    select r.reserved_calls, r.status, r.quota_date
      into v_existing_reserved, v_existing_status, v_existing_date
      from public.ai_quota_reservations r
     where r.session_id = p_session_id and r.model_bucket = v_bucket;

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
        update public.ai_quota_ledger l
           set denied_count = l.denied_count + 1, updated_at = now()
         where l.quota_date = p_quota_date and l.model_bucket = v_bucket;

        raise exception 'quota_exhausted:%', v_bucket;   -- 전체 롤백
      end if;
    end if;

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
  '체험·데모 세션의 여력 예약. 재원↔버킷 짝 강제(trial_shared↔flash_lite, demo↔flash_lite_demo, byok는 예약 없음)·동시 예약 가드(사용자당 held 1세션) 후 pro→flash→flash_lite→flash_lite_demo 순서로 처리(D35-1)';

revoke execute on function public.reserve_session_quota(uuid, date, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.reserve_session_quota(uuid, date, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3. consume_session_quota — 데모 재원을 흘려보내던 결함 정정
--
--   결함: 기존 본문은 `if v_funding is distinct from 'trial_shared' then return 0;`입니다.
--   이 한 줄 때문에 **`demo` 세션의 모든 AI 호출이 소비로 기록되지 않습니다.**
--   `consumed_calls`가 0에 머무르면 `→ completed`의 부분 반납
--   `greatest(reserved - consumed - keep, 0)`이 실제보다 크게 계산되어
--   **이미 써 버린 호출까지 원장에 되돌려줍니다.** 그러면 원장이 "여력 있음"이라고 답한 상태에서
--   프로바이더가 429를 돌려주는, D27이 없애려던 바로 그 상황이 데모 버킷에서 재현됩니다.
--
--   D35는 "소비·반납·만료 스윕은 버킷 이름만 다를 뿐 전부 그대로"라고 적었는데,
--   `release_session_quota`는 실제로 재원을 보지 않아 그대로 성립하지만
--   `consume_session_quota`는 재원을 보므로 성립하지 않았습니다. 그 간극만 메웁니다.
--
--   고치는 방향은 reserve와 동일하게 **재원↔버킷 짝**입니다. 다만 여기서는 예외를 던지지 않고
--   0을 반환합니다 — 예약은 막고(사전), 소비는 흘려보낸다는 기존 원칙 그대로입니다.
--   분기 실수가 곧 면접 중단이 되어서는 안 됩니다.
-- ---------------------------------------------------------------------------

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
  v_allowed  text;
  v_consumed int;
  v_qdate    date;
begin
  select s.funding_source into v_funding
    from public.interview_sessions s where s.id = p_session_id;

  v_allowed := case v_funding
                 when 'trial_shared' then 'flash_lite'
                 when 'demo'         then 'flash_lite_demo'
                 else null
               end;

  -- BYOK(또는 없는 세션)이면 조용히 0을 반환합니다.
  if v_allowed is null then
    return 0;
  end if;

  -- 짝이 어긋난 버킷도 0입니다. 기록하면 남의 원장을 오염시키고, 예외를 던지면 면접이 끊깁니다.
  -- 이 경로가 실제로 나오면 라우트의 버킷 선택이 잘못된 것이며,
  -- 예약 단계의 quota_bucket_mismatch가 먼저 잡습니다.
  if p_bucket is distinct from v_allowed then
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
  select max(r.quota_date) into v_qdate
    from public.ai_quota_reservations r where r.session_id = p_session_id;
  v_qdate := coalesce(v_qdate, public.quota_reset_today());

  insert into public.ai_quota_reservations
    (session_id, model_bucket, quota_date, reserved_calls, consumed_calls, status)
  values (p_session_id, p_bucket, v_qdate, 0, p_n, 'overflow');

  update public.ai_quota_ledger l
     set held_calls = l.held_calls + p_n, updated_at = now()
   where l.quota_date = v_qdate and l.model_bucket = p_bucket;

  return p_n;
end $$;

comment on function public.consume_session_quota(uuid, text, int) is
  'AI 호출 직전 소비 기록. 재원↔버킷 짝이 맞을 때만 기록하고 그 외(byok·짝 불일치)는 0 반환. 예약 행이 없으면 overflow 행 생성. quota_date 폴백은 리셋 타임존 기준(D35-1)';

revoke execute on function public.consume_session_quota(uuid, text, int) from public, anon, authenticated;
grant  execute on function public.consume_session_quota(uuid, text, int) to service_role;
