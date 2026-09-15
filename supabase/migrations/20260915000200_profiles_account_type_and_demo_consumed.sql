-- D35-2 — `profiles` 신규 컬럼 2개 + 가입 트리거 정정 + 재원 규칙 확장
--
--   원본 명세: `_workspace/00_input/decisions.md` D35-2,
--              `_workspace/01_domain_model.md` 3.1절, `_workspace/01_state_machine.md` 10절.
--
--   데모 방문자는 Supabase 익명 인증으로 `auth.users`에 `is_anonymous = true`인 **진짜 행**을 갖습니다.
--   따라서 기존 RLS 정책(`(select auth.uid()) = user_id`)은 **한 줄도 바뀌지 않습니다.**
--   바뀌는 것은 "이 계정이 익명인가"를 `public` 스키마만 읽고 알 수 있게 하는 것뿐입니다 —
--   게이트·프록시·집계가 매번 `auth.users`를 조인하지 않게 하려는 것입니다.

-- ---------------------------------------------------------------------------
-- 1. profiles 신규 컬럼 2개
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column account_type text not null default 'registered',
  add column demo_consumed_at timestamptz;

alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('registered', 'demo'));

comment on column public.profiles.account_type is
  'registered | demo. 가입 트리거가 auth.users.is_anonymous에서 채웁니다. 이 값이 있어야 게이트·프록시가 public 스키마만 읽고 익명 여부를 판정할 수 있습니다(D35-2)';
comment on column public.profiles.demo_consumed_at is
  '데모 1회 소진 시각. trial_consumed_at과 **별개 컬럼**입니다 — 의미가 다르고, 한 계정이 둘 다 갖는 일은 없습니다. 데모 세션의 첫 주질문 응답 턴 저장 트랜잭션에서 demo_consumed_at is null 조건으로 1회만 기록(D35-2)';

-- 이미 존재하는 익명 계정이 있다면 값을 맞춥니다(없으면 0행).
update public.profiles p
   set account_type = 'demo'
  from auth.users u
 where u.id = p.id
   and u.is_anonymous is true
   and p.account_type <> 'demo';

-- 인덱스 #22 — 익명 계정 TTL 스윕과 데모 집계 분리(부분 인덱스라 registered 계정에는 비용이 없습니다)
create index idx_profiles_demo
  on public.profiles (created_at)
  where account_type = 'demo';

-- ---------------------------------------------------------------------------
-- 2. handle_new_user — account_type을 채우고 display_name의 NULL을 막습니다
--
--   익명 사용자는 `new.email`이 NULL이라 `split_part(NULL, '@', 1)`이 NULL을 돌려줍니다.
--   컬럼이 nullable이라 실패하지는 않지만 화면에 빈 이름이 나옵니다.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, account_type)
  values (
    new.id,
    coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), '데모 방문자'),
    case when new.is_anonymous is true then 'demo' else 'registered' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- 20260911000200_revoke_trigger_function_execute.sql과 같은 이유로 다시 못박습니다.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. enforce_session_funding_rules — 계정 유형↔재원 짝 + 데모 동의 가드
--
--   D35-2가 프록시에 두기로 한 가드("익명 사용자는 trial_shared 세션을 만들 수 없다")를
--   **DB에도 둡니다.** 이유는 D30·D35-1 ③과 같습니다 — 라우트 분기 하나를 빠뜨리면
--   익명 계정이 체험 정원 12세션을 먹기 시작하고, 증상은 "체험 정원이 왜인지 부족하다"로만
--   보여 원인을 찾을 수 없습니다. 재원↔버킷 짝은 예약 함수가, 계정↔재원 짝은 여기가 맡습니다.
--
--   (1) 재원 불변 트리거는 **그대로**입니다. `demo`를 추가해도 깨지지 않습니다 —
--       불변 규칙은 값의 목록이 아니라 "INSERT 이후 바뀌면 예외"이기 때문입니다.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_session_funding_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text;
begin
  -- (1) 재원 불변: 세션이 시작된 뒤 재원을 갈아타지 못한다 (D28·D29). 값 목록과 무관합니다.
  if tg_op = 'UPDATE' and new.funding_source is distinct from old.funding_source then
    raise exception 'funding_source is immutable (session %)', old.id;
  end if;

  -- (2) 계정 유형 ↔ 재원 짝 (D35-2). INSERT에서만 검사하면 충분합니다 —
  --     재원은 (1)로 불변이고 account_type은 가입 시점에 확정돼 바뀌지 않습니다.
  if tg_op = 'INSERT' then
    select p.account_type into v_account_type
      from public.profiles p where p.id = new.user_id;

    if v_account_type = 'demo' and new.funding_source <> 'demo' then
      raise exception 'account_funding_mismatch:demo'
        using errcode = 'P0001',
              hint = 'anonymous (demo) accounts may only create funding_source = demo sessions';
    end if;

    if v_account_type is distinct from 'demo' and new.funding_source = 'demo' then
      raise exception 'account_funding_mismatch:%', coalesce(v_account_type, 'unknown')
        using errcode = 'P0001',
              hint = 'funding_source = demo requires an anonymous (demo) account';
    end if;
  end if;

  -- (3) 체험·데모 세션은 동의 없이 ready 이후로 갈 수 없다 (D29 · D35-3)
  --     면제 4개는 sessions_snapshot_required_after_ready와 같은 목록입니다.
  --     트리거가 검사하는 것은 "동의 행이 있는가"까지입니다.
  --     "현재 문구 버전에 동의했는가"(trial: D29 버전 / demo: demo-1.0.0)는 서버 가드의 책임입니다.
  if new.funding_source in ('trial_shared', 'demo')
     and new.status not in ('created', 'configuring', 'canceled', 'failed')
     and not exists (
       select 1 from public.trial_consents c where c.user_id = new.user_id
     ) then
    raise exception 'trial consent required before ready (session %)', new.id;
  end if;

  return new;
end $$;

revoke execute on function public.enforce_session_funding_rules() from public, anon, authenticated;
