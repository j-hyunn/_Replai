-- ⚠️ 마이그레이션이 아닙니다. `supabase/migrations/`에 넣지 마세요.
--
-- Supabase가 프로젝트에 기본 제공하는 것들(역할·auth·storage·vault·realtime 퍼블리케이션)을
-- 맨몸 PostgreSQL에 최소한으로 재현하는 로컬 검증용 부트스트랩입니다.
-- Docker/Supabase CLI를 쓸 수 없는 환경에서 `supabase/migrations/`의 14개 파일을
-- 실제로 적용해 검증하기 위한 것이며, 원격 프로젝트에는 절대 적용하지 않습니다.
--
-- 사용: supabase/dev/apply-local.sh 참조.

-- ── 역할 ────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    -- 실제 Supabase의 service_role은 RLS를 우회합니다.
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase의 기본 권한 구성을 재현합니다. 이것이 있어야 "RLS가 유일한 방어선"이라는
-- 전제와 5.4절 세 번째 쿼리(함수 실행 권한)가 의미를 가집니다.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ── auth ────────────────────────────────────────────────────────────────────
create schema if not exists auth;

create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;

-- ── storage ─────────────────────────────────────────────────────────────────
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

-- ── vault ───────────────────────────────────────────────────────────────────
-- 실제 supabase_vault는 pgsodium 기반 암호화입니다. 여기서는 마이그레이션 #14의
-- 호출 형태(create_secret / decrypted_secrets / secrets 삭제)만 재현합니다.
-- **암호화 자체를 검증하지는 않습니다** — 원격 적용 시 실제 확장이 대체합니다.
create schema if not exists vault;

create table if not exists vault.secrets (
  id          uuid primary key default gen_random_uuid(),
  name        text unique,
  description text,
  secret      text not null,
  created_at  timestamptz not null default now()
);

create or replace view vault.decrypted_secrets as
  select s.id, s.name, s.description, s.secret as decrypted_secret, s.created_at
    from vault.secrets s;

create or replace function vault.create_secret(
  new_secret text, new_name text default null, new_description text default ''
) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  insert into vault.secrets (secret, name, description)
  values (new_secret, new_name, new_description)
  returning id into v_id;
  return v_id;
end $$;

-- ── realtime ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
