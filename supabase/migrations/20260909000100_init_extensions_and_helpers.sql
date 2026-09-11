-- 04_data_layer.md 10절 #1 — 확장 확인과 공통 헬퍼
--
-- pgcrypto는 Supabase 프로젝트에 기본 설치되어 있습니다(extensions 스키마).
-- if not exists이므로 이미 있으면 아무것도 하지 않습니다.
-- public이 아니라 extensions에 두는 이유: public에 설치하면 확장 함수가
-- 생성된 타입(database.types.ts)의 Functions에 섞여 들어옵니다.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- updated_at을 가진 모든 테이블이 공유하는 트리거 함수 (04_data_layer.md 3절 공통)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;

comment on function public.set_updated_at() is
  'updated_at을 now()로 갱신하는 공통 before update 트리거 함수 (04_data_layer.md 3절)';
