-- 04_data_layer.md 10절 #8 — report_feedback(지표 4) / score_disputes(지표 5)
--   이 두 테이블만 클라이언트 INSERT를 허용합니다. user_id 확인과 세션 소유 확인을 둘 다 겁니다(5.2절).

create table public.report_feedback (
  id         uuid primary key default gen_random_uuid(),
  -- 인덱스 #14 — 세션당 1건. upsert의 충돌 키
  session_id uuid not null unique references public.interview_sessions (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  is_helpful boolean not null,
  comment    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_feedback_comment_len check (comment is null or char_length(comment) <= 1000)
);

comment on table public.report_feedback is '리포트 도움 여부. 지표 4 (04_data_layer.md 3.10절)';

create trigger trg_report_feedback_updated_at
  before update on public.report_feedback
  for each row execute function public.set_updated_at();

alter table public.report_feedback enable row level security;

create policy "report_feedback_select_own" on public.report_feedback
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "report_feedback_insert_own" on public.report_feedback
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.interview_sessions s
      where s.id = report_feedback.session_id
        and s.user_id = (select auth.uid())
    )
  );

create policy "report_feedback_update_own" on public.report_feedback
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
-- delete 정책 없음 — 세션 삭제로만 사라집니다

create table public.score_disputes (
  id          uuid primary key default gen_random_uuid(),
  score_id    uuid not null references public.evaluation_scores (id) on delete cascade,
  -- 값이 있으면 인용 단위, NULL이면 축 단위 이의
  citation_id uuid references public.evaluation_citations (id) on delete cascade,
  session_id  uuid not null references public.interview_sessions (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  reason_code text not null,
  comment     text,
  created_at  timestamptz not null default now(),

  constraint score_disputes_reason_code_check check (
    reason_code in ('transcription_error', 'misinterpreted', 'score_too_low', 'other')
  ),
  constraint score_disputes_comment_len check (comment is null or char_length(comment) <= 1000)
);

comment on table public.score_disputes is
  '축·인용 단위 이의 제기. 수집만 하고 재평가를 유발하지 않습니다(D4, 3.11절)';

-- 인덱스 #15 — 중복 제기 방지(지표 5가 중복 클릭으로 부풀지 않게)
create unique index uq_disputes_axis
  on public.score_disputes (score_id)
  where citation_id is null;

create unique index uq_disputes_citation
  on public.score_disputes (citation_id)
  where citation_id is not null;

-- 인덱스 #16 — RLS·리포트
create index idx_disputes_session on public.score_disputes (session_id);

alter table public.score_disputes enable row level security;

create policy "score_disputes_select_own" on public.score_disputes
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "score_disputes_insert_own" on public.score_disputes
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.interview_sessions s
      where s.id = score_disputes.session_id
        and s.user_id = (select auth.uid())
    )
  );
-- update/delete 정책 없음 — 제기 후 수정·철회는 MVP 밖
