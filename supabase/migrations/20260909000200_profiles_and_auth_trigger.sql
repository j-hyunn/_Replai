-- 04_data_layer.md 10절 #2 — profiles + RLS + 정책 + 가입 트리거
-- 테이블 생성 / RLS 활성화 / 정책 생성을 한 파일에서 끝냅니다(5.1절 1항).

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text,
  default_job_role  text,
  -- D28 — 체험 1회 소진 시각. NULL이면 체험 가능(3.1절). 파생값이 아니라 컬럼입니다.
  trial_consumed_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint profiles_display_name_len check (
    display_name is null or char_length(display_name) <= 60
  ),
  constraint profiles_default_job_role_check check (
    default_job_role is null
    or default_job_role in ('pm', 'pd', 'security', 'ai', 'engineer')
  )
);

comment on table public.profiles is 'auth.users의 1:1 확장 (04_data_layer.md 3.1절)';
comment on column public.profiles.trial_consumed_at is
  '체험 1회 소진 시각. 첫 주질문 응답 턴 저장 트랜잭션에서 trial_consumed_at is null 조건으로 1회만 기록(D28)';

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 인덱스는 PK만 (사용자당 1행)

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- insert/delete 정책은 두지 않습니다.
--   insert : 아래 가입 트리거가 security definer로 생성
--   delete : 계정 삭제는 서버가 auth.users를 지워 CASCADE (9.3절)

-- 가입 시 profiles 자동 생성 (6.2절)
-- security definer + set search_path = public을 반드시 함께 씁니다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
