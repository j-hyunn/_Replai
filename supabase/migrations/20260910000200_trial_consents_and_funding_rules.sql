-- 04_data_layer.md 10절 #13 — D29 체험 동의 + 재원 규칙 트리거
--   트리거가 #4가 아니라 여기 있는 이유: enforce_session_funding_rules()가 trial_consents를
--   조회하므로 그 테이블이 생긴 뒤에 붙여야 합니다(10절).

create table public.trial_consents (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  granted_at          timestamptz not null default now(),
  consent_version     text not null,
  -- 화면에 렌더된 문구 원문(공백 정규화 후)의 SHA-256 hex. 서버가 계산합니다.
  consent_text_sha256 text not null,
  -- 동의 사실은 세션이 지워져도 남아야 합니다. 링크만 끊깁니다(2절).
  session_id          uuid references public.interview_sessions (id) on delete set null,

  constraint trial_consents_version_len check (char_length(consent_version) between 1 and 20),
  constraint trial_consents_sha256_format check (consent_text_sha256 ~ '^[0-9a-f]{64}$'),
  -- 인덱스 #21 — 버전당 1건 + 동의 가드 조회. 멱등 기록의 충돌 키
  constraint trial_consents_user_version_unique unique (user_id, consent_version)
);

comment on table public.trial_consents is
  '체험 세션 데이터 처리 동의. 누가·언제·어떤 문구 버전에 + 문구 해시 (04_data_layer.md 3.16절)';

alter table public.trial_consents enable row level security;

-- 본인 행 읽기만 허용합니다. insert/update/delete 정책은 만들지 않습니다 —
-- 클라이언트 INSERT를 허용하면 동의 화면을 거치지 않고 게이트를 우회할 수 있습니다.
create policy "trial_consents_select_own" on public.trial_consents
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 재원 규칙 트리거 — 불변성(D28)과 동의(D29)를 DB가 보증합니다.
-- 둘 다 여러 행에 걸친 조건이라 CHECK로 표현할 수 없습니다.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_session_funding_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- (1) 재원 불변: 세션이 시작된 뒤 공용 ↔ 사용자 키를 갈아타지 못한다 (D28·D29)
  if tg_op = 'UPDATE' and new.funding_source is distinct from old.funding_source then
    raise exception 'funding_source is immutable (session %)', old.id;
  end if;

  -- (2) 체험 세션은 동의 없이 ready 이후로 갈 수 없다 (D29)
  --     면제 4개는 sessions_snapshot_required_after_ready와 같은 목록입니다.
  --     트리거가 검사하는 것은 "동의 행이 있는가"까지입니다.
  --     "현재 문구 버전에 동의했는가"는 서버 가드의 책임입니다(R9).
  if new.funding_source = 'trial_shared'
     and new.status not in ('created', 'configuring', 'canceled', 'failed')
     and not exists (
       select 1 from public.trial_consents c where c.user_id = new.user_id
     ) then
    raise exception 'trial consent required before ready (session %)', new.id;
  end if;

  return new;
end $$;

create trigger trg_sessions_funding_rules
  before insert or update on public.interview_sessions
  for each row execute function public.enforce_session_funding_rules();
