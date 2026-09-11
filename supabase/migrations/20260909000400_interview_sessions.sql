-- 04_data_layer.md 10절 #4 — interview_sessions
--   상태 CHECK 11개 값의 원본은 01_state_machine.md 1절입니다(문자 단위 복사).
--   D6(스냅샷 2컬럼) · D28(funding_source, pause_reason 5개 값)은 ALTER가 아니라
--   처음부터 create table에 흡수합니다(10절 흡수 규칙).

create table public.interview_sessions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.profiles (id) on delete cascade,
  status                  text not null default 'created',
  job_role                text,
  persona                 text,
  modality                text not null default 'voice',
  current_modality        text not null default 'voice',
  -- 출처 링크일 뿐입니다. 면접 근거 텍스트는 아래 *_text_snapshot에 있습니다(D6, 2절).
  resume_document_id      uuid references public.documents (id) on delete set null,
  jd_document_id          uuid references public.documents (id) on delete set null,
  resume_text_snapshot    text,
  jd_text_snapshot        text,
  main_question_budget    int not null default 4,
  max_follow_up_depth     int not null default 4,
  max_turns               int not null default 20,
  max_duration_min        int not null default 30,
  -- D28 — not null이고 기본값이 없습니다. 재원을 정하지 않은 INSERT는 즉시 실패해야 합니다(3.3절).
  funding_source          text not null,
  pause_reason            text,
  resumable_after         timestamptz,
  failure_reason          text,   -- CHECK 없음 (6.4절)
  context_summary         text,
  started_at              timestamptz,
  ended_at                timestamptz,
  paused_at               timestamptz,
  report_first_viewed_at  timestamptz,
  source_session_id       uuid references public.interview_sessions (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- 상태 11개 (01_state_machine.md 1절에서 문자 단위 복사)
  constraint interview_sessions_status_check check (status in (
    'created',
    'configuring',
    'ready',
    'in_progress',
    'paused',
    'completed',
    'evaluating',
    'evaluated',
    'failed',
    'abandoned',
    'canceled'
  )),

  constraint sessions_job_role_check check (
    job_role is null or job_role in ('pm', 'pd', 'security', 'ai', 'engineer')
  ),
  constraint sessions_persona_check check (
    persona is null or persona in ('deep_pressure', 'technical_probe')
  ),
  constraint sessions_modality_check check (modality in ('voice', 'text')),
  constraint sessions_current_modality_check check (current_modality in ('voice', 'text')),

  constraint sessions_resume_snapshot_len check (
    resume_text_snapshot is null or char_length(resume_text_snapshot) between 1 and 200000
  ),
  constraint sessions_jd_snapshot_len check (
    jd_text_snapshot is null or char_length(jd_text_snapshot) between 1 and 200000
  ),

  constraint sessions_main_question_budget_check check (main_question_budget between 1 and 12),
  constraint sessions_max_follow_up_depth_check check (max_follow_up_depth between 0 and 8),
  constraint sessions_max_turns_check check (max_turns between 1 and 60),
  constraint sessions_max_duration_min_check check (max_duration_min between 1 and 120),

  -- D28 — 2개 값
  constraint sessions_funding_source_check check (funding_source in ('trial_shared', 'byok')),

  -- pause_reason 5개 (01_state_machine.md 1절에서 문자 단위 복사. D28로 2개 추가)
  constraint sessions_pause_reason_check check (
    pause_reason is null or pause_reason in (
      'user_requested',
      'rate_limited',
      'connection_lost',
      'byok_key_invalid',
      'byok_quota_exhausted'
    )
  ),

  -- 상태-사유 정합 (3.3절)
  constraint sessions_pause_reason_only_when_paused check (
    (status = 'paused') or (pause_reason is null)
  ),
  constraint sessions_failure_reason_only_when_failed check (
    (status = 'failed') or (failure_reason is null)
  ),
  constraint sessions_no_self_source check (
    source_session_id is null or source_session_id <> id
  ),

  -- ready 이후에는 스냅샷 2개가 반드시 있어야 합니다(D6).
  -- 면제 4개: created/configuring은 복사 전, canceled는 어디서든 오고,
  --           failed는 configuring → failed(문서 추출 실패)로 스냅샷 없이 도달합니다.
  constraint sessions_snapshot_required_after_ready check (
    status in ('created', 'configuring', 'canceled', 'failed')
    or (resume_text_snapshot is not null and jd_text_snapshot is not null)
  )
);

comment on table public.interview_sessions is '면접 세션 (04_data_layer.md 3.3절)';
comment on column public.interview_sessions.funding_source is
  'trial_shared | byok. 세션 생성 시 확정되고 변경 불가(트리거가 강제 — #13). 기본값 없음(D28)';
comment on column public.interview_sessions.resume_text_snapshot is
  'configuring → ready 트랜잭션에서 documents.extracted_text를 복사. 이후 원본과 완전히 독립(D6)';

create trigger trg_interview_sessions_updated_at
  before update on public.interview_sessions
  for each row execute function public.set_updated_at();

-- 인덱스 #3 — /sessions 목록, /dashboard
create index idx_sessions_user_created
  on public.interview_sessions (user_id, created_at desc);

-- 인덱스 #4 — 워치독·자동 종료 스케줄러 전용 부분 인덱스 (D7: paused 시한 7일, 일 1회 스캔)
create index idx_sessions_status_updated
  on public.interview_sessions (status, updated_at)
  where status in ('paused', 'completed', 'evaluating');

alter table public.interview_sessions enable row level security;

-- 읽기만 클라이언트. insert/update/delete 정책은 만들지 않습니다 — 상태 전이는 서버(service_role) 전용(5.1절 3항).
create policy "sessions_select_own" on public.interview_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
