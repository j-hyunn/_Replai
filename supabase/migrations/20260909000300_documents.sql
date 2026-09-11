-- 04_data_layer.md 10절 #3 — documents (이력서·JD) + CHECK + RLS + 정책 + 인덱스

create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  doc_type          text not null,
  source_type       text not null,
  title             text not null,
  storage_path      text unique,
  mime_type         text,
  byte_size         bigint,
  extracted_text    text,
  extraction_status text not null default 'pending',
  extraction_error  text,
  is_edited_by_user boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint documents_doc_type_check check (doc_type in ('resume', 'job_description')),
  constraint documents_source_type_check check (source_type in ('file', 'text')),
  constraint documents_title_len check (char_length(title) between 1 and 120),
  -- 10MB 상한
  constraint documents_byte_size_check check (byte_size is null or byte_size <= 10485760),
  constraint documents_extracted_text_len check (
    extracted_text is null or char_length(extracted_text) <= 200000
  ),
  constraint documents_extraction_status_check check (
    extraction_status in ('pending', 'running', 'succeeded', 'failed', 'not_required')
  ),
  -- 입력 두 경로를 스키마로 강제 (3.2절)
  constraint documents_source_shape check (
    (source_type = 'file' and storage_path is not null and mime_type is not null)
    or
    (source_type = 'text' and storage_path is null and extraction_status = 'not_required')
  )
);

comment on table public.documents is '이력서·JD 원본과 추출 텍스트 (04_data_layer.md 3.2절)';
comment on column public.documents.storage_path is
  'documents 버킷 내 경로. unique — 서로 다른 행이 같은 객체를 가리켜 삭제가 꼬이는 것을 막습니다';

create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- 인덱스 #1 — /documents 보관함 목록
create index idx_documents_user_created
  on public.documents (user_id, created_at desc);

alter table public.documents enable row level security;

create policy "documents_select_own" on public.documents
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "documents_insert_own" on public.documents
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "documents_update_own" on public.documents
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "documents_delete_own" on public.documents
  for delete to authenticated using ((select auth.uid()) = user_id);
