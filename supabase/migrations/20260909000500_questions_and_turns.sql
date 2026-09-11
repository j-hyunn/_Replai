-- 04_data_layer.md 10절 #5 — questions(질문 트리) + turns(대화 로그)
--   archetype_id · seed_version · probe_hints는 ALTER가 아니라 create table에 흡수(10절).

create table public.questions (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references public.interview_sessions (id) on delete cascade,
  parent_question_id uuid references public.questions (id) on delete cascade,
  depth              int not null default 0,
  order_index        int not null,
  question_kind      text not null,
  question_text      text not null,
  source_span        text,
  target_axis        text,
  archetype_id       text,
  seed_version       text,
  probe_hints        jsonb,
  asked_at           timestamptz,
  created_at         timestamptz not null default now(),

  constraint questions_depth_check check (depth between 0 and 8),
  constraint questions_order_index_check check (order_index >= 0),
  constraint questions_kind_check check (question_kind in ('main', 'follow_up')),
  constraint questions_text_len check (char_length(question_text) between 1 and 2000),
  constraint questions_target_axis_check check (
    target_axis is null or target_axis in (
      'job_knowledge', 'logical_consistency', 'evidence_specificity', 'structure', 'communication'
    )
  ),
  constraint questions_archetype_id_len check (
    archetype_id is null or char_length(archetype_id) between 1 and 80
  ),
  constraint questions_seed_version_len check (
    seed_version is null or char_length(seed_version) <= 20
  ),
  -- 문자열 배열 0–3개. 각 항목의 5–80자는 애플리케이션 검증(3.4절)
  constraint questions_probe_hints_shape check (
    probe_hints is null
    or (jsonb_typeof(probe_hints) = 'array' and jsonb_array_length(probe_hints) <= 3)
  ),
  -- 트리 정합. depth = 부모 depth + 1은 단일 행 CHECK로 표현 불가 → 서버 책임(QA 항목)
  constraint questions_kind_shape check (
    (question_kind = 'main'      and parent_question_id is null and depth = 0)
    or
    (question_kind = 'follow_up' and parent_question_id is not null and depth > 0)
  ),
  -- 인덱스 #5 — 순서 중복 방지 + 세션별 질문 조회 겸용
  constraint questions_session_order_unique unique (session_id, order_index)
);

comment on table public.questions is '질문 트리. 지표 6의 원천 (04_data_layer.md 3.4절)';
comment on column public.questions.probe_hints is
  '["...","..."] 문자열 배열(0–3). 매 턴 면접관 입력이므로 재개 가능성이 이 컬럼에 걸려 있습니다(3.4절)';

-- 인덱스 #6 — 꼬리질문 트리 조회(부분 인덱스)
create index idx_questions_parent
  on public.questions (parent_question_id)
  where parent_question_id is not null;

alter table public.questions enable row level security;

create policy "questions_select_own_session" on public.questions
  for select to authenticated using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = questions.session_id
        and s.user_id = (select auth.uid())
    )
  );
-- insert/update/delete 정책 없음 — 서버 전용

create table public.turns (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.interview_sessions (id) on delete cascade,
  question_id     uuid references public.questions (id) on delete cascade,
  seq             int not null,
  role            text not null,
  transcript_text text not null,
  transcript_raw  text,          -- STT 원문 보존
  is_corrected    boolean not null default false,
  modality        text not null,
  stt_confidence  numeric(4,3),
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz not null default now(),

  constraint turns_seq_check check (seq >= 0),
  constraint turns_role_check check (role in ('interviewer', 'candidate')),
  constraint turns_transcript_text_len check (char_length(transcript_text) >= 1),
  constraint turns_modality_check check (modality in ('voice', 'text')),
  constraint turns_stt_confidence_check check (
    stt_confidence is null or stt_confidence between 0 and 1
  ),
  -- 면접관 발화는 편집 불가이므로 is_corrected = true는 후보 발화에만 성립(3.5절)
  constraint turns_correction_shape check (
    (is_corrected = false) or (transcript_raw is not null and role = 'candidate')
  ),
  -- 인덱스 #7 — 순번 중복 방지 + 세션별 로그 조회 겸용
  constraint turns_session_seq_unique unique (session_id, seq)
);

comment on table public.turns is
  '대화 로그(진실의 원천). 오디오 경로 컬럼은 없습니다 — 음성 원본 미저장 (04_data_layer.md 3.5절)';

alter table public.turns enable row level security;

create policy "turns_select_own_session" on public.turns
  for select to authenticated using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = turns.session_id
        and s.user_id = (select auth.uid())
    )
  );
-- insert/update/delete 정책 없음 — 전사 정정도 API 라우트 경유(서버 전용)
