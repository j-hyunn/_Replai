-- 04_data_layer.md 10절 #7 — evaluations / evaluation_scores / evaluation_citations
--   coach_payload · ai_contract_version · provider, 그리고 improvement의 not null 해제는
--   ALTER가 아니라 create table에 흡수합니다(10절).

create table public.evaluations (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.interview_sessions (id) on delete cascade,
  status              text not null default 'running',
  model_name          text,
  rubric_version      text not null default '1.0.0-draft',
  overall_score       numeric(3,2),
  summary             text,
  improvements        jsonb,   -- 개선점 3건 배열(오브젝트). 텍스트 한 덩어리 금지
  coach_payload       jsonb,
  ai_contract_version text,
  provider            text,
  attempt_count       int not null default 0,
  error_message       text,
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,

  constraint evaluations_status_check check (status in ('running', 'succeeded', 'failed')),
  constraint evaluations_overall_score_check check (
    overall_score is null or overall_score between 1.00 and 5.00
  ),
  -- 배열·스칼라가 들어가면 coach_payload->'model_answers'가 조용히 NULL이 됩니다(3.7절)
  constraint evaluations_coach_payload_shape check (
    coach_payload is null or jsonb_typeof(coach_payload) = 'object'
  ),
  constraint evaluations_ai_contract_version_len check (
    ai_contract_version is null or char_length(ai_contract_version) <= 40
  ),
  constraint evaluations_provider_len check (
    provider is null or char_length(provider) <= 40
  ),
  -- 평가자(Evaluator) 시도만 셉니다. 코치 워커는 이 컬럼을 절대 UPDATE하지 않습니다(D10).
  constraint evaluations_attempt_count_check check (attempt_count between 0 and 3)
);

comment on table public.evaluations is '평가 실행 1건 (04_data_layer.md 3.7절)';
comment on column public.evaluations.attempt_count is
  '평가자 재시도 횟수만. 코치 재시도는 session_events로 관측합니다(D10, 3.7절)';

-- 인덱스 #9 — 재평가 대비 최신 1건 조회
create index idx_evaluations_session_started
  on public.evaluations (session_id, started_at desc);

alter table public.evaluations enable row level security;

create policy "evaluations_select_own_session" on public.evaluations
  for select to authenticated using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = evaluations.session_id
        and s.user_id = (select auth.uid())
    )
  );
-- insert/update/delete 정책 없음 — 평가 워커(service_role) 전용

create table public.evaluation_scores (
  id                       uuid primary key default gen_random_uuid(),
  evaluation_id            uuid not null references public.evaluations (id) on delete cascade,
  -- RLS 단축용 비정규화(4절): 조인 깊이를 3단에서 1단으로 줄입니다
  session_id               uuid not null references public.interview_sessions (id) on delete cascade,
  axis                     text not null,
  score                    int,
  is_insufficient_evidence boolean not null default false,
  weight                   numeric(4,3) not null,
  rationale                text not null,
  -- 생산 주체가 코치이고 코치는 실패가 허용되므로 NULL 허용(조정 1).
  -- 길이 CHECK가 '' 저장 경로를 막아 "값 없음"을 NULL 하나로 표현합니다.
  improvement              text,

  constraint scores_axis_check check (
    axis in ('job_knowledge', 'logical_consistency', 'evidence_specificity', 'structure', 'communication')
  ),
  constraint scores_score_check check (score is null or score between 1 and 5),
  constraint scores_weight_check check (weight >= 0 and weight <= 1),
  constraint scores_improvement_len check (
    improvement is null or char_length(improvement) between 20 and 400
  ),
  -- 루브릭 3절 "근거 부족이면 score = NULL"을 양방향으로 강제
  constraint scores_evidence_shape check (
    (is_insufficient_evidence = true  and score is null)
    or
    (is_insufficient_evidence = false and score is not null)
  ),
  -- 인덱스 #10 — 축 중복 방지 + 조회 겸용
  constraint scores_evaluation_axis_unique unique (evaluation_id, axis)
);

comment on column public.evaluation_scores.weight is
  '페르소나 표의 정규화 전 원값. 제외 축이 생겨도 저장값을 고치지 않습니다(12.1절)';

-- 인덱스 #11 — RLS·리포트 조회
create index idx_scores_session on public.evaluation_scores (session_id);

alter table public.evaluation_scores enable row level security;

create policy "evaluation_scores_select_own_session" on public.evaluation_scores
  for select to authenticated using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = evaluation_scores.session_id
        and s.user_id = (select auth.uid())
    )
  );

create table public.evaluation_citations (
  id             uuid primary key default gen_random_uuid(),
  score_id       uuid not null references public.evaluation_scores (id) on delete cascade,
  session_id     uuid not null references public.interview_sessions (id) on delete cascade,
  turn_id        uuid not null references public.turns (id) on delete cascade,
  quote_text     text not null,
  -- JS UTF-16 오프셋입니다(서버 indexOf 산출값). Postgres substring()에 넣지 마세요(R3).
  quote_start    int not null,
  quote_end      int not null,
  comment        text,
  citation_index int not null default 0,

  constraint citations_quote_text_len check (char_length(quote_text) between 20 and 160),
  constraint citations_quote_start_check check (quote_start >= 0),
  constraint citations_offset_order check (quote_end > quote_start),
  constraint citations_index_check check (citation_index between 0 and 2),
  -- 인덱스 #12 — 축당 최대 3건 강제 + 조회 겸용
  constraint citations_score_index_unique unique (score_id, citation_index)
);

comment on column public.evaluation_citations.quote_start is
  'JS UTF-16 오프셋. DB 안에서 이 값으로 원문을 다시 자르지 마세요(13.3절 R3)';

-- 인덱스 #13 — RLS·리포트 조회
create index idx_citations_session on public.evaluation_citations (session_id);

alter table public.evaluation_citations enable row level security;

create policy "evaluation_citations_select_own_session" on public.evaluation_citations
  for select to authenticated using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = evaluation_citations.session_id
        and s.user_id = (select auth.uid())
    )
  );
