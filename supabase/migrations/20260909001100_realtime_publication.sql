-- 04_data_layer.md 10절 #11 — Realtime
--   구독 대상은 interview_sessions 한 테이블뿐입니다(8절).
--   Realtime도 RLS를 따르므로 sessions_select_own이 남의 세션 변경을 차단합니다.

-- supabase_realtime 퍼블리케이션은 Supabase 프로젝트에 기본 존재합니다.
-- 없는 환경(로컬 검증 등)에서도 이 파일이 적용되도록 존재 여부만 확인합니다.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'interview_sessions'
  ) then
    alter publication supabase_realtime add table public.interview_sessions;
  end if;
end $$;

-- PK 기반. 전체 행 전송은 불필요합니다.
alter table public.interview_sessions replica identity default;
