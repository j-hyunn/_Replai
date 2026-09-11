-- 04_data_layer.md 5.4절 — RLS 점검 쿼리 3개. **셋 다 0행이어야 합니다.**
-- qa-inspector의 회귀 검사 항목입니다(5.4절 마지막 줄).

\echo '(1) RLS가 꺼진 public 테이블 — 0행이어야 함'
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;

\echo '(2) RLS는 켰지만 select 정책이 하나도 없는 테이블 — 0행이어야 함 (서버 전용 5개는 의도적 예외)'
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
  and c.relname not in (
        'storage_cleanup_queue',
        'ai_quota_ledger', 'ai_quota_reservations',   -- 2026-09-10 D27
        'user_api_keys', 'account_events'             -- 2026-09-10 D28
      )
  and not exists (select 1 from pg_policies p
                  where p.schemaname = 'public' and p.tablename = c.relname
                    and p.cmd in ('SELECT','ALL'));

\echo '(3) anon/authenticated가 실행할 수 있는 키·예약 함수 — 0행이어야 함'
select p.proname, r.rolname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as r(rolname)
where n.nspname = 'public'
  and p.proname in ('get_user_api_key', 'set_user_api_key',
                    'reserve_session_quota', 'release_session_quota', 'consume_session_quota')
  and has_function_privilege(r.rolname, p.oid, 'EXECUTE');
