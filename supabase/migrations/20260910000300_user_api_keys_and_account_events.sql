-- 04_data_layer.md 10절 #14 — D28 사용자 API 키(Vault 암호화) + 계정 감사 로그
--
--   ★ public 스키마 어디에도 키 원문 컬럼이 존재하지 않습니다. 원문은 vault.secrets의 암호문뿐이고
--     노출 가능한 값은 key_last4 4자뿐입니다(3.15절 5중 강제).
--   ★ vault 스키마를 PostgREST 노출 스키마 목록에 추가하지 않습니다.

-- Supabase 프로젝트에 기본 활성화되어 있습니다. 존재만 확인합니다.
create extension if not exists supabase_vault with schema vault;

create table public.user_api_keys (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  provider          text not null default 'google',
  -- vault.secrets(id)를 가리키는 핸들. 크로스 스키마 FK는 걸지 않습니다(3.15절).
  vault_secret_id   uuid not null unique,
  key_last4         text not null,
  status            text not null default 'connected',
  last_verified_at  timestamptz,
  last_failure_code text,
  last_failure_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint user_api_keys_provider_check check (provider in ('google')),
  -- 정확히 4자. "마스킹 컬럼에 전체 키가 들어가는" 가장 흔한 사고를 DB가 거부합니다.
  constraint user_api_keys_last4_format check (key_last4 ~ '^[A-Za-z0-9_-]{4}$'),
  constraint user_api_keys_status_check check (status in ('connected', 'invalid')),
  constraint user_api_keys_failure_code_check check (
    last_failure_code is null
    or last_failure_code in ('auth_rejected', 'quota_exhausted', 'unknown')
  ),
  -- invalid인데 사유가 없으면 사용자에게 무엇을 고치라고 말할 수 없습니다(6.5.6절).
  constraint user_api_keys_status_shape check (
    (status = 'connected') or (last_failure_code is not null)
  )
);

comment on table public.user_api_keys is
  '사용자 Gemini API 키. 원문은 Vault에만 있습니다. RLS 켜고 정책 0개 (04_data_layer.md 3.15절)';

create trigger trg_user_api_keys_updated_at
  before update on public.user_api_keys
  for each row execute function public.set_updated_at();

-- 인덱스 #20은 unique (vault_secret_id)가 겸합니다. PK가 user_id이므로 "내 키 조회"에 추가 인덱스가 없습니다.

-- authenticated/anon은 vault_secret_id라는 핸들조차 읽을 수 없습니다.
alter table public.user_api_keys enable row level security;

-- 저장(연결·교체): 원문은 인자로만 지나가고 public 어디에도 남지 않습니다.
create or replace function public.set_user_api_key(
  p_user_id uuid,
  p_key     text,
  p_last4   text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  select k.vault_secret_id into v_old
    from public.user_api_keys k where k.user_id = p_user_id;

  -- vault.secrets.name은 unique입니다. 초 단위 접미사만으로는 같은 초의 재시도·연속 교체가
  -- 충돌해 키 저장이 실패하므로 난수 접미사를 함께 붙입니다.
  v_new := vault.create_secret(
    p_key,
    'user_api_key:' || p_user_id::text || ':' || extract(epoch from clock_timestamp())::bigint
      || ':' || replace(gen_random_uuid()::text, '-', ''),
    'Gemini API key (BYOK)'
  );

  insert into public.user_api_keys (user_id, vault_secret_id, key_last4, status,
                                    last_verified_at, last_failure_code, last_failure_at)
  values (p_user_id, v_new, p_last4, 'connected', now(), null, null)
  on conflict (user_id) do update
     set vault_secret_id   = excluded.vault_secret_id,
         key_last4         = excluded.key_last4,
         status            = 'connected',
         last_verified_at  = now(),
         last_failure_code = null,
         last_failure_at   = null,
         updated_at        = now();

  -- 교체 = 옛 암호문 파기. 같은 트랜잭션이라 부분 삭제 상태가 생기지 않습니다.
  if v_old is not null then
    delete from vault.secrets where id = v_old;
  end if;
end $$;

-- 복호화(서버 전용): 이 함수 외에 원문을 얻는 경로가 없습니다.
create or replace function public.get_user_api_key(p_user_id uuid)
returns text
language sql
security definer
set search_path = public, vault
stable
as $$
  select s.decrypted_secret
    from public.user_api_keys k
    join vault.decrypted_secrets s on s.id = k.vault_secret_id
   where k.user_id = p_user_id and k.status = 'connected';
$$;

revoke execute on function public.set_user_api_key(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.get_user_api_key(uuid)             from public, anon, authenticated;
grant  execute on function public.set_user_api_key(uuid, text, text) to service_role;
grant  execute on function public.get_user_api_key(uuid)             to service_role;

-- 삭제 트리거 — 실제 삭제를 보증합니다(D28 4항).
-- 이 트리거가 없으면 계정을 삭제해도 암호문이 vault.secrets에 영원히 남습니다.
create or replace function public.purge_user_api_key_secret()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  delete from vault.secrets where id = old.vault_secret_id;
  return old;
end $$;

create trigger trg_user_api_keys_purge_secret
  before delete on public.user_api_keys
  for each row execute function public.purge_user_api_key_secret();

-- ---------------------------------------------------------------------------
-- account_events — 키 수명주기 감사 로그. session_events를 오염시키지 않습니다(3.17절).
-- ---------------------------------------------------------------------------

create table public.account_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  event_name  text not null,
  -- 키 원문·vault_secret_id 금지. 허용값은 key_last4·provider·정규화된 실패 코드뿐입니다.
  detail      jsonb,
  occurred_at timestamptz not null default now(),

  -- 여기만 값 CHECK를 겁니다: 보안 감사이고, 값이 5개로 닫혀 있으며,
  -- 기록 실패가 상태 전이 트랜잭션을 되돌리지 않습니다(3.17절).
  constraint account_events_event_name_check check (
    event_name in (
      'api_key_connected',
      'api_key_replaced',
      'api_key_disconnected',
      'api_key_marked_invalid',
      'trial_consent_granted'
    )
  )
);

comment on table public.account_events is
  '키 수명주기 감사 로그. 서버 전용 — RLS 켜고 정책 0개 (04_data_layer.md 3.17절)';

-- 인덱스 #22
create index idx_account_events_user_time
  on public.account_events (user_id, occurred_at);

alter table public.account_events enable row level security;
