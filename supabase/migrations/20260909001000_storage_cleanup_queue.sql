-- 04_data_layer.md 10절 #10 — storage_cleanup_queue + 삭제 트리거
--   FK CASCADE는 Storage 객체를 지우지 않습니다. 트리거가 경로를 큐에 남기고
--   서버 스위퍼가 Storage API로 실제 삭제합니다(3.12절·9.4절).

create table public.storage_cleanup_queue (
  id            uuid primary key default gen_random_uuid(),
  bucket_id     text not null default 'documents',
  storage_path  text not null,
  -- 계정 삭제 시 profiles가 먼저 사라질 수 있으므로 FK를 걸지 않습니다
  owner_user_id uuid,
  status        text not null default 'pending',
  attempt_count int not null default 0,
  last_error    text,
  enqueued_at   timestamptz not null default now(),
  processed_at  timestamptz,

  constraint storage_cleanup_queue_status_check check (status in ('pending', 'done', 'failed'))
);

comment on table public.storage_cleanup_queue is
  'Storage 객체 실제 삭제 보장 큐. 서버 전용 — RLS 켜고 정책 0개 (04_data_layer.md 3.12절)';

-- 인덱스 #17 — 스위퍼(부분 인덱스)
create index idx_cleanup_pending
  on public.storage_cleanup_queue (enqueued_at)
  where status = 'pending';

-- 파일 경로는 개인정보입니다. RLS를 켜되 정책을 하나도 만들지 않습니다 → 전면 차단.
-- service_role만 RLS를 우회해 접근합니다.
alter table public.storage_cleanup_queue enable row level security;

create or replace function public.enqueue_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.storage_path is not null then
    insert into public.storage_cleanup_queue (bucket_id, storage_path, owner_user_id)
    values ('documents', old.storage_path, old.user_id);
  end if;
  return old;
end $$;

create trigger trg_documents_cleanup
  before delete on public.documents
  for each row execute function public.enqueue_storage_cleanup();
