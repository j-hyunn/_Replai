-- 04_data_layer.md 10절 #6 — session_events (상태 전이 감사 로그)
--   from_status / to_status에 interview_sessions.status와 같은 11개 값 CHECK를 겁니다.
--   지표 1·2가 이 로그로 계산되므로 오타 한 글자가 지표를 망칩니다(3.6절).

create table public.session_events (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.interview_sessions (id) on delete cascade,
  from_status text,
  to_status   text not null,
  trigger     text not null,
  event_name  text not null,
  detail      jsonb,
  occurred_at timestamptz not null default now(),

  constraint session_events_from_status_check check (
    from_status is null or from_status in (
      'created', 'configuring', 'ready', 'in_progress', 'paused', 'completed',
      'evaluating', 'evaluated', 'failed', 'abandoned', 'canceled'
    )
  ),
  constraint session_events_to_status_check check (
    to_status in (
      'created', 'configuring', 'ready', 'in_progress', 'paused', 'completed',
      'evaluating', 'evaluated', 'failed', 'abandoned', 'canceled'
    )
  ),
  constraint session_events_trigger_check check (
    trigger in ('user_action', 'ai_completion', 'timeout', 'system_error', 'scheduler')
  ),
  -- 값 CHECK를 두지 않는 이유는 failure_reason과 같습니다(6.4절).
  -- 관측 이벤트가 늘 때마다 마이그레이션이 필요해지고, CHECK 위반이
  -- 상태 전이 트랜잭션을 통째로 되돌립니다.
  constraint session_events_event_name_len check (char_length(event_name) between 1 and 64)
);

comment on table public.session_events is
  '상태 전이 감사 로그. 비전이 이벤트(score_card_viewed, quota_* 등)는 from_status = to_status = 그 시점 세션 status로 채웁니다(3.6절)';

-- 인덱스 #8 — 감사 로그, 지표 1·2·5
create index idx_session_events_session_time
  on public.session_events (session_id, occurred_at);

alter table public.session_events enable row level security;

create policy "session_events_select_own_session" on public.session_events
  for select to authenticated using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_events.session_id
        and s.user_id = (select auth.uid())
    )
  );
-- insert/update/delete 정책 없음 — 서버 전용
