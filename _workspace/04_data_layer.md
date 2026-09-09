# 데이터 레이어 설계 (Supabase)

> 소유: `supabase-engineer` · 상태: **설계(design)** — 이 문서는 설계이며 마이그레이션 적용은 다음 Phase입니다.
> 입력: `docs/00_brief.md`(읽기 전용), `00_input/constraints.md`, `01_domain_model.md`, `01_state_machine.md`, `01_rubric.md`, `01_product_spec.md`
> **상태 값과 부속 enum의 원본은 `01_state_machine.md` 1절입니다.** 이 문서의 값은 그 코드 블록을 문자 단위로 복사한 것이며,
> 충돌하면 상태 머신 문서가 우선합니다.
> 서술은 한국어, 식별자(테이블·컬럼·enum 값·정책 이름·파일명)는 영어입니다. **번역 금지.**

## 변경 로그
- 2026-09-09 최초 작성. 테이블 12개, RLS 정책 전 테이블 적용, Storage 버킷 1개(`documents`), Realtime 1개 테이블, 실제 삭제(하드 삭제) 설계 포함.
- 2026-09-09 리더 조정 반영(`02_ai_contracts.md` 9절 불일치 #3~#7). **테이블 수·RLS 정책·Storage·Realtime·삭제 설계는 변경 없음.**
  - 조정 1 — 3.8절 `evaluation_scores.improvement`의 `not null`을 **해제**하고 길이 CHECK(20–400자)로 대체. 플레이스홀더 방식은 기각.
    12절에 UI가 NULL을 만나는 경우의 처리 지침 추가.
  - 조정 2 — 컬럼 6종 추가. 3.4절 `questions`에 `archetype_id text`·`seed_version text`·`probe_hints jsonb`,
    3.7절 `evaluations`에 `coach_payload jsonb`·`ai_contract_version text`·`provider text`. **전부 nullable, 기본값 없음, 신규 인덱스 없음.**
  - 조정 3 — 10절 마이그레이션 계획 갱신. 아직 적용 전이므로 별도 ALTER 파일을 만들지 않고 기존 CREATE TABLE 파일 #5·#7에 흡수.
    첫 적용 이후에는 새 ALTER 마이그레이션만 허용한다는 규칙을 명시.
  - 조정 4 — 13절을 "계약 문서 없음"에서 **실제 대조 결과**로 갱신. 11개 지점 전부 정합 확인, 남은 불일치 7건(R1~R7)을 나열.
  - 인덱스 총개수는 **17개 그대로**입니다(4절 표 변경 없음).
- 2026-09-09 **2차 조정 — 확정된 결정 반영**(`00_input/decisions.md`의 D1·D3·D4·D5·D6·D7·D8·D9·D10).
  이 문서의 잠정값 하나가 **뒤집혔습니다.**
  - **D6(스키마 변경)** — `documents`를 참조만 하던 방식을 **세션 시작 시 텍스트 스냅샷 복사**로 바꿉니다.
    3.3절에 `resume_text_snapshot` / `jd_text_snapshot` 2컬럼 추가, 복사 시점을 `configuring → ready` 전이로 고정,
    2절 FK 표와 9.2절 문서 삭제 정책을 재설계, 4절에 용량 영향 1줄 추가.
  - **D7** — `paused` 자동 종료 시한 24시간 → **7일**. 3.3절 부분 인덱스 서술 갱신(스케줄러 주기는 일 1회 그대로).
  - **D8** — 이메일 확인(confirm email) **끔**. 6.1절 갱신 + 남는 위험 명시.
  - **D3 / D9 / D10** — 각각 원본 파일 계속 보관 / 삭제 세션 집계 테이블 없음 / 코치 시도 횟수 컬럼 없음으로 확정.
    7.5절·9.5절·3.7절을 확정 서술로 바꾸고 14절의 `[결정 필요]`를 제거.
  - **D5** — `wrap_up`은 `turns`에만. `questions_kind_shape` CHECK 유지 → 13.3절 R7 **해소**. D10으로 R5도 **해소**.
  - **D1 / D4** — 저장 구조 변경 없음. 총점 가중치에서 `score = NULL` 축을 제외하는 규칙을 12절에 서버 책임으로 명시하고,
    `score_disputes`에 재평가 관련 컬럼이 필요 없음을 3.11절에 못박음.
  - 14절 "남은 결정"을 **"결정 완료"**로 교체. **테이블 수(12개)·RLS 정책·Storage 버킷·Realtime은 변경 없음.**

---

## 0. 설계 요약 (한 눈에)

| 항목 | 결정 |
|---|---|
| 테이블 수 | 12개 (전부 RLS 활성화, 예외 없음) |
| 소유권 판별 | 최상위는 `user_id = auth.uid()`, 세션 하위는 부모 세션을 통한 `exists` 서브쿼리 |
| 클라이언트 쓰기 | `documents` / `report_feedback` / `score_disputes` / `profiles`만 허용 |
| 서버 전용 쓰기 | 세션 상태·질문·턴·이벤트·평가 계열 전부 (`service_role`, RLS 우회). 클라이언트 쓰기 정책을 **아예 만들지 않음** |
| Storage | 비공개 버킷 `documents` 1개. 오디오 버킷 없음(음성 원본 미저장) |
| Realtime | `interview_sessions` 1개 테이블만 |
| 삭제 | 소프트 삭제 없음. FK CASCADE + Storage 정리 큐로 **실제 삭제** |
| 문서-세션 관계 | **스냅샷**(D6). 세션은 `configuring → ready`에서 `documents.extracted_text`를 복사해 보관하며, 이후 원본 문서에 의존하지 않음 |
| 인덱스 | 17개로 제한 (무료 티어 절약. 4절 트레이드오프 참조) |

---

## 1. 상태 값과 부속 enum (CHECK 제약의 원본 — 기계적 대조용)

아래 블록들은 `01_state_machine.md` 1절에서 **문자 단위로 복사**한 것입니다. 리더의 대조 대상입니다.

### `interview_sessions.status`

```
created
configuring
ready
in_progress
paused
completed
evaluating
evaluated
failed
abandoned
canceled
```

### `interview_sessions.pause_reason`

```
user_requested
rate_limited
connection_lost
```

### `interview_sessions.modality` / `interview_sessions.current_modality` / `turns.modality`

```
voice
text
```

### `interview_sessions.persona`

```
deep_pressure
technical_probe
```

### `interview_sessions.job_role` / `profiles.default_job_role`

```
pm
pd
security
ai
engineer
```

### 루브릭 축 식별자 `evaluation_scores.axis` (원본: `01_rubric.md` 1절)

```
job_knowledge
logical_consistency
evidence_specificity
structure
communication
```

### 이 문서에서 새로 정의하는 보조 enum (원본이 이 문서)

```
documents.doc_type            : resume | job_description
documents.source_type         : file | text
documents.extraction_status   : pending | running | succeeded | failed | not_required
questions.question_kind       : main | follow_up
turns.role                    : interviewer | candidate
session_events.trigger        : user_action | ai_completion | timeout | system_error | scheduler
evaluations.status            : running | succeeded | failed
score_disputes.reason_code    : transcription_error | misinterpreted | score_too_low | other
storage_cleanup_queue.status  : pending | done | failed
```

`interview_sessions.failure_reason`은 상태 머신 전이 표에 등장하는 값들
(`document_extraction_failed`, `evaluation_enqueue_failed`, `evaluation_failed`)을 포함하지만
운영 중 새 사유가 늘어날 수 있어 **CHECK를 걸지 않고 자유 텍스트**로 둡니다. 근거는 6.4절.

---

## 2. ERD

```
auth.users
   │ 1:1 (id 공유, on delete cascade)
   ▼
profiles ──1:N──► documents ──(0..1 storage object)──► storage: documents 버킷
   │                  ▲   ▲
   │                  │   └── jd_document_id     (on delete set null · 출처 링크만)
   │                  └────── resume_document_id (on delete set null · 출처 링크만)
   │                          ※ 면접 근거 텍스트는 세션의 *_text_snapshot 컬럼에 복사되어 있고,
   │                            위 두 FK는 "어느 문서에서 왔는가"를 가리키는 링크일 뿐입니다(D6).
   │ 1:N
   ▼
interview_sessions ──self──► source_session_id (재시도 복제 원본, on delete set null)
   ├─1:N─► questions ──self──► parent_question_id (꼬리질문 트리, on delete cascade)
   │            │ 1:N
   │            ▼
   ├─1:N─► turns ◄────────────────┐
   ├─1:N─► session_events          │ (인용의 출처 발화)
   ├─0..1─► report_feedback        │
   └─1:N─► evaluations             │
                 │ 1:N             │
                 ▼                 │
           evaluation_scores       │
                 │ 1:N             │
                 ▼                 │
           evaluation_citations ───┘
                 │ 1:N (citation_id, nullable)
                 ▼
           score_disputes ◄─1:N─ evaluation_scores (score_id)

storage_cleanup_queue  (독립 테이블. documents 삭제 트리거가 채움. 서버 전용)
```

**FK 삭제 규칙 요약**

| 관계 | on delete |
|---|---|
| `profiles.id → auth.users.id` | `cascade` |
| 모든 `user_id → profiles.id` | `cascade` |
| `interview_sessions.resume_document_id / jd_document_id → documents.id` | `set null` (D6로 재검토 — 아래) |
| `interview_sessions.source_session_id → interview_sessions.id` | `set null` |
| 세션 하위 전부(`questions`·`turns`·`session_events`·`evaluations`·`report_feedback`) | `cascade` |
| `questions.parent_question_id → questions.id` | `cascade` |
| `turns.question_id → questions.id` | `cascade` |
| `evaluation_scores.evaluation_id`, `evaluation_citations.score_id`, `score_disputes.score_id` | `cascade` |
| `evaluation_citations.turn_id → turns.id` | `cascade` |
| `score_disputes.citation_id → evaluation_citations.id` | `cascade` |

**`resume_document_id` / `jd_document_id`의 `set null` 재검토 (2026-09-09 D6)**

세 후보를 다시 놓고 봤습니다. 판단 기준은 "문서를 지웠을 때 과거 리포트가 온전한가"입니다.

| 후보 | 스냅샷 도입 **전** | 스냅샷 도입 **후**(현재) |
|---|---|---|
| `cascade` | 문서 삭제가 과거 세션·리포트를 통째로 지움 — **채택 불가** | 여전히 채택 불가(리포트를 지울 이유가 없음) |
| `restrict` | 문서 삭제를 세션이 막음 — 보관함에서 영영 못 지우는 문서가 생김 | 스냅샷이 있으므로 막을 이유가 사라짐 — **불필요** |
| **`set null`** | FK가 NULL이 되면 **무엇을 읽고 이 질문을 했는지가 사라짐**(D6 근거) | **채택.** 근거 텍스트는 세션 안에 남고, NULL이 되는 것은 "출처 문서로 가는 링크"뿐 |

즉 `set null`이라는 **동작 자체는 그대로지만 의미가 바뀌었습니다.** 스냅샷 이전에는 데이터 손실이었고,
지금은 링크 소실입니다. 컬럼의 역할도 "면접 컨텍스트의 출처"에서 **"출처 표시 + 지표 3(같은 이력서로 다시 하기)의 조인 키"**로
좁아집니다.

- **대가:** 문서를 지우면 그 문서로 본 세션들은 지표 3의 "같은 이력서 재도전" 묶음에서 빠집니다.
  스냅샷 텍스트로 동일성을 추정하지 **않습니다**(텍스트가 같아도 다른 문서일 수 있고, 사용자가 편집하면 같은 문서라도 달라집니다).
- **9.2절 문서 삭제 흐름의 경고 문구도 이에 맞춰 바뀝니다**(더 이상 "리포트가 손상된다"가 아닙니다).

---

## 3. 테이블 정의

전 테이블 공통: PK는 `id uuid default gen_random_uuid()`, 시각은 `timestamptz`(UTC), 이름은 snake_case.
`updated_at`이 있는 테이블은 공통 트리거 `set_updated_at()`을 붙입니다.

### 3.1 `profiles`

`auth.users`의 1:1 확장. 회원가입 시 트리거로 자동 생성합니다.

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `id` | uuid | PK, `references auth.users(id) on delete cascade` |
| `display_name` | text | NULL 허용, `check (display_name is null or char_length(display_name) <= 60)` |
| `default_job_role` | text | NULL 허용, `check (default_job_role is null or default_job_role in ('pm','pd','security','ai','engineer'))` |
| `created_at` | timestamptz | not null default now() |
| `updated_at` | timestamptz | not null default now() |

인덱스: PK만. (사용자당 1행이므로 추가 인덱스 불필요)

### 3.2 `documents` — 이력서·JD

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | not null, → `profiles(id) on delete cascade` |
| `doc_type` | text | not null, `check (doc_type in ('resume','job_description'))` |
| `source_type` | text | not null, `check (source_type in ('file','text'))` |
| `title` | text | not null, `check (char_length(title) between 1 and 120)` |
| `storage_path` | text | NULL 허용. 버킷 내 경로 |
| `mime_type` | text | NULL 허용 |
| `byte_size` | bigint | NULL 허용, `check (byte_size is null or byte_size <= 10485760)` — 10MB 상한 |
| `extracted_text` | text | NULL 허용, `check (extracted_text is null or char_length(extracted_text) <= 200000)` |
| `extraction_status` | text | not null default `'pending'`, `check (extraction_status in ('pending','running','succeeded','failed','not_required'))` |
| `extraction_error` | text | NULL 허용 |
| `is_edited_by_user` | boolean | not null default false |
| `created_at` / `updated_at` | timestamptz | not null default now() |

**교차 제약** (입력 두 경로를 스키마로 강제):
```sql
constraint documents_source_shape check (
  (source_type = 'file' and storage_path is not null and mime_type is not null)
  or
  (source_type = 'text' and storage_path is null and extraction_status = 'not_required')
)
```
- `storage_path` 유일성: `unique (storage_path)` — 서로 다른 행이 같은 객체를 가리켜 삭제가 꼬이는 것을 막습니다. NULL은 중복 허용되므로 텍스트 입력에는 영향이 없습니다.

인덱스: `idx_documents_user_created (user_id, created_at desc)` — `/documents` 보관함 목록 1개면 충분.

### 3.3 `interview_sessions`

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | not null, → `profiles(id) on delete cascade` |
| `status` | text | not null default `'created'`, **CHECK — 1절 11개 값** |
| `job_role` | text | NULL 허용(설정 전), `check (job_role is null or job_role in ('pm','pd','security','ai','engineer'))` |
| `persona` | text | NULL 허용, `check (persona is null or persona in ('deep_pressure','technical_probe'))` |
| `modality` | text | not null default `'voice'`, `check (modality in ('voice','text'))` |
| `current_modality` | text | not null default `'voice'`, `check (current_modality in ('voice','text'))` |
| `resume_document_id` | uuid | NULL 허용, → `documents(id) on delete set null` — **출처 링크**(2절) |
| `jd_document_id` | uuid | NULL 허용, → `documents(id) on delete set null` — **출처 링크**(2절) |
| `resume_text_snapshot` | text | NULL 허용, `check (resume_text_snapshot is null or char_length(resume_text_snapshot) between 1 and 200000)` — **D6** |
| `jd_text_snapshot` | text | NULL 허용, `check (jd_text_snapshot is null or char_length(jd_text_snapshot) between 1 and 200000)` — **D6** |
| `main_question_budget` | int | not null default 4, `check (main_question_budget between 1 and 12)` |
| `max_follow_up_depth` | int | not null default 4, `check (max_follow_up_depth between 0 and 8)` |
| `max_turns` | int | not null default 20, `check (max_turns between 1 and 60)` |
| `max_duration_min` | int | not null default 30, `check (max_duration_min between 1 and 120)` |
| `pause_reason` | text | NULL 허용, `check (pause_reason is null or pause_reason in ('user_requested','rate_limited','connection_lost'))` |
| `resumable_after` | timestamptz | NULL 허용 |
| `failure_reason` | text | NULL 허용 (CHECK 없음 — 6.4절) |
| `context_summary` | text | NULL 허용 |
| `started_at` / `ended_at` / `paused_at` | timestamptz | NULL 허용 |
| `report_first_viewed_at` | timestamptz | NULL 허용 — 지표 2 |
| `source_session_id` | uuid | NULL 허용, → `interview_sessions(id) on delete set null` — 지표 3 |
| `created_at` / `updated_at` | timestamptz | not null default now() |

**상태 CHECK (원본 복사)**
```sql
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
))
```

**상태-사유 정합 제약** (상태 머신 1절 "`paused`일 때만 값이 있고 그 외에는 NULL"의 DB 강제):
```sql
constraint sessions_pause_reason_only_when_paused check (
  (status = 'paused') or (pause_reason is null)
),
constraint sessions_failure_reason_only_when_failed check (
  (status = 'failed') or (failure_reason is null)
),
constraint sessions_no_self_source check (source_session_id is null or source_session_id <> id)
```

**스냅샷 컬럼 (2026-09-09 D6 — 잠정값 "참조만"을 뒤집음)**

`01_domain_model.md` 5절이 확정한 대로, 세션은 `documents`를 참조만 하지 않고 **면접 근거가 되는 텍스트를 자기 안에 복사해 둡니다.**
이력서를 고치거나 지워도 과거 세션의 "무엇을 읽고 이 질문을 했는가"가 남아야 하기 때문입니다.

| 항목 | 결정 |
|---|---|
| 타입 | `text` (원본 `documents.extracted_text`와 동일 타입) |
| nullable | **예.** `created` / `configuring` 구간에는 아직 값이 없습니다 |
| 길이 CHECK | `1 ~ 200000`자. 상한은 `documents.extracted_text`와 **같은 값**이고, 하한 1은 **빈 문자열 금지**입니다 |
| 기본값 | 없음(NULL) |
| 인덱스 | **두지 않습니다.** 세션 상세 조회 때 PK로 함께 읽힐 뿐, 검색 대상이 아닙니다 |
| 원본과의 관계 | 복사 이후 **완전히 독립.** 원본이 바뀌어도 갱신하지 않고, 원본이 지워져도 남습니다 |

- **하한을 0이 아니라 1로 두는 이유.** `extraction_status = 'succeeded'`인데 본문이 빈 문자열인 문서를 스냅샷하면
  면접관이 컨텍스트 없이 시작해 놓고도 스키마상으로는 "스냅샷 있음"으로 보입니다. `''`를 막으면
  "값이 없다"는 뜻이 오직 NULL 하나로 표현됩니다(3.8절 `improvement`와 같은 원칙).
- **`jd_text_snapshot`도 not null이 아닙니다.** 아래 상태 정합 제약이 `ready` 이후에만 값을 요구합니다.

**복사 시점 — `configuring → ready` 전이 (`01_state_machine.md` 2절)**

이 전이는 이미 "직군·페르소나·모달리티·이력서·JD가 모두 있고 이력서/JD의 `extraction_status = 'succeeded'`"를
가드로 걸고 있습니다. **추출이 성공했음이 보장되는 첫 지점이자, 컨텍스트 요약과 오프닝 질문을 만드는 지점**이므로
스냅샷 복사도 여기서 같은 트랜잭션 안에 넣습니다.

```
configuring → ready 트랜잭션 (서버, admin.ts):
  1. 가드 검사 (설정 5종 존재 + 양 문서 extraction_status = 'succeeded')
  2. resume_text_snapshot := (select extracted_text from documents where id = resume_document_id)
     jd_text_snapshot     := (select extracted_text from documents where id = jd_document_id)
  3. context_summary 생성 → 오프닝 주질문 1개 questions 삽입 → status = 'ready'
```

- **2단계와 3단계가 같은 트랜잭션이어야 합니다.** 요약과 오프닝 질문은 스냅샷된 텍스트에서 나온 것이어야 하는데,
  따로 커밋하면 그 사이 사용자가 `/documents`에서 원본을 편집해 **질문과 스냅샷이 서로 다른 원문을 가리키는** 세션이 생깁니다.
- **`ready → configuring` 되돌리기**(전이 표: 생성된 `questions` 폐기)에서는 **스냅샷도 함께 NULL로 되돌립니다.**
  설정을 바꾸러 갔다가 다른 이력서를 고르면 옛 스냅샷이 남아 새 질문과 어긋나기 때문입니다.
  다음 `configuring → ready`에서 다시 복사됩니다.
- **`in_progress` 이후에는 어떤 경로로도 다시 쓰지 않습니다.** 재개(`paused → in_progress`)는 읽기만 합니다.
- **재시도 복제**(`source_session_id`)로 새 세션을 만들 때도 스냅샷을 그대로 물려받지 않고,
  새 세션이 자기 `configuring → ready`에서 **그 시점의 원본을 다시 복사**합니다. "같은 이력서로 다시 봤을 때의 변화"를
  보려면 회차마다 그 회차가 실제로 읽은 텍스트가 남아야 합니다.

```sql
constraint sessions_snapshot_required_after_ready check (
  status in ('created','configuring','canceled','failed')
  or (resume_text_snapshot is not null and jd_text_snapshot is not null)
)
```
`ready` 이후의 모든 상태(`ready`·`in_progress`·`paused`·`completed`·`evaluating`·`evaluated`·`abandoned`)에서
스냅샷 2개가 반드시 있어야 합니다. 면제되는 4개 상태의 근거:
`created`/`configuring`은 아직 복사 전이고, `canceled`는 어느 상태에서든 올 수 있으며,
`failed`는 **`configuring → failed`**(문서 추출 실패) 경로가 있어 스냅샷 없이 도달할 수 있습니다(전이 표 95행).
`failed`를 면제하지 않으면 추출 실패 세션이 `failed`로도 넘어가지 못해 `configuring`에 갇힙니다 — 6.4절과 같은 종류의 사고입니다.

인덱스
- `idx_sessions_user_created (user_id, created_at desc)` — `/sessions` 목록, `/dashboard`
- `idx_sessions_status_updated (status, updated_at)` **부분 인덱스**: `where status in ('paused','completed','evaluating')` — 워치독·자동 종료 스케줄러 전용. 전체 인덱스 대신 부분 인덱스로 크기를 줄입니다.
  - **자동 종료 시한은 7일입니다**(2026-09-09 D7 — 잠정값 24시간을 뒤집음. `01_state_machine.md` 8절).
    **스케줄러 주기는 일 1회 그대로**입니다. 시한이 길어져도 스캔 주기를 좁힐 이유가 없고(하루 늦게 종료돼도
    사용자 경험에 차이가 없습니다), 오히려 무료 티어의 크론 실행 횟수를 아낍니다.
  - **부분 인덱스는 시한이 7일로 늘어나면서 더 유용해집니다.** `paused` 행이 최대 7배 오래 남지만,
    이 인덱스가 커버하는 3개 상태는 여전히 전체 세션의 소수(과반은 `evaluated`)이고,
    스케줄러는 `where status = 'paused' and paused_at < now() - interval '7 days'`로 이 인덱스를 타고 들어갑니다.
    전체 인덱스였다면 `evaluated` 행까지 함께 커져 시한 연장이 그대로 인덱스 크기 증가가 됐을 것입니다.
    쌓이는 `paused` 행의 비용은 **행 자체의 저장 공간뿐**이고 스캔 비용이 아닙니다.

### 3.4 `questions` — 질문 트리 (지표 6의 원천)

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid | not null, → `interview_sessions(id) on delete cascade` |
| `parent_question_id` | uuid | NULL 허용, → `questions(id) on delete cascade` |
| `depth` | int | not null default 0, `check (depth between 0 and 8)` |
| `order_index` | int | not null, `check (order_index >= 0)` |
| `question_kind` | text | not null, `check (question_kind in ('main','follow_up'))` |
| `question_text` | text | not null, `check (char_length(question_text) between 1 and 2000)` |
| `source_span` | text | NULL 허용 |
| `target_axis` | text | NULL 허용, `check (target_axis is null or target_axis in ('job_knowledge','logical_consistency','evidence_specificity','structure','communication'))` |
| `archetype_id` | text | NULL 허용, `check (archetype_id is null or char_length(archetype_id) between 1 and 80)` |
| `seed_version` | text | NULL 허용, `check (seed_version is null or char_length(seed_version) <= 20)` |
| `probe_hints` | jsonb | NULL 허용, `check (probe_hints is null or (jsonb_typeof(probe_hints) = 'array' and jsonb_array_length(probe_hints) <= 3))` |
| `asked_at` | timestamptz | NULL 허용 |
| `created_at` | timestamptz | not null default now() |

**신규 3컬럼의 근거와 판단** (2026-09-09 리더 조정 2 — `02_ai_contracts.md` 9절 #5·#7, `02_ai_architecture.md` 12.5절)

| 컬럼 | nullable | 기본값 | 인덱스 | 무료 티어 용량 영향 |
|---|---|---|---|---|
| `archetype_id` | **예** | 없음(NULL) | **두지 않음** | 무시 가능. 세션당 최대 12행 × 짧은 문자열 |
| `seed_version` | **예** | 없음(NULL) | 두지 않음 | 무시 가능(`'1.0.0'` 수준) |
| `probe_hints` | **예** | 없음(NULL) | 두지 않음 | 항목 3개 × 80자 상한 = 행당 최대 약 0.3KB. 세션당 최대 12행이므로 세션당 4KB 미만 |

- **`archetype_id`는 nullable입니다.** 시드 팩이 아직 비어 있어도 플래너는 동작해야 하고(`02_ai_architecture.md` 12.4절
  "면접은 반드시 시작될 수 있어야 한다"), 시드 없이 만든 질문은 원형이 없습니다. not null로 두면 폴백 경로에서
  질문 저장이 실패해 면접 자체가 시작되지 않습니다.
  FK로 만들지 않는 이유: 시드 팩은 **저장소의 정적 파일**이고 DB 테이블이 아닙니다(`02_ai_architecture.md` 12.3절).
  참조 무결성은 DB가 아니라 코드 리뷰가 지킵니다.
- **`seed_version`은 서버가 저장 시 채웁니다**(`02_ai_contracts.md` 2.3절 "저장 시 서버가 덮어쓰는 값"). AI 출력이 아닙니다.
  시드 없이 만든 질문은 NULL입니다. 리포트 재현성 추적의 열쇠이며, 원형 본문이 바뀌었는데 버전이 같으면 추적이 불가능해집니다.
- **인덱스를 두지 않는 이유.** 12.5절 품질 관측(원형별 평균 꼬리질문 깊이, 원형별 이의 제기율)은 **배치성 집계**이고
  MVP 데이터 규모에서 순차 스캔으로 충분합니다. 관측 쿼리 때문에 모든 INSERT에 인덱스 유지 비용을 물리지 않습니다.
  → 세션 수가 수천 건을 넘어 관측 쿼리가 느려지면 `idx_questions_archetype (archetype_id) where archetype_id is not null`을 추가합니다.
- **`probe_hints`가 컬럼이어야 하는 이유(가장 중요).** 면접관은 **매 턴** `current_question.probe_hints`를 입력으로 받습니다
  (`02_ai_contracts.md` 3.1절). 이 값을 세션 캐시(메모리·KV)에만 두면 서버 재시작이나 `paused → in_progress` 재개 시
  사라지고, 면접관은 "무엇을 더 캐물어야 하는가"를 잃은 채 대화를 이어갑니다. 재개 가능성이 이 컬럼에 걸려 있습니다.
  - 형태: `["선택하지 않은 대안과 그 이유", "그 판단의 기준이 된 수치"]` — **문자열 배열**(오브젝트 배열이 아님).
    `02_ai_contracts.md` 2.2절 `questions[].probe_hints`(0–3개, 각 5–80자)와 같은 형태입니다.
  - `text[]`가 아니라 `jsonb`인 이유: 계약 문서가 JSON 배열이므로 변환 없이 그대로 넣고 뺄 수 있고,
    생성된 TS 타입도 `Json`으로 나와 API 라우트에서 그대로 직렬화됩니다.
  - **꼬리질문 행에도 값이 있을 수 있습니다.** 면접관이 만든 꼬리질문은 보통 NULL이며, 필요하면 뿌리 주질문의
    힌트를 계승해 서버가 복사합니다. 계승 여부는 서버 판단이며 스키마는 양쪽을 허용합니다.
  - 길이 상한(3개)은 CHECK로 강제합니다. 각 항목의 문자 길이(5–80자)는 애플리케이션 검증에 맡깁니다
    (jsonb 원소 순회 CHECK는 비용 대비 이득이 없습니다).

**트리 정합 제약** (`question_kind`와 `parent_question_id`·`depth`가 어긋나면 지표 6이 거짓말을 합니다):
```sql
constraint questions_kind_shape check (
  (question_kind = 'main'      and parent_question_id is null and depth = 0)
  or
  (question_kind = 'follow_up' and parent_question_id is not null and depth > 0)
)
```
`depth = 부모 depth + 1`은 단일 행 CHECK로 표현할 수 없으므로 **서버(질문 플래너)의 책임**이며,
QA 체크리스트 항목으로 넘깁니다(7절).

인덱스
- `unique (session_id, order_index)` — 순서 중복 방지 + 세션별 질문 조회를 겸함(별도 `session_id` 인덱스 불필요)
- `idx_questions_parent (parent_question_id) where parent_question_id is not null` — 꼬리질문 트리 조회. 부분 인덱스라 주질문 행은 인덱스에 들어가지 않습니다.

### 3.5 `turns` — 대화 로그 (진실의 원천)

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid | not null, → `interview_sessions(id) on delete cascade` |
| `question_id` | uuid | NULL 허용, → `questions(id) on delete cascade` |
| `seq` | int | not null, `check (seq >= 0)` |
| `role` | text | not null, `check (role in ('interviewer','candidate'))` |
| `transcript_text` | text | **not null**, `check (char_length(transcript_text) >= 1)` |
| `transcript_raw` | text | NULL 허용 — STT 원문 보존 |
| `is_corrected` | boolean | not null default false |
| `modality` | text | not null, `check (modality in ('voice','text'))` |
| `stt_confidence` | numeric(4,3) | NULL 허용, `check (stt_confidence is null or stt_confidence between 0 and 1)` |
| `started_at` / `ended_at` | timestamptz | NULL 허용 |
| `created_at` | timestamptz | not null default now() |

**정정 정합 제약** (전사 정정 기능의 DB 강제):
```sql
constraint turns_correction_shape check (
  (is_corrected = false) or (transcript_raw is not null and role = 'candidate')
)
```
면접관 발화는 편집 불가(`01_product_spec.md` 5절)이므로 `is_corrected = true`는 후보 발화에만 성립합니다.

**오디오 컬럼 없음.** 음성 원본을 저장하지 않으므로 `audio_path` 계열 컬럼을 두지 않습니다(브리프 7절).

인덱스: `unique (session_id, seq)` — 순번 중복 방지 + 세션별 로그 조회 겸용. `question_id` 인덱스는 두지 않습니다(4절 트레이드오프).

### 3.6 `session_events` — 상태 전이 감사 로그

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid | not null, → `interview_sessions(id) on delete cascade` |
| `from_status` | text | NULL 허용, **CHECK — 1절 11개 값** |
| `to_status` | text | not null, **CHECK — 1절 11개 값** |
| `trigger` | text | not null, `check (trigger in ('user_action','ai_completion','timeout','system_error','scheduler'))` |
| `event_name` | text | not null, `check (char_length(event_name) between 1 and 64)` |
| `detail` | jsonb | NULL 허용 |
| `occurred_at` | timestamptz | not null default now() |

`from_status` / `to_status`에도 `interview_sessions.status`와 **같은 11개 값 CHECK**를 겁니다
(`from_status is null or from_status in (...)`). 지표 1·2가 이 로그로 계산되므로 오타 한 글자가 지표를 망칩니다.

인덱스: `idx_session_events_session_time (session_id, occurred_at)`.
`event_name = 'score_card_viewed'`(지표 5의 분모)는 이 인덱스로 세션 범위를 좁힌 뒤 필터링합니다. 전용 인덱스는 두지 않습니다.

### 3.7 `evaluations`

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid | not null, → `interview_sessions(id) on delete cascade` |
| `status` | text | not null default `'running'`, `check (status in ('running','succeeded','failed'))` |
| `model_name` | text | NULL 허용 |
| `rubric_version` | text | not null default `'1.0.0-draft'` |
| `overall_score` | numeric(3,2) | NULL 허용, `check (overall_score is null or overall_score between 1.00 and 5.00)` |
| `summary` | text | NULL 허용 |
| `improvements` | jsonb | NULL 허용 — 개선점 3가지 배열 |
| `coach_payload` | jsonb | NULL 허용, `check (coach_payload is null or jsonb_typeof(coach_payload) = 'object')` — 코치 원출력 보관 |
| `ai_contract_version` | text | NULL 허용, `check (ai_contract_version is null or char_length(ai_contract_version) <= 40)` |
| `provider` | text | NULL 허용, `check (provider is null or char_length(provider) <= 40)` |
| `attempt_count` | int | not null default 0, `check (attempt_count between 0 and 3)` — **평가자 시도만** 셈(아래) |
| `error_message` | text | NULL 허용 |
| `started_at` | timestamptz | not null default now() |
| `finished_at` | timestamptz | NULL 허용 |

`improvements`는 **텍스트 한 덩어리로 저장하지 않고** jsonb 배열로 둡니다. 형태:
`[{"priority":1,"title":"...","action":"...","related_axis":"..."}, ...]` — `02_ai_contracts.md` 6.4절과 일치합니다.
자주 정렬·필터하는 `overall_score`는 jsonb 안이 아니라 **컬럼으로 승격**했습니다(세션 목록의 점수 표시).

**신규 3컬럼의 근거와 판단** (2026-09-09 리더 조정 2 — `02_ai_contracts.md` 9절 #4·#6, `02_ai_architecture.md` 13.1절)

| 컬럼 | nullable | 기본값 | 인덱스 | 무료 티어 용량 영향 |
|---|---|---|---|---|
| `coach_payload` | **예** | 없음(NULL) | **두지 않음** | 평가 1건당 최대 약 3KB(모범 답안 2건 × 900자 + 다음 행동 3건). 세션당 평가 1–2건이므로 세션당 6KB 미만 |
| `ai_contract_version` | **예** | 없음(NULL) | 두지 않음 | 무시 가능 |
| `provider` | **예** | 없음(NULL) | 두지 않음 | 무시 가능 |

- **`coach_payload`는 nullable이어야 합니다.** `evaluations` 행은 평가자 성공 시점에 만들어지고, 코치는 그 뒤에 돌며
  **실패가 허용됩니다**(`02_ai_architecture.md` 3절). 코치가 실패하면 이 컬럼은 NULL로 남고 세션은 `evaluated`로 갑니다.
  - 형태: `{"model_answers":[...], "next_actions":[...]}` — `02_ai_contracts.md` 6.4절의 저장 매핑 그대로.
  - **최상위가 오브젝트임을 CHECK로 강제합니다.** 배열이나 스칼라가 들어가면 `coach_payload->'model_answers'`가
    조용히 NULL을 내놓아 리포트에서 모범 답안이 사라지는 무증상 버그가 됩니다.
  - `summary`/`improvements`와 함께 **같은 트랜잭션**에서 씁니다. 셋이 따로 커밋되면 "총평은 있는데 모범 답안이 없는" 반쪽 리포트가 생깁니다.
  - jsonb 컬럼 하나로 두고 별도 테이블(`coach_model_answers` 등)을 만들지 않는 이유: 리포트에서 **항상 통째로 한 번** 읽히고,
    개별 항목을 필터·정렬·조인하는 화면이 MVP에 없습니다. 테이블을 늘리면 RLS 정책과 마이그레이션만 늘어납니다.
- **`ai_contract_version`** — `02_ai_contracts.md`의 `ai_contract_version`(현재 `"1.0.0-draft"`) 값을 서버가 저장 시 채웁니다.
  기본값을 리터럴로 박지 않는 이유: DB 기본값과 계약 문서가 어긋나면 **틀린 버전이 조용히 기록**되고,
  버전을 올릴 때마다 마이그레이션이 필요해집니다. 값의 원본은 애플리케이션 상수 한 곳이어야 합니다.
  `rubric_version`(별도 컬럼)과 **다른 축**입니다 — 채점 기준이 그대로여도 입출력 스키마는 바뀔 수 있습니다.
- **`provider`** — 프로바이더 식별자(`anthropic` / `openai` 등)를 담고, 구체 모델 ID는 기존 `model_name`에 그대로 둡니다.
  둘을 한 컬럼에 합치지 않는 이유: 폴백 사다리(`01_state_machine.md` 4절)가 프로바이더를 갈아탈 수 있고,
  "어느 프로바이더에서 재시도율이 높은가"는 문자열 파싱 없이 집계할 수 있어야 합니다.
- **인덱스를 두지 않는 이유.** 세 컬럼 모두 **읽기 대상이지 검색 대상이 아닙니다.** `coach_payload`는 리포트가
  `evaluation_id`로 찾은 뒤 통째로 읽고, 나머지 둘은 회귀 분석용 배치 집계입니다. jsonb GIN 인덱스는
  본문 크기에 비례해 커지므로 무료 티어에서 특히 비쌉니다. 조회 경로가 생기기 전에는 만들지 않습니다.

**`attempt_count`가 세는 것 — 평가자 시도뿐입니다** (2026-09-09 D10 확정, 13.3절 R5 해소)

코치 시도 횟수 컬럼(`coach_attempt_count`)은 **추가하지 않습니다.** 컬럼 하나를 관측 목적만으로 늘리기보다,
이미 있는 `session_events`로 코치 실패를 셉니다.

- **`attempt_count`는 평가자(Evaluator) 재시도만 셉니다.** 코치는 최대 2회 재시도하지만(`02_ai_contracts.md` 8절)
  그 횟수는 이 컬럼에 들어가지 **않습니다.** 코치 워커가 이 컬럼을 증가시키면 "평가가 3번 실패했다"는
  운영 신호가 코치 실패로 오염됩니다. **코치 워커는 이 컬럼을 절대 UPDATE하지 않습니다.**
- **코치 실패의 관측 경로:** `session_events`에 코치 재시도·실패 이벤트를 남기고
  (`trigger = 'ai_completion'` 또는 `'system_error'`, `event_name`으로 구분), `detail jsonb`에 시도 회차를 담습니다.
  `idx_session_events_session_time`으로 세션을 좁힌 뒤 필터링하면 되고, 프로바이더별 집계는
  `evaluations.provider`와 세션 단위로 조인합니다.
- **세션 단위 "코치 미완료" 판정은 여전히 `evaluations.summary IS NULL` 하나입니다**(3.8절과 동일 기준).
  관측 지표가 늘어도 판정 기준은 하나여야 합니다.
- 필요해지면 ALTER 한 줄입니다. 단 **첫 마이그레이션 적용 이후이므로 새 ALTER 파일**로만 추가합니다(10절 규칙).

인덱스: `idx_evaluations_session_started (session_id, started_at desc)` — 재평가 대비 최신 1건 조회.

### 3.8 `evaluation_scores`

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `id` | uuid | PK |
| `evaluation_id` | uuid | not null, → `evaluations(id) on delete cascade` |
| `session_id` | uuid | not null, → `interview_sessions(id) on delete cascade` — **RLS 단축용 비정규화** |
| `axis` | text | not null, `check (axis in ('job_knowledge','logical_consistency','evidence_specificity','structure','communication'))` |
| `score` | int | NULL 허용, `check (score is null or score between 1 and 5)` |
| `is_insufficient_evidence` | boolean | not null default false |
| `weight` | numeric(4,3) | not null, `check (weight >= 0 and weight <= 1)` |
| `rationale` | text | not null |
| `improvement` | text | **NULL 허용**, `check (improvement is null or char_length(improvement) between 20 and 400)` |

```sql
constraint scores_evidence_shape check (
  (is_insufficient_evidence = true  and score is null)
  or
  (is_insufficient_evidence = false and score is not null)
),
unique (evaluation_id, axis)
```
루브릭 3절 "근거 부족이면 `score = NULL`"을 DB가 강제합니다. 축 중복도 unique로 막습니다.

**`improvement`의 not null 해제** (2026-09-09 리더 조정 1 — `02_ai_contracts.md` 9절 #3, 10절 옵션 B 채택)

`rationale`과 `improvement`는 **생산 주체가 다릅니다.** `rationale`은 평가자가, `improvement`는 **코치**가 만듭니다
(`01_rubric.md` 4절 5항). 평가자가 성공하면 행이 만들어지지만, 코치는 그 뒤에 돌고 **실패가 허용됩니다**
(`02_ai_architecture.md` 3절: 코치 실패 시에도 `evaluated`로 전이). 그래서 이 컬럼만 NULL을 허용합니다.

- **플레이스홀더 문자열을 넣는 방식은 채택하지 않습니다.** 가짜 문자열을 저장하면 (a) 리포트에 의미 없는 문구가
  그대로 노출되고, (b) **"값이 없음"과 "코치가 실제로 이렇게 말했음"을 DB 수준에서 구분할 수 없게** 됩니다.
  NULL은 그 구분을 타입으로 표현합니다.
- **쓰기 순서** (`02_ai_contracts.md` 5.6절을 이 결정에 맞춰 다시 읽으면):
  1. 평가자 성공 → `evaluation_scores` 5행 INSERT. `improvement`는 **NULL로 둡니다**(컬럼을 생략하면 됩니다).
  2. 코치 성공 → 같은 트랜잭션에서 5행의 `improvement`를 축별로 UPDATE + `evaluations`의
     `summary`/`improvements`/`coach_payload` 기록.
  3. 코치 실패 → `improvement`가 NULL인 채로 `evaluated`로 전이. 리포트는 개선 제안 영역을 감춥니다.
  4. 사용자가 리포트에서 재시도 → 코치만 다시 돌려 2와 같은 UPDATE로 채웁니다. **INSERT가 아니라 UPDATE**이므로
     점수·인용은 건드리지 않습니다.
- **길이 CHECK를 함께 겁니다**(20–400자, `02_ai_contracts.md` 6.2절 `axis_improvements[].improvement`와 동일 범위).
  not null이 사라졌으므로 "빈 문자열"이 NULL 대신 들어오는 경로를 막아야 합니다. `''`는 CHECK에 걸려 저장되지 않고,
  값이 없다는 뜻은 오직 NULL 하나로 표현됩니다.
- **UI는 코치 미완료 여부를 `evaluations.summary IS NULL`로 판정합니다.** `improvement IS NULL`은 축 단위의 표시 분기이지
  세션 전체의 상태 판정이 아닙니다(축 하나만 UPDATE에 실패하는 경우는 트랜잭션이 막지만, 판정 기준은 하나여야 합니다).

인덱스: `unique (evaluation_id, axis)`가 조회 인덱스를 겸함 + `idx_scores_session (session_id)` (RLS·리포트 조회).

### 3.9 `evaluation_citations` — 축당 1–3건의 원문 인용

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `id` | uuid | PK |
| `score_id` | uuid | not null, → `evaluation_scores(id) on delete cascade` |
| `session_id` | uuid | not null, → `interview_sessions(id) on delete cascade` — **RLS 단축용 비정규화** |
| `turn_id` | uuid | not null, → `turns(id) on delete cascade` |
| `quote_text` | text | not null, `check (char_length(quote_text) between 20 and 160)` — 루브릭 4절 3항 |
| `quote_start` | int | not null, `check (quote_start >= 0)` |
| `quote_end` | int | not null |
| `comment` | text | NULL 허용 |
| `citation_index` | int | not null default 0, `check (citation_index between 0 and 2)` — 축당 최대 3건 |

```sql
constraint citations_offset_order check (quote_end > quote_start),
unique (score_id, citation_index)
```
- **축당 최대 3건**은 `unique (score_id, citation_index)` + `citation_index ≤ 2`로 DB가 강제합니다.
- **최소 1건**(`is_insufficient_evidence = false`일 때)은 단일 행 제약으로 표현할 수 없으므로 평가 워커의 트랜잭션 책임입니다. QA 체크리스트로 넘깁니다(7절).
- `quote_text`가 `turns.transcript_text`의 실제 부분 문자열인지도 DB가 아니라 워커가 검증합니다(루브릭 4절 2항: 불일치면 저장하지 않고 재시도).

인덱스: `unique (score_id, citation_index)`가 조회를 겸함 + `idx_citations_session (session_id)`.
`turn_id`는 전용 인덱스를 두지 않습니다(인용 → 턴은 항상 리포트 조회 시 함께 로드).

### 3.10 `report_feedback` — 지표 4

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid | not null **unique**, → `interview_sessions(id) on delete cascade` |
| `user_id` | uuid | not null, → `profiles(id) on delete cascade` |
| `is_helpful` | boolean | not null |
| `comment` | text | NULL 허용, `check (comment is null or char_length(comment) <= 1000)` |
| `created_at` / `updated_at` | timestamptz | not null default now() |

`unique (session_id)`가 "세션당 1건"을 강제하며, upsert의 충돌 키가 됩니다. 인덱스는 이 unique 하나.

### 3.11 `score_disputes` — 지표 5 (축·인용 단위 이의 제기)

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `id` | uuid | PK |
| `score_id` | uuid | not null, → `evaluation_scores(id) on delete cascade` |
| `citation_id` | uuid | NULL 허용, → `evaluation_citations(id) on delete cascade` — 값이 있으면 **인용 단위**, NULL이면 **축 단위** 이의 |
| `session_id` | uuid | not null, → `interview_sessions(id) on delete cascade` — RLS 단축용 |
| `user_id` | uuid | not null, → `profiles(id) on delete cascade` |
| `reason_code` | text | not null, `check (reason_code in ('transcription_error','misinterpreted','score_too_low','other'))` |
| `comment` | text | NULL 허용, `check (comment is null or char_length(comment) <= 1000)` |
| `created_at` | timestamptz | not null default now() |

중복 제기 방지:
```sql
create unique index uq_disputes_axis
  on public.score_disputes (score_id)
  where citation_id is null;
create unique index uq_disputes_citation
  on public.score_disputes (citation_id)
  where citation_id is not null;
```
축 단위 이의는 축당 1건, 인용 단위 이의는 인용당 1건. 지표 5(노출 대비 클릭 비율)가 중복 클릭으로 부풀지 않습니다.
추가로 `idx_disputes_session (session_id)`.

**재평가 관련 컬럼은 두지 않습니다** (2026-09-09 D4 확정)

이의 제기는 **수집만 하고 재평가를 유발하지 않습니다.** 따라서 이 테이블에 `status`(접수/검토중/반영됨),
`resolved_at`, `resulting_evaluation_id` 같은 컬럼이 **필요 없음을 확인했습니다.** 위 DDL은 그대로입니다.

- 이의가 재평가를 부르지 않으므로 `score_disputes`에서 `evaluations`로 향하는 **역방향 참조가 없습니다.**
  관계는 `score_id`(→ `evaluation_scores`)와 선택적 `citation_id` 두 개뿐이고, 둘 다 "무엇에 대한 이의인가"를
  가리킬 뿐 "무엇을 바꿨는가"를 가리키지 않습니다.
- 서버 쓰기 경로도 늘어나지 않습니다: 클라이언트 INSERT 정책 하나(5.2절)로 끝이고,
  UPDATE·DELETE 정책은 계속 두지 않습니다(제기 후 수정·철회는 MVP 밖).
- 나중에 이의가 재평가를 유발하게 되면 그때 상태 컬럼과 워커가 함께 필요해집니다. **지금 미리 넣지 않습니다** —
  아무도 쓰지 않는 `status` 컬럼은 "이의가 처리되고 있다"는 잘못된 인상을 UI에 주기 쉽습니다.

### 3.12 `storage_cleanup_queue` — Storage 객체 실제 삭제 보장 (서버 전용)

DB의 FK CASCADE는 **Storage 객체를 지우지 않습니다.** 계정 삭제나 세션 삭제로 `documents` 행이 연쇄 삭제되면
파일만 남는 고아 객체가 생기고, 무기한 보존 정책과 겹쳐 무료 티어 용량을 잠식합니다.
이를 막기 위해 삭제 트리거가 경로를 큐에 남기고, 서버 스위퍼가 Storage API로 실제 삭제합니다.

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `id` | uuid | PK |
| `bucket_id` | text | not null default `'documents'` |
| `storage_path` | text | not null |
| `owner_user_id` | uuid | NULL 허용 (계정 삭제 시 `profiles`가 먼저 사라질 수 있으므로 **FK를 걸지 않음**) |
| `status` | text | not null default `'pending'`, `check (status in ('pending','done','failed'))` |
| `attempt_count` | int | not null default 0 |
| `last_error` | text | NULL 허용 |
| `enqueued_at` | timestamptz | not null default now() |
| `processed_at` | timestamptz | NULL 허용 |

인덱스: `idx_cleanup_pending (enqueued_at) where status = 'pending'` (부분 인덱스).

트리거:
```sql
create function public.enqueue_storage_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
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
```

이 테이블은 사용자 데이터(파일 경로 = 개인정보)를 담으므로 **RLS를 켜되 정책을 하나도 만들지 않습니다.**
`authenticated`/`anon`은 어떤 행도 읽거나 쓸 수 없고, `service_role`만 RLS를 우회해 접근합니다.

---

## 4. 인덱스 총목록과 무료 티어 트레이드오프

| # | 테이블 | 인덱스 | 목적 |
|---|---|---|---|
| 1 | documents | `idx_documents_user_created (user_id, created_at desc)` | 보관함 목록 |
| 2 | documents | `unique (storage_path)` | 객체 중복 참조 방지 |
| 3 | interview_sessions | `idx_sessions_user_created (user_id, created_at desc)` | 세션 목록·대시보드 |
| 4 | interview_sessions | `idx_sessions_status_updated (status, updated_at) where status in ('paused','completed','evaluating')` | 워치독·자동 종료 |
| 5 | questions | `unique (session_id, order_index)` | 순서 강제 + 세션별 조회 |
| 6 | questions | `idx_questions_parent (parent_question_id) where parent_question_id is not null` | 꼬리질문 트리, 지표 6 |
| 7 | turns | `unique (session_id, seq)` | 순번 강제 + 로그 조회 |
| 8 | session_events | `idx_session_events_session_time (session_id, occurred_at)` | 감사 로그, 지표 1·2·5 |
| 9 | evaluations | `idx_evaluations_session_started (session_id, started_at desc)` | 최신 평가 조회 |
| 10 | evaluation_scores | `unique (evaluation_id, axis)` | 축 중복 방지 + 조회 |
| 11 | evaluation_scores | `idx_scores_session (session_id)` | RLS·리포트 |
| 12 | evaluation_citations | `unique (score_id, citation_index)` | 축당 ≤3건 강제 + 조회 |
| 13 | evaluation_citations | `idx_citations_session (session_id)` | RLS·리포트 |
| 14 | report_feedback | `unique (session_id)` | 세션당 1건 |
| 15 | score_disputes | `uq_disputes_axis`, `uq_disputes_citation` | 중복 제기 방지 |
| 16 | score_disputes | `idx_disputes_session (session_id)` | RLS·리포트 |
| 17 | storage_cleanup_queue | `idx_cleanup_pending (enqueued_at) where status = 'pending'` | 스위퍼 |

PK를 제외하고 **17개**입니다(unique 제약이 만드는 인덱스 포함).

**절약한 것과 그 대가**
- `turns.question_id`, `evaluation_citations.turn_id`, `score_disputes.score_id`에 **전용 인덱스를 두지 않았습니다.**
  이 세 컬럼은 항상 "세션 하나를 통째로 로드"하는 문맥에서만 쓰이고, 세션 하나의 `turns`는 최대 20행·`citations`는 최대 15행이므로
  인덱스 없이도 부모 범위를 좁힌 뒤의 스캔이 무시할 수 있는 비용입니다.
  **대가:** 이 컬럼들을 전역으로 역조회하는 쿼리(예: "이 턴을 인용한 모든 평가")는 느립니다. MVP에 그런 화면이 없습니다.
- `session_events.event_name`에 인덱스를 두지 않았습니다. 지표 5 집계는 배치성이므로 순차 스캔을 감수합니다.
- FK 컬럼에 인덱스가 없으면 **부모 삭제 시 자식 스캔**이 발생합니다. 위 세 FK는 부모(`questions`/`turns`/`evaluation_scores`)가
  항상 세션 CASCADE의 일부로 삭제되고 세션당 행 수가 수십 건이므로 실측상 문제가 없습니다. 세션당 행 수가 커지면 재검토합니다.
- **스냅샷 2컬럼의 용량 영향**(2026-09-09 D6): `resume_text_snapshot` + `jd_text_snapshot`은 각 최대 200,000자이지만
  실제 이력서·JD는 **세션당 합계 수십 KB 수준**이고, Postgres가 임계값을 넘는 `text`를 TOAST로 압축·외부 저장하므로
  세션 상세를 읽지 않는 목록 쿼리(`/sessions`, `/dashboard`)의 비용은 늘지 않습니다.
  **대가:** 같은 이력서로 N번 면접하면 같은 텍스트가 N벌 쌓입니다 — 사용자당 수백 KB 규모이며,
  무료 티어 DB 용량을 무겁게 만드는 쪽은 텍스트가 아니라 Storage의 원본 파일입니다(7.5절, D3).
  **인덱스는 두 컬럼 모두 두지 않으므로 4절 표의 17개는 변하지 않습니다.**
- **비정규화한 `session_id`**(evaluation_scores/citations/disputes)의 대가는 uuid 3개 × 행 수의 저장 공간입니다.
  대신 RLS의 조인 깊이가 3단(citation→score→evaluation→session)에서 1단으로 줄어, 리포트 화면의 모든 쿼리에서
  중첩 서브쿼리가 사라집니다. 무료 티어에서는 CPU가 디스크보다 먼저 병목이므로 이쪽을 택했습니다.

---

## 5. RLS 정책

### 5.1 원칙

1. **12개 테이블 전부 `enable row level security`.** 예외 없음. 테이블 생성·RLS 활성화·정책 생성은 **같은 마이그레이션 파일**에 넣어, 정책 없는 창이 생기지 않게 합니다.
2. `auth.uid()`는 항상 `(select auth.uid())`로 감싸 행마다 재평가되지 않게 합니다.
3. **쓰기 경계:** 상태 머신이 지배하는 데이터(세션 상태·질문·턴·이벤트·평가 계열)는 **클라이언트 쓰기 정책을 아예 만들지 않습니다.**
   정책이 없으면 `authenticated`/`anon`의 INSERT·UPDATE·DELETE는 전부 거부되고, 서버의 `service_role`만 RLS를 우회해 씁니다.
   이렇게 하면 "API 라우트가 전이 표를 검사하고 허용되지 않으면 409" 규칙을 클라이언트가 우회할 수 없습니다.
4. 클라이언트가 직접 쓰는 것은 상태 머신과 무관한 4개뿐입니다: `profiles`(update), `documents`(전체), `report_feedback`(insert/update), `score_disputes`(insert).
5. `anon` 역할에는 어떤 정책도 부여하지 않습니다. 모든 정책의 `to`는 `authenticated`입니다.

### 5.2 정책 표

`OWNS_SESSION(x)`는 아래 조건의 축약이며 실제 SQL에서는 전개해 씁니다:
```sql
exists (
  select 1 from public.interview_sessions s
  where s.id = x and s.user_id = (select auth.uid())
)
```

| 테이블 | 작업 | 대상 역할 | USING | WITH CHECK |
|---|---|---|---|---|
| `profiles` | select | authenticated | `(select auth.uid()) = id` | — |
| `profiles` | insert | — | 정책 없음(가입 트리거가 `security definer`로 생성) | — |
| `profiles` | update | authenticated | `(select auth.uid()) = id` | `(select auth.uid()) = id` |
| `profiles` | delete | — | 정책 없음(계정 삭제는 서버가 `auth.users`를 지워 CASCADE) | — |
| `documents` | select | authenticated | `(select auth.uid()) = user_id` | — |
| `documents` | insert | authenticated | — | `(select auth.uid()) = user_id` |
| `documents` | update | authenticated | `(select auth.uid()) = user_id` | `(select auth.uid()) = user_id` |
| `documents` | delete | authenticated | `(select auth.uid()) = user_id` | — |
| `interview_sessions` | select | authenticated | `(select auth.uid()) = user_id` | — |
| `interview_sessions` | insert/update/delete | — | **정책 없음 — 서버 전용** | — |
| `questions` | select | authenticated | `OWNS_SESSION(session_id)` | — |
| `questions` | insert/update/delete | — | **정책 없음 — 서버 전용** | — |
| `turns` | select | authenticated | `OWNS_SESSION(session_id)` | — |
| `turns` | insert/update/delete | — | **정책 없음 — 서버 전용**(전사 정정도 API 라우트 경유) | — |
| `session_events` | select | authenticated | `OWNS_SESSION(session_id)` | — |
| `session_events` | insert/update/delete | — | **정책 없음 — 서버 전용** | — |
| `evaluations` | select | authenticated | `OWNS_SESSION(session_id)` | — |
| `evaluations` | insert/update/delete | — | **정책 없음 — 서버 전용(평가 워커)** | — |
| `evaluation_scores` | select | authenticated | `OWNS_SESSION(session_id)` | — |
| `evaluation_scores` | insert/update/delete | — | **정책 없음 — 서버 전용** | — |
| `evaluation_citations` | select | authenticated | `OWNS_SESSION(session_id)` | — |
| `evaluation_citations` | insert/update/delete | — | **정책 없음 — 서버 전용** | — |
| `report_feedback` | select | authenticated | `(select auth.uid()) = user_id` | — |
| `report_feedback` | insert | authenticated | — | `(select auth.uid()) = user_id and OWNS_SESSION(session_id)` |
| `report_feedback` | update | authenticated | `(select auth.uid()) = user_id` | `(select auth.uid()) = user_id` |
| `report_feedback` | delete | — | 정책 없음(세션 삭제로만 사라짐) | — |
| `score_disputes` | select | authenticated | `(select auth.uid()) = user_id` | — |
| `score_disputes` | insert | authenticated | — | `(select auth.uid()) = user_id and OWNS_SESSION(session_id)` |
| `score_disputes` | update/delete | — | 정책 없음(제기 후 수정·철회는 MVP 밖) | — |
| `storage_cleanup_queue` | 전부 | — | **정책 없음 — RLS 켜고 전면 차단. `service_role`만 접근** | — |

`report_feedback`·`score_disputes`의 insert에서 `user_id` 확인과 `OWNS_SESSION` 확인을 **둘 다** 겁니다.
전자만 걸면 남의 세션에 자기 `user_id`로 피드백을 다는 것을 막지 못해 지표 4·5가 오염됩니다.

### 5.3 실제 SQL (핵심 부분)

```sql
-- profiles
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- documents
alter table public.documents enable row level security;
create policy "documents_select_own" on public.documents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "documents_insert_own" on public.documents
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "documents_update_own" on public.documents
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "documents_delete_own" on public.documents
  for delete to authenticated using ((select auth.uid()) = user_id);

-- interview_sessions : 읽기만 클라이언트, 쓰기는 서버(service_role)
alter table public.interview_sessions enable row level security;
create policy "sessions_select_own" on public.interview_sessions
  for select to authenticated using ((select auth.uid()) = user_id);

-- 세션 하위 테이블 공통 패턴 (questions / turns / session_events /
-- evaluations / evaluation_scores / evaluation_citations)
alter table public.turns enable row level security;
create policy "turns_select_own_session" on public.turns
  for select to authenticated using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = turns.session_id
        and s.user_id = (select auth.uid())
    )
  );

-- report_feedback
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
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- score_disputes : insert/select만
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

-- storage_cleanup_queue : RLS 켜고 정책 0개 = 전면 차단
alter table public.storage_cleanup_queue enable row level security;
```

### 5.4 RLS 활성화 확인 쿼리 (QA·CI용)

정책 누락은 눈으로 못 잡습니다. 다음 두 쿼리가 **0행**이어야 합니다.

```sql
-- (1) RLS가 꺼진 public 테이블
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;

-- (2) RLS는 켰지만 select 정책이 하나도 없는 테이블
--     (storage_cleanup_queue는 의도적 예외이므로 제외)
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
  and c.relname <> 'storage_cleanup_queue'
  and not exists (select 1 from pg_policies p
                  where p.schemaname = 'public' and p.tablename = c.relname
                    and p.cmd in ('SELECT','ALL'));
```

`qa-inspector`에게 이 두 쿼리를 회귀 검사 항목으로 넘깁니다.

---

## 6. Auth

### 6.1 로그인 방식

- **이메일 + 비밀번호** (Supabase Auth). 소셜 로그인은 `[later]`(`01_product_spec.md` 4.1).
- **이메일 확인(confirm email)은 끕니다** (2026-09-09 D8 — 잠정값 "켬"을 뒤집음).

**설정**

```
Supabase Dashboard → Authentication → Providers → Email
  Confirm email : OFF
```

이 값은 마이그레이션 SQL이 아니라 **프로젝트 설정**이므로 `supabase/migrations/`에 들어가지 않습니다.
스키마 변경은 없습니다. 대신 원격 프로젝트를 새로 만들 때 놓치기 쉬우므로,
`vercel-platform-engineer`에게 넘기는 배포 체크리스트 항목으로 남깁니다(12절).

**근거.** 무료 티어 기본 SMTP는 시간당 발송 한도가 낮아, 켜 두면 예산 제약("무료 티어 안에서 해결")과
충돌하는 외부 SMTP 프로바이더가 필요해집니다. 리포트 완료 알림을 앱 내 배지로만 두기로 한 D2와도 일관되며,
그 결과 **이 서비스에는 이메일 발송 경로가 하나도 없습니다.**

**남는 위험 — 잘못된 이메일로 가입하면 계정 복구 경로가 없습니다.**

이것은 완화가 아니라 **감수하는 위험**입니다. 확인 메일이 없으므로 오타 주소(`gmial.com` 등)로도 가입이 성사되고,
비밀번호 재설정 메일 역시 그 주소로 가므로 사용자는 **자기 계정에 영영 다시 들어올 수 없습니다.**
데이터는 DB에 남아 있지만 소유자를 증명할 방법이 없어 운영자도 되돌릴 수 없습니다.

- 완화: `/login` 회원가입 화면에 **입력한 이메일을 다시 확인하라는 문구**를 둡니다(`shadcn-ui-engineer` 전달 — 12절).
  이메일 재입력 필드는 두지 않습니다 — 붙여넣기로 무력화되고 이탈만 늘립니다.
- 이 위험은 스키마로 막을 수 없습니다. `profiles`에 복구용 컬럼(대체 이메일 등)을 두지 않습니다 —
  아무도 채우지 않을 컬럼입니다.
- **되돌리는 조건:** 사용자가 늘어 복구 요청이 실제로 발생하면 그때 켭니다. 켜는 것은 설정 한 번이며
  **기존 계정은 영향받지 않습니다**(이미 확인된 것으로 취급). 스키마 마이그레이션도 필요 없습니다.

### 6.2 `auth.users`와의 관계

`profiles.id`가 `auth.users.id`를 그대로 PK로 씁니다(별도 대리 키 없음). 가입 시 트리거로 자동 생성합니다.

```sql
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

`security definer` + `set search_path = public`을 반드시 함께 씁니다. `search_path`를 고정하지 않으면
검색 경로 조작으로 권한 상승이 가능합니다.

### 6.3 클라이언트 분리와 키

| 파일 | 키 | 용도 |
|---|---|---|
| `src/lib/supabase/client.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저. RLS 적용된 읽기, Realtime 구독, Storage 업로드 |
| `src/lib/supabase/server.ts` | 같은 anon 키 + 쿠키 세션 | 서버 컴포넌트·라우트 핸들러. 사용자 문맥 유지 |
| `src/lib/supabase/admin.ts` | `SUPABASE_SERVICE_ROLE_KEY` | **서버 전용.** RLS 우회. 상태 전이·질문·턴·평가 쓰기, Storage 정리 |

- `@supabase/ssr`의 쿠키 핸들링을 씁니다. 서버가 쿠키를 갱신하지 않으면 "로그인했는데 로그아웃됨" 버그가 납니다.
- `SUPABASE_SERVICE_ROLE_KEY`에 **`NEXT_PUBLIC_` 접두사 금지.** `admin.ts`는 클라이언트 컴포넌트가 import하는 모듈에서
  절대 참조되면 안 되며, 파일 상단에 `import 'server-only'`를 둡니다.
- `admin.ts`를 쓰는 모든 호출 지점에는 **왜 RLS 우회가 필요한지 한 줄 주석**을 남깁니다.

### 6.4 `failure_reason`에 CHECK를 걸지 않는 근거

상태 값과 달리 실패 사유는 운영 중 새 값이 계속 늘어납니다(프로바이더 오류 분류 등).
CHECK를 걸면 새 사유가 생길 때마다 마이그레이션이 필요하고, 사유 문자열이 CHECK를 어겨
**세션이 `failed`로도 못 넘어가 `evaluating`에 갇히는** 최악의 사고가 납니다.
상태 머신의 안전을 위해 이 컬럼만 자유 텍스트로 둡니다. 대신 값 목록은 API 계약에서 문서화합니다.

---

## 7. Storage

### 7.1 버킷

| 버킷 | 공개 여부 | 파일 크기 상한 | 허용 MIME |
|---|---|---|---|
| `documents` | **private** | 10 MiB (10485760 B) | `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`, `text/markdown` |

**오디오 버킷은 만들지 않습니다.** 브리프 7절 확정 — 음성 원본을 저장하지 않고 버퍼는 세션 종료·일시정지·실패 시 폐기합니다.
`turns`에도 오디오 경로 컬럼이 없습니다.

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
) on conflict (id) do nothing;
```

### 7.2 경로 규칙

```
documents/{user_id}/{document_id}.{ext}
```

- **첫 세그먼트가 반드시 `auth.uid()`** 여야 정책이 통과합니다. 소유권을 경로로 판별합니다.
- `{document_id}`는 `documents.id`와 동일. 업로드 전에 클라이언트가 uuid를 생성해 행과 객체 경로를 함께 만듭니다.
- 원본 파일명은 경로에 넣지 않습니다(한글·특수문자 인코딩 문제 회피). 표시용 이름은 `documents.title`에 둡니다.

### 7.3 버킷 정책 (storage.objects RLS)

| 작업 | 대상 역할 | USING | WITH CHECK |
|---|---|---|---|
| select | authenticated | `bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text` | — |
| insert | authenticated | — | 위와 동일 조건 |
| update | authenticated | 위와 동일 | 위와 동일 |
| delete | authenticated | 위와 동일 | — |

```sql
create policy "documents_objects_select_own" on storage.objects
  for select to authenticated using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "documents_objects_insert_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "documents_objects_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "documents_objects_delete_own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
```

### 7.4 업로드·다운로드 흐름

1. 클라이언트가 `document_id`(uuid)를 생성하고, anon 키로 `documents/{user_id}/{document_id}.pdf`에 직접 업로드합니다.
   서버를 경유하지 않으므로 Vercel 함수 실행 시간과 페이로드 한도를 쓰지 않습니다(무료 티어 절약).
2. 업로드 성공 후 `documents` 행을 insert(`source_type = 'file'`, `extraction_status = 'pending'`).
3. 서버 라우트가 객체를 내려받아 텍스트를 추출하고 `extracted_text`·`extraction_status`를 갱신합니다(`01_product_spec.md` 6절).
4. 다운로드·미리보기는 **서명 URL(signed URL, 만료 60초)** 로만 제공합니다. 공개 URL을 만들지 않습니다.

> 업로드 도중 실패해 행 없이 객체만 남는 경우가 생길 수 있습니다.
> 스위퍼가 `documents`에 대응 행이 없는 24시간 이상 된 객체를 주기적으로 제거합니다(7.5절과 같은 워커).

### 7.5 용량 절약 (무료 티어)

- 텍스트 직접 입력 경로는 **Storage를 전혀 쓰지 않습니다.** 파일이 필요 없는 사용자는 용량을 소비하지 않습니다.
- **추출이 `succeeded`로 끝난 뒤에도 원본 파일을 계속 보관합니다** (2026-09-09 D3 확정 — 옵션 A).
  보존 정책이 무기한이고, 사용자가 자기가 올린 원본을 다시 볼 수 있어야 하며, 추출 규칙이 바뀌면 재추출할 수 있어야 하기 때문입니다.
  삭제 경로는 사용자의 명시적 삭제(9.2·9.3절)뿐이며, **`extraction_status` 변화로 파일이 사라지는 자동 경로는 없습니다.**
  - **이것이 Storage 무료 티어 용량의 유일한 누적 요인입니다.** 총량은 대략 `사용자 수 × 문서 수 × 파일 크기`로 늘고,
    상한은 문서당 10 MiB(7.1절)뿐이라 사용자가 지우지 않는 한 **단조 증가합니다.**
    베이스라인 수집 기간(첫 사용자 20~30명)에는 문제가 없지만, 뒤에서 줄어드는 힘이 없다는 점을 명시해 둡니다.
  - **DB 쪽 누적(스냅샷 텍스트, 4절)과 혼동하지 마세요.** 둘은 다른 무료 티어 한도를 씁니다 —
    파일은 Storage 용량, 스냅샷은 DB 용량이고, 압박이 먼저 오는 쪽은 파일입니다.
  - **관측:** 용량이 한도에 가까워지는지는 Supabase 대시보드의 Storage 사용량으로 봅니다.
    이 문서는 자동 삭제·보존 기간 컬럼을 두지 않으므로, 한도에 닿으면 **그때 정책을 다시 결정합니다**(D3을 뒤집는 일).
- 세션은 `documents`의 **텍스트를 스냅샷으로 복사합니다**(2026-09-09 D6, 3.3절). 복사 대상은 `extracted_text`뿐이고
  **파일을 복사하지 않으므로 Storage 용량은 세션 수와 무관합니다.** 늘어나는 것은 DB 쪽 텍스트뿐입니다(4절).

---

## 8. Realtime

### 8.1 결론: 필요합니다. 단 **`interview_sessions` 한 테이블만.**

**근거.** 평가가 비동기입니다(`completed → evaluating → evaluated`). 사용자는 리포트 대기 화면에서 기다리고,
`evaluating → evaluated` 전이를 모르면 리포트를 영원히 못 봅니다. 이것은 지표 2(리포트 도달률)에 직접 걸리는 지점입니다.
폴링으로도 되지만, 무료 티어에서 수 초 간격 폴링은 API 요청 수를 빠르게 소모합니다.
Realtime 구독은 연결 1개로 같은 일을 하므로 **무료 티어에서 오히려 폴링보다 저렴합니다.**

### 8.2 설정

```sql
alter publication supabase_realtime add table public.interview_sessions;
alter table public.interview_sessions replica identity default; -- PK 기반. 전체 행 전송 불필요
```

- 구독 대상 컬럼: `status`, `pause_reason`, `resumable_after`, `current_modality`, `failure_reason`.
- 클라이언트 필터: `filter: 'id=eq.{sessionId}'` — 세션 하나만 구독합니다.
- **Realtime도 RLS를 따릅니다.** `sessions_select_own` 정책이 있으므로 남의 세션 변경은 전달되지 않습니다.
  RLS가 없으면 구독으로 전체 테이블이 새어 나갑니다.

### 8.3 구독하지 않는 것과 그 근거

| 테이블 | 왜 안 하나 |
|---|---|
| `turns` | 면접 중 대화 흐름은 **같은 클라이언트가 만든 것**이므로 서버 응답으로 이미 알고 있습니다. 구독하면 자기 발화가 되돌아와 중복 렌더링됩니다 |
| `questions` | 위와 같음. 질문은 API 응답으로 전달됩니다 |
| `evaluations` / `evaluation_scores` | 세션 상태가 `evaluated`가 되면 그때 한 번 fetch하면 충분합니다. 부분 결과를 실시간으로 보여주지 않습니다 |
| `session_events` | 감사 로그. 사용자에게 실시간으로 보여줄 것이 없습니다 |

Realtime 테이블을 1개로 묶는 것은 무료 티어의 동시 연결·메시지 수 한도를 아끼려는 선택이기도 합니다.

---

## 9. 삭제 정책 — 실제 삭제(하드 삭제)

**소프트 삭제 컬럼(`deleted_at` 등)을 어느 테이블에도 두지 않습니다.** 브리프 7절 확정 사항입니다.

### 9.1 경로 1 — 세션 단위 삭제 (`/sessions` 목록의 삭제 버튼)

서버 라우트(`admin.ts`, service_role)가 다음 순서로 처리합니다.

```
1. 세션 소유권 확인 (user_id = 요청자)
2. delete from public.interview_sessions where id = :sessionId
   └ FK CASCADE로 아래가 함께 사라짐:
       questions (자기 참조 CASCADE로 꼬리질문까지)
       turns
       session_events
       report_feedback
       evaluations → evaluation_scores → evaluation_citations
       evaluation_scores → score_disputes
3. Storage 정리 없음 — documents는 삭제되지 않음
```

**`documents`는 함께 지우지 않습니다.** 다른 세션이 같은 이력서를 참조할 수 있고, "같은 이력서로 다시 하기"(지표 3)의
전제이기 때문입니다(`01_domain_model.md` 4절). 세션 삭제는 Storage를 건드리지 않습니다.

**스냅샷은 세션 행 안에 있으므로 세션과 함께 사라집니다**(2026-09-09 D6). `resume_text_snapshot` / `jd_text_snapshot`은
별도 테이블이 아니라 `interview_sessions`의 컬럼이라 추가 정리 단계가 필요 없습니다 —
세션 1행을 지우면 그 세션이 읽었던 텍스트도 함께 사라집니다. 이것이 "실제 삭제" 원칙과 맞습니다.

CASCADE만으로 전부 사라지는지는 위 FK 표가 보장합니다. 어떤 자식 테이블도 `on delete set null`이나 `restrict`가 아닙니다
(단 `resume_document_id`/`jd_document_id`/`source_session_id`는 의도적으로 `set null` — 이들은 자식이 아니라 참조입니다).

### 9.2 경로 2 — 문서 단위 삭제 (`/documents` 보관함) — **2026-09-09 D6으로 재설계**

스냅샷이 생기면서 **문서 삭제가 과거 세션에 미치는 영향이 크게 줄었습니다.** 예전에는 문서를 지우면
그 세션이 무엇을 읽었는지가 사라졌지만, 이제 근거 텍스트는 세션 안에 남습니다. 그래서 이 경로는
**세션 쪽을 아무것도 바꾸지 않고 문서만 지우는 단순 경로**가 됩니다.

```
1. 소유권 확인
2. 참조 중인 세션이 있으면 UI에서 경고 후 사용자 확인 (경고 문구가 바뀝니다 — 아래)
3. delete from public.documents where id = :documentId
   └ BEFORE DELETE 트리거가 storage_cleanup_queue에 storage_path를 넣음
   └ 참조하던 interview_sessions.resume_document_id / jd_document_id는 NULL이 됨 (출처 링크만 끊김)
   └ resume_text_snapshot / jd_text_snapshot은 그대로 남음 → 과거 리포트·전사·질문 근거가 온전
4. 스위퍼가 큐를 읽어 Storage API로 객체 실제 삭제 → status='done'
```

**FK 동작은 `set null` 그대로입니다**(2절 재검토 표). `cascade`는 리포트를 지우므로 채택 불가이고,
`restrict`는 스냅샷이 생긴 지금 막을 이유가 사라졌습니다.

**경고 문구가 바뀝니다** (`shadcn-ui-engineer` 전달 — 12절)

| | 잃는 것 | 남는 것 |
|---|---|---|
| 이전(참조만) | 과거 세션의 근거 텍스트, 재추출, 원본 열람 | 리포트 숫자만 |
| **현재(스냅샷)** | **원본 파일 열람 / 재추출 / 지표 3의 "같은 이력서" 묶음** | 리포트·전사·질문·근거 텍스트 전부 |

→ "이 이력서를 사용한 과거 면접 N건의 내용은 그대로 남습니다. 원본 파일만 삭제되며, 이후 이 이력서로
다시 면접을 보려면 새로 올려야 합니다." 정도의 문구가 사실과 맞습니다.
**"과거 리포트가 손상된다"는 취지의 경고는 이제 거짓이므로 쓰지 마세요.**

**`ready` 이전 세션에는 예외가 있습니다.** `created` / `configuring` 상태의 세션은 아직 스냅샷을 복사하지
않았으므로(3.3절), 참조하던 문서가 지워지면 `configuring → ready` 가드를 통과할 수 없게 됩니다
(`resume_document_id`가 NULL이 되어 "이력서 있음" 조건이 깨짐). 이것은 **정상 동작**입니다 —
사용자는 설정 화면에서 다른 문서를 고르면 되고, 스키마가 막아야 할 상황이 아닙니다.
UI 경고에서 이 세션들은 "설정 중인 세션 N건에서 이력서를 다시 골라야 합니다"로 따로 셉니다.

### 9.3 경로 3 — 계정 삭제 (`/settings/account`)

```
1. 사용자 재인증(비밀번호 재확인)
2. 서버가 Storage에서 documents/{user_id}/ 폴더의 객체를 나열해 일괄 삭제
   supabase.storage.from('documents').list(user_id) → .remove([...paths])
   ※ DB 삭제보다 먼저 합니다. profiles가 사라지면 어떤 경로를 지워야 할지 알 수 없게 됩니다.
3. auth.admin.deleteUser(user_id)
   └ auth.users 삭제 → profiles CASCADE
       → documents CASCADE (트리거가 남은 경로를 큐에 넣어 2단계 누락분을 보정)
       → interview_sessions CASCADE → 세션 하위 전부
       → report_feedback / score_disputes CASCADE
4. 스위퍼가 큐의 잔여분을 처리
5. storage_cleanup_queue의 done 행은 30일 후 삭제(운영 로그 보존)
```

**2단계와 3단계의 이중 안전장치가 핵심입니다.** Storage 삭제가 실패해도 트리거가 큐에 남기므로
파일이 조용히 남는 일이 없습니다. 반대로 큐 처리가 실패해도 2단계에서 대부분 이미 지워져 있습니다.

### 9.4 스위퍼 (Storage 정리 워커)

- 실행: Vercel Cron (일 1회) 또는 삭제 라우트가 동기적으로 1회 시도한 뒤 실패분만 큐에 남기는 방식.
- 동작: `status = 'pending'`을 오래된 순으로 최대 200건 읽어 `storage.remove()` 호출 → `done` 또는 `attempt_count += 1`, `failed`.
- 부수 작업: `documents`에 대응 행이 없는 24시간 이상 된 고아 객체 제거(7.4절).
- 이 워커는 `service_role`을 쓰므로 서버에서만 돕니다.

### 9.5 삭제되지 않는 것 — 명시

`session_events`는 세션과 함께 사라집니다. 즉 **삭제된 세션은 지표 1·2·3의 분모에서도 사라집니다.**
이것은 의도된 결과입니다(사용자가 지운 데이터를 집계에 남기면 실제 삭제가 아닙니다).

**삭제된 세션의 지표를 남기는 별도 집계 테이블은 두지 않습니다** (2026-09-09 D9 확정 — 옵션 A).

- "실제 삭제"는 브리프 7절의 확정 제약입니다. `session_id`를 해시로 익명화하더라도 **사용자가 지운 세션의 흔적이
  남는 것**은 그 약속과 어긋납니다. 지표는 아직 베이스라인 수집 단계라 정확도보다 원칙이 우선합니다.
- 따라서 이 문서의 테이블 수는 **12개 그대로**이고, `session_metrics_archive` 류의 13번째 테이블은 없습니다.
  삭제 트리거도 늘어나지 않습니다(세션 삭제 시 다른 테이블에 무언가를 남기는 경로가 하나도 없습니다).
- **대가:** 지표 1(완주율)·2(리포트 도달률)·3(재도전율)의 분모가 삭제로 줄어듭니다.
  특히 "면접이 잘 안 풀린 세션일수록 지우기 쉽다"면 완주율이 **실제보다 높게** 나옵니다 —
  숫자를 읽을 때 이 편향 방향을 기억해야 합니다.
- **되돌리는 조건:** 삭제율이 높게 나와 지표를 믿기 어려워지면 그때 다시 판단합니다.
  다시 판단할 때 필요한 값(삭제 자체의 빈도)은 세션 삭제 라우트의 **애플리케이션 로그**로 봅니다 — DB 테이블이 아닙니다.

---

## 10. 마이그레이션 파일 분할 계획 (다음 Phase 적용 순서)

`supabase/migrations/` 아래에 아래 순서로 만듭니다. 파일명 접두사는 실제 적용 시각의 타임스탬프로 대체합니다.

| # | 파일명 | 내용 |
|---|---|---|
| 1 | `20260909000100_init_extensions_and_helpers.sql` | `pgcrypto` 확인, 공통 트리거 함수 `set_updated_at()` |
| 2 | `20260909000200_profiles_and_auth_trigger.sql` | `profiles` + RLS + 정책 + `handle_new_user()` 트리거 |
| 3 | `20260909000300_documents.sql` | `documents` + CHECK + RLS + 정책 + 인덱스 |
| 4 | `20260909000400_interview_sessions.sql` | `interview_sessions`(**`resume_text_snapshot`·`jd_text_snapshot` 포함**) + **상태 CHECK** + 정합 제약(`sessions_snapshot_required_after_ready` 포함) + RLS + select 정책 + 인덱스 |
| 5 | `20260909000500_questions_and_turns.sql` | `questions`(**`archetype_id`·`seed_version`·`probe_hints` 포함**), `turns` + CHECK + RLS + 정책 + 인덱스 |
| 6 | `20260909000600_session_events.sql` | `session_events` + 상태 CHECK 2개 + RLS + 정책 + 인덱스 |
| 7 | `20260909000700_evaluations.sql` | `evaluations`(**`coach_payload`·`ai_contract_version`·`provider` 포함**), `evaluation_scores`(**`improvement`은 NULL 허용**), `evaluation_citations` + CHECK + RLS + 정책 + 인덱스 |
| 8 | `20260909000800_feedback_and_disputes.sql` | `report_feedback`, `score_disputes` + RLS + 정책 + 부분 unique 인덱스 |
| 9 | `20260909000900_storage_bucket_and_policies.sql` | `documents` 버킷 생성 + `storage.objects` 정책 4개 |
| 10 | `20260909001000_storage_cleanup_queue.sql` | `storage_cleanup_queue` + RLS(정책 0개) + `enqueue_storage_cleanup()` 트리거 |
| 11 | `20260909001100_realtime_publication.sql` | `supabase_realtime`에 `interview_sessions` 추가 |

**파일 개수는 11개 그대로입니다.** D6·D7·D8·D9·D10 어느 것도 새 테이블·새 트리거·새 인덱스를 부르지 않고,
D8은 SQL이 아니라 프로젝트 설정입니다(6.1절).

**2026-09-09 리더 조정 3 — 변경분은 별도 ALTER 마이그레이션이 아니라 위 CREATE TABLE 파일에 흡수합니다.**

아직 어떤 마이그레이션도 작성·적용하지 않았으므로(이 문서는 여전히 설계 단계입니다) `ALTER TABLE ... ADD COLUMN`
마이그레이션을 따로 만들 이유가 없습니다. 적용 전 스키마에 대한 ALTER는 **처음부터 존재하지 않았던 컬럼을
있었던 것처럼 보이게 하는 잡음**이며, 마이그레이션 목록을 읽고 스키마를 재구성하는 사람에게 거짓 이력을 남깁니다.

| 조정 | 흡수 대상 파일 | 형태 |
|---|---|---|
| `questions.archetype_id` / `seed_version` / `probe_hints` | #5 | `create table`의 컬럼 목록 + `probe_hints` CHECK |
| `evaluations.coach_payload` / `ai_contract_version` / `provider` | #7 | `create table`의 컬럼 목록 + `coach_payload` 오브젝트 CHECK |
| `evaluation_scores.improvement` not null 해제 | #7 | `create table`에서 `not null`을 쓰지 않고 길이 CHECK만 부여 |
| **(2차) `interview_sessions.resume_text_snapshot` / `jd_text_snapshot`** (D6) | **#4** | `create table`의 컬럼 목록 + 길이 CHECK 2개 + `sessions_snapshot_required_after_ready` 제약 |

**2차 조정도 같은 규칙을 따릅니다** (2026-09-09 D6). 아직 어떤 마이그레이션도 원격에 적용하지 않았으므로
`ALTER TABLE public.interview_sessions ADD COLUMN resume_text_snapshot ...` 파일을 **만들지 않습니다.**
D6은 "컬럼을 나중에 붙인 것"이 아니라 **"처음부터 스냅샷 방식이었던 것"**이므로, 파일 #4의 `create table`이
그 사실을 있는 그대로 보여줘야 합니다. 스냅샷 없이 세션 테이블이 존재했던 시점은 실제로 없습니다.

**이 규칙은 "첫 적용 전"에만 유효합니다.** 위 11개 파일 중 **하나라도 원격에 적용된 뒤에는**
어떤 스키마 변경도 반드시 `#12` 이후의 **새 ALTER 마이그레이션**으로만 처리합니다. 적용된 파일을 고치면
로컬과 원격의 마이그레이션 해시가 갈라져 이후 모든 적용이 막힙니다.

**규칙**
- 각 파일은 **테이블 생성 + `enable row level security` + 정책 생성을 한 파일 안에서** 끝냅니다. 정책 없는 창을 만들지 않습니다.
- 순서는 FK 의존성을 따릅니다(2 → 3 → 4 → 5·6·7 → 8).
- **이미 적용된 마이그레이션 파일은 절대 수정하지 않습니다.** 변경은 새 파일로 추가합니다.
- 파괴적 변경(컬럼 삭제, 타입 변경)은 실행 전 리더에게 확인을 받습니다.
- 적용 확인: 마이그레이션 후 5.4절의 두 쿼리를 실행해 0행인지 검사합니다.

---

## 11. 타입 생성 방침

```bash
# 로컬 스택
supabase gen types typescript --local > src/lib/supabase/database.types.ts

# 연결된 원격 프로젝트
supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts
```

- 출력 경로: `src/lib/supabase/database.types.ts` (단일 파일)
- **마이그레이션을 추가할 때마다 반드시 재생성**하고 같은 커밋에 포함합니다. 스키마보다 뒤처진 타입은 컴파일은 통과하면서 런타임에 `undefined`를 냅니다.
- CI에서 `supabase gen types` 결과와 커밋된 파일의 diff가 비면 통과하는 검사를 두는 것을 권장합니다(`vercel-platform-engineer`와 협의).

### 11.1 snake_case → camelCase 변환은 여기서 하지 않습니다

```
DB / 생성된 타입 : snake_case   (session_id, created_at, main_question_budget)
        ↓  변환은 여기서 단 한 번
API 라우트 응답   : camelCase    (sessionId, createdAt, mainQuestionBudget)
프론트 타입      : camelCase (API 응답과 동일)
```

- `database.types.ts`는 **DB 그대로 snake_case**입니다. 생성 단계에서 변환하지 않습니다.
- 서버 코드가 Supabase 클라이언트로 읽은 행은 snake_case이고, **API 라우트의 응답 직렬화 지점에서만** camelCase로 바꿉니다.
- 프론트엔드는 snake_case를 절대 보지 않으며, 서버 코드는 camelCase를 절대 만들지 않습니다(응답 경계 제외).
- **값은 변환 대상이 아닙니다.** `status`의 `in_progress`, 축 식별자 `job_knowledge`, `reason_code`의 `transcription_error` 등은
  필드명이 아니라 값이므로 **문자열 그대로** 오갑니다. 이것을 camelCase로 바꾸면 CHECK 제약과 API 계약이 동시에 깨집니다.

---

## 12. 팀 전달 사항

| 대상 | 전달 내용 |
|---|---|
| `vercel-platform-engineer` | 테이블·컬럼명은 이 문서 3절이 확정본. 타입 경로 `src/lib/supabase/database.types.ts`. **세션·질문·턴·이벤트·평가 계열은 클라이언트 쓰기 정책이 없으므로 반드시 서버 라우트 + `admin.ts`로 써야 합니다.** 삭제 라우트 3종(세션/문서/계정)이 필요합니다 |
| `qa-inspector` | 12개 테이블 전부 RLS 활성화. 5.4절 두 쿼리를 회귀 검사에 넣어 주세요. DB CHECK로 강제하지 못하는 **4가지**(질문 depth=부모+1, 축당 인용 최소 1건, 인용문이 실제 부분 문자열인지, **`is_insufficient_evidence = true`인 축에 인용이 0건인지** — 13.3절 R1)는 서버 책임이므로 별도 검증이 필요합니다 |
| `ai-interview-architect` | 평가 출력 저장 구조는 3.7–3.9절. 인용은 축당 1–3건, `quote_text` 20–160자, `quote_start`/`quote_end` 오프셋 필수, 근거 부족은 `score = NULL` + `is_insufficient_evidence = true`. 8절 대조 결과 참조 |
| `voice-pipeline-engineer` | **오디오 저장 경로가 없습니다.** `turns.transcript_text`(not null)가 정본, `transcript_raw`에 STT 원문, `stt_confidence`는 0–1 numeric |
| `shadcn-ui-engineer` | Realtime 구독은 `interview_sessions` 한 테이블, `id=eq.{sessionId}` 필터. Storage 다운로드는 서명 URL만 |
| `shadcn-ui-engineer` (조정 1) | **`evaluation_scores.improvement`는 NULL일 수 있습니다.** 코치 실패 시 그 축의 개선 제안 영역을 **감추세요**(플레이스홀더 문자열을 비교하거나 "생성 실패" 문구를 축마다 반복 노출하지 마세요). 세션 전체의 "코치 미완료" 판정은 `evaluations.summary IS NULL` 하나로 하고, 그때만 리포트 상단에 재시도 버튼을 한 번 노출합니다. 재시도는 UPDATE이므로 점수·인용은 그대로 유지됩니다 |
| `vercel-platform-engineer`·`shadcn-ui-engineer` (조정 4 / R3) | `evaluation_citations.quote_start`/`quote_end`는 **JS UTF-16 오프셋**입니다(서버 `indexOf` 산출값). 인용 하이라이트는 프론트엔드의 JS 문자열 슬라이싱으로만 하고, **Postgres `substring()`에 이 오프셋을 넣지 마세요** — 비-BMP 문자에서 어긋납니다 |
| `vercel-platform-engineer` (2차 / **D6**) | **`configuring → ready` 라우트가 스냅샷을 복사합니다.** `resume_text_snapshot` / `jd_text_snapshot`에 `documents.extracted_text`를 복사하고, 컨텍스트 요약·오프닝 질문 삽입과 **같은 트랜잭션**에서 커밋하세요(3.3절). `ready → configuring` 되돌리기에서는 두 컬럼을 **NULL로 되돌립니다.** `in_progress` 이후에는 어떤 라우트도 이 컬럼을 쓰지 않습니다 — 재개는 읽기만 합니다. 면접관·평가자 프롬프트의 이력서·JD 입력은 **`documents`가 아니라 세션의 스냅샷 컬럼에서** 읽으세요 |
| `vercel-platform-engineer` (2차 / **D7**) | `paused` 자동 종료 시한은 **7일**입니다. 스케줄러는 **일 1회** 그대로이며, 쿼리는 `where status = 'paused' and paused_at < now() - interval '7 days'`로 `idx_sessions_status_updated` 부분 인덱스를 탑니다 |
| `vercel-platform-engineer` (2차 / **D8**) | **배포 체크리스트 항목:** Supabase 프로젝트 설정에서 Authentication → Email → **Confirm email을 OFF**로 둡니다. 마이그레이션 SQL에 없으므로 새 프로젝트를 만들 때 놓치기 쉽습니다. 이 서비스에는 이메일 발송 경로가 하나도 없습니다 |
| `shadcn-ui-engineer` (2차 / **D6**) | `/documents` **삭제 경고 문구를 바꿔야 합니다.** 문서를 지워도 **과거 세션의 리포트·전사·질문 근거는 그대로 남습니다**(9.2절). 잃는 것은 원본 파일 열람·재추출·"같은 이력서로 다시 하기" 묶음뿐입니다. "과거 리포트가 손상된다"는 취지의 문구는 이제 사실이 아닙니다. 단 `created`/`configuring` 상태 세션은 이력서를 다시 골라야 하므로 따로 셉니다 |
| `shadcn-ui-engineer` (2차 / **D8**) | 회원가입 화면에 **입력한 이메일을 다시 확인하라는 안내 문구**를 두세요. 확인 메일이 없어 오타 주소로 가입하면 계정 복구 경로가 없습니다(6.1절). 이메일 재입력 필드는 두지 마세요 |
| `qa-inspector` (2차) | 새 회귀 항목 2개: (1) `configuring → ready` 이후 `resume_text_snapshot`/`jd_text_snapshot`이 채워지는지, (2) 원본 `documents` 행을 지운 뒤에도 과거 세션의 리포트 조회가 온전한지. DB CHECK가 강제하는 부분(`ready` 이후 스냅샷 not null)은 `sessions_snapshot_required_after_ready`가 잡지만, **복사된 내용이 실제 원본과 같은지는 스키마가 보지 못합니다** |
| `ai-interview-architect` (2차 / **D1**) | 총점 계산은 서버 책임이며 **`score = NULL`인 축(`is_insufficient_evidence = true`)은 가중치 합 `W`에서 제외**합니다 — 아래 참조 |

### 12.1 총점 가중치와 저장 구조의 정합 (2026-09-09 **D1**)

D1로 총점을 **숫자로 노출**하기로 확정됐습니다. `evaluations.overall_score`의 **구조 변경은 없습니다**
(`numeric(3,2)`, nullable, `check between 1.00 and 5.00`). 다만 노출되는 순간 계산 규칙이 사용자에게 보이므로,
저장 구조와 계산 규칙이 어긋나지 않는지 확인했습니다.

**규칙 — 인용이 없는 축은 총점 가중치 계산에서 제외됩니다.**

```
scored = [a for a in axes if a.is_insufficient_evidence = false]   # 곧 score is not null
W      = sum(weight[a] for a in scored)                            # 제외된 축의 weight는 W에 넣지 않음
overall_score = round(sum(weight[a] * score[a] for a in scored) / W, 2)
if len(scored) == 0:  overall_score = NULL,  evaluations.status = 'succeeded'
```

**저장 구조와 정합합니다.** 근거는 세 가지입니다.

1. **제외 대상을 판별할 값이 행 안에 있습니다.** `scores_evidence_shape` CHECK가
   `is_insufficient_evidence = true ⟺ score is null`을 **양방향으로** 강제하므로(3.8절),
   `where score is not null` 하나로 `scored`가 정확히 나옵니다. 두 컬럼이 어긋난 행은 저장될 수 없습니다.
2. **`weight`에 정규화 전 원값이 들어 있습니다.** `evaluation_scores.weight`는 페르소나 표의 **원값**이고
   정규화(`/W`)는 계산 과정에만 존재합니다(`02_ai_contracts.md` 5.4절). 그래서 제외 축이 생겨도
   **저장된 값을 고치지 않고** 남은 축의 원값만 다시 더하면 됩니다. 만약 정규화된 값을 저장했다면
   축 하나가 빠질 때마다 5행 전부를 UPDATE해야 했을 것입니다.
3. **`overall_score`가 nullable입니다.** 모든 축이 근거 부족이면 `W = 0`이 되어 나눗셈이 성립하지 않습니다.
   이때 컬럼은 NULL을 받고 `evaluations.status`는 `'succeeded'`로 남습니다 — **실패가 아니라 "점수 없는 리포트"**입니다.

**서버 책임으로 못박습니다** (`vercel-platform-engineer`·`ai-interview-architect`):

- 총점은 **평가 워커가 저장 시 한 번 계산해 컬럼에 넣습니다.** 조회할 때마다 다시 계산하지 않습니다 —
  같은 리포트가 코드 버전에 따라 다른 숫자를 보이면 안 됩니다.
- **`W = 0`일 때 0으로 나누지 마세요.** `len(scored) == 0`을 먼저 검사하고 NULL을 넣습니다.
  이 분기를 빠뜨리면 근거 부족 리포트가 저장 단계에서 통째로 실패합니다.
- **제외된 축도 `evaluation_scores` 행은 그대로 만듭니다.** 행을 만들지 않으면
  리포트에서 "이 축은 근거가 부족했다"를 보여줄 수 없고, `unique (evaluation_id, axis)` 5행 전제도 깨집니다.
- **UI는 총점 옆에 몇 개 축이 반영됐는지 함께 보여야 합니다.** 5축 중 2축만 채점된 총점 4.5와
  5축 전부 채점된 4.5는 같은 숫자가 아닙니다. 이 정보는 `score is null` 행 수로 세면 됩니다 — 별도 컬럼을 두지 않습니다.

---

## 13. AI 계약과의 대조 (2026-09-09 실제 대조 결과)

`_workspace/02_ai_contracts.md`가 나왔습니다. 이 절은 "계약 문서 없음" 상태의 확인 요청 목록이 아니라
**실제 대조 결과**입니다. 대조 대상은 계약 문서 5.2·5.3·5.4·5.5·6.2·6.4절과 이 문서 3.4·3.7·3.8·3.9절입니다.

### 13.1 11개 대조 지점 — 결과

| # | 대조 지점 | 이 문서의 전제 | 계약 문서가 만족시키는 방식 | 판정 |
|---|---|---|---|---|
| 1 | 축 식별자 5개 | CHECK 5개 값으로 고정 | 5.2절 `axes[].axis`가 `$defs/axis`를 `$ref`하고, 그 enum이 CHECK 값과 **문자 단위로 동일**. 계약 1절 주석이 "번역 금지"를 명시 | **정합** |
| 2 | 점수 타입·범위 | `score int`, 1–5 정수 | 5.2절 `"type": ["integer","null"], minimum 1, maximum 5` + description이 소수(3.5)·0·`"N/A"`를 명시적으로 금지 | **정합** |
| 3 | 근거 부족 표현 | `score = NULL` + `is_insufficient_evidence = true` | 5.2절 description과 5.3절 검증 알고리즘이 이 조합을 강제. 계약이 여기에 **`citations`는 빈 배열**이라는 조건을 하나 더 붙임 | **정합**(조건 1개 추가 — 13.2절 R1) |
| 4 | 인용 건수 | 축당 1–3건, `citation_index` 0–2 | 5.2절 `minItems 0 / maxItems 3` + `citation_index` 0–2 + 5.3절이 `citation_index`를 **0..n-1로 재부여**. 재부여가 있으므로 폐기로 구멍이 나도 `unique (score_id, citation_index)`와 `citation_index ≤ 2` CHECK를 항상 통과 | **정합** |
| 5 | 인용 길이 20–160자 | `char_length` CHECK | 5.2절 `minLength 20 / maxLength 160` + 5.3절이 저장 전 길이를 **한 번 더** 검사(스키마 강제를 믿지 않음) | **정합**(문자 셈 단위 주의 — R2) |
| 6 | 인용 오프셋 | `quote_start`/`quote_end` **not null**, `quote_end > quote_start` | 5.3절이 `idx = turn.transcript_text.indexOf(c.quote_text)`로 **서버가 계산**하고, `idx < 0`이면 그 인용을 폐기. `quote_end = idx + len`이므로 `quote_end > quote_start`가 **자동 보장**됨(길이 ≥ 20이므로 0 길이 인용이 없음). 5.2절은 AI 출력에서 두 필드를 **물리적으로 제거**해 "AI가 오프셋을 지어낼" 경로 자체를 없앰 | **정합 — not null 컬럼이 채워지지 않는 경로가 없음**(R2·R3 단서) |
| 7 | 인용 출처 `turn_id` | not null FK → `turns` | 5.2절이 `turn_id`를 `required`로 두고 "반드시 `role='candidate'`인 턴"으로 제한. 5.3절이 `turns_by_id`에 없는 id와 면접관 턴을 폐기. **서버 텍스트 매칭으로 턴을 추정하는 경로가 없음** | **정합** |
| 8 | 총점 | `overall_score numeric(3,2)`, 1.00–5.00, nullable | 5.4절이 서버 계산이며 `round(..., 2)`로 소수 2자리. 채점된 축이 0개면 `overall_score = null` + `status = 'succeeded'` → 우리 컬럼이 nullable이므로 수용됨 | **정합** |
| 9 | 개선점 | `evaluations.improvements jsonb` 배열 | 6.2절 `improvements`가 오브젝트 3건 배열(`priority`/`title`/`action`/`related_axis`), 6.4절이 "문자열 한 덩어리 금지"를 명시. 3.7절 예시에 `related_axis`를 반영해 맞춤 | **정합**(개수 강제는 앱 책임 — R4) |
| 10 | 총평 | `evaluations.summary text` | 6.2절 `summary` 80–700자, 6.3절이 문장 수 3–5를 검증. 컬럼에 길이 CHECK가 없어 앱이 더 엄격 — 정상 관계 | **정합** |
| 11 | 가중치 | `evaluation_scores.weight numeric(4,3)` not null, 서버가 페르소나 표에서 채움 | 5.2절 출력에 `weight`가 **없고**, 5.5절이 "서버가 페르소나 표에서 채운다"로 못박음. 5.4절이 **정규화 전 원값**을 저장하도록 지정 → `0 ≤ weight ≤ 1` CHECK와 정합 | **정합** |

### 13.2 리더가 지정한 3개 검증 지점

**(가) 평가자 출력 최상위가 `rubric_version` / `axes` / `flags` 3개뿐이고 `weight`·`overall_score`·`summary`가 없다는 점**

우리 저장 구조와 **정합하며, 오히려 우리 설계를 강화합니다.**

| 우리 컬럼 | 평가자 출력에 없는 이유 | 채우는 주체 |
|---|---|---|
| `evaluation_scores.weight` (not null) | 페르소나 가중치는 `01_rubric.md` 3절의 **서버 상수** | 서버(저장 시) |
| `evaluations.overall_score` (nullable) | 가중 평균은 **계산값** | 서버(5.4절) |
| `evaluations.summary` (nullable) | 총평의 생산 주체는 **코치** | 코치(6.4절) |
| `evaluations.improvements` (nullable) | 우선순위 개선점도 코치 | 코치 |
| `evaluation_scores.improvement` (**nullable로 완화**) | 축별 개선 제안도 코치 | 코치(UPDATE) |

세 컬럼(`overall_score`·`summary`·`improvements`)과 `improvement`가 **전부 nullable**이고 `weight`만 not null인 것이
이 책임 분리와 정확히 맞물립니다. `weight`는 서버 상수라 평가자 성공 시점에 **항상** 알 수 있고,
나머지는 평가자 성공 시점에 **아직 존재하지 않기 때문**입니다. 조정 1(`improvement` 완화)로 이 규칙에 예외가 사라졌습니다.

계약 5.2절이 `additionalProperties: false`로 이 필드들을 **물리적으로 금지**하므로,
"평가자가 자기 가중치를 매겨 보내고 서버가 덮어쓰는" 경합이 아예 발생하지 않습니다.

**(나) `quote_start`/`quote_end`를 서버가 `indexOf`로 계산하는 방식과 not-null 오프셋 컬럼의 정합성**

**정합합니다.** 검증 순서가 not null을 구조적으로 보장합니다.

```
indexOf < 0  →  인용 폐기       (행을 만들지 않음 → not null 위반 불가)
indexOf ≥ 0  →  quote_start = idx, quote_end = idx + len(quote_text)
                (len ≥ 20이 이미 검사됨 → quote_end > quote_start 자동 성립)
축의 유효 인용이 0건  →  부분 저장하지 않고 평가 전체 재시도
```

`citations_offset_order check (quote_end > quote_start)`가 **절대 걸리지 않는** 방어선이 됩니다.
이것이 정상입니다 — CHECK는 정상 경로에서 발동하지 않고 코드 버그가 생겼을 때만 발동해야 합니다.

단, 두 가지 단서를 남깁니다(R2·R3).

**(다) `citation_index` 재부여 / 인용 20–160자 CHECK / `score = NULL` + `is_insufficient_evidence` 조합**

| 항목 | 검증 결과 |
|---|---|
| `citation_index` 재부여 | 5.3절이 폐기 후 **0..n-1로 재부여**하므로 `unique (score_id, citation_index)`와 `check (citation_index between 0 and 2)`를 항상 만족. 재부여가 없었다면 "0, 2번만 남은" 상태가 unique는 통과하되 UI 순서가 어긋났을 것 — 계약이 이를 막음 |
| 20–160자 CHECK | 5.2절 스키마 + 5.3절 서버 검사의 **이중 방어** 뒤에 DB CHECK가 3중째. 세 곳의 경계값이 모두 `20`·`160`으로 동일(off-by-one 없음) |
| `score = NULL` + `is_insufficient_evidence` | `scores_evidence_shape` CHECK의 두 방향(true→null, false→not null)이 5.2절 description·5.3절 assert와 **양방향 모두** 일치. 계약이 추가하는 "citations 0건" 조건만 DB가 강제하지 못함(R1) |

### 13.3 남은 불일치 — 재검토 결과 (2026-09-09 2차 조정)

**R5·R7이 해소됐습니다.** 남은 것은 5건이며, 그중 어느 것도 스키마 변경을 부르지 않습니다.

| # | 상태 | 처리 |
|---|---|---|
| R1 | **남음** | QA 체크리스트(스키마로 해결 불가) |
| R2 | **남음** | 실무 영향 낮음. 서버 구현 지침 |
| R3 | **남음** | 문서·전달로 처리(12절에 전달 완료) |
| R4 | **남음** | 의도적으로 CHECK를 두지 않음 |
| R5 | **해소 (D10)** | 코치 시도 횟수 컬럼을 **추가하지 않습니다.** `session_events`로 관측하고, `attempt_count`가 평가자 시도만 센다는 사실을 3.7절에 명시했습니다 |
| R6 | **남음(의도)** | 이미 "의도적으로 두는 여유"로 확정된 항목 |
| R7 | **해소 (D5)** | `wrap_up`은 **`turns`에만** 기록합니다. 옵션 A 확정이므로 `questions_kind_shape`·`question_kind` CHECK **둘 다 그대로**이며, 이 문서의 스키마는 변경되지 않았습니다 |

**R7 해소의 의미 — 스키마 변경을 부르던 유일한 미결이 사라졌습니다.**
`wrap_up`을 `questions`에도 남겼다면 `question_kind`에 세 번째 값이 필요하고,
`questions_kind_shape`(main은 부모 없음 / follow_up은 부모 있음)의 두 갈래가 어느 쪽도 맞지 않아
제약 자체를 다시 써야 했습니다. 더 중요한 것은 지표 6(세션당 최초 질문 대비 후속 질문 수의 중앙값)의
**분모가 세션마다 1씩 부풀었을 것**이라는 점입니다 — `wrap_up`은 질문이 아니라 마무리 발화입니다.
`turns`에만 남기면 `role = 'interviewer'`, `question_id is null`인 평범한 행 하나이며, 이는 현재 스키마가
이미 허용합니다(`turns.question_id`는 nullable).

**R5 해소의 의미.** `evaluations`에 컬럼이 늘지 않으므로 마이그레이션 #7도 그대로입니다.

아래는 원래의 7건 전문입니다(해소된 2건은 위 표를 함께 보세요).



| # | 지점 | 내용 | 성격 |
|---|---|---|---|
| R1 | 계약 5.2·5.3절 vs 이 문서 3.8·3.9절 | `is_insufficient_evidence = true`면 **인용 0건**이어야 하는데, 이는 `evaluation_scores`와 `evaluation_citations`에 걸친 조건이라 단일 행 CHECK로 표현할 수 없다. 근거 부족 축에 인용이 붙어도 DB는 막지 못한다 | **QA 체크리스트 항목**(12절 `qa-inspector` 행의 기존 3가지에 이어 4번째). 스키마로는 해결 불가 |
| R2 | 계약 5.3절 `len(c.quote_text)` vs 이 문서 3.9절 `char_length` | JS `String.length`는 **UTF-16 코드 단위**, Postgres `char_length`는 **코드포인트**다. 한글·영문은 같지만 이모지(서로게이트 페어)가 섞이면 JS 기준 160자가 DB 기준 160자를 넘거나 그 반대가 될 수 있다. 경계 근처 인용에서만 재현되는 저장 실패 | 실무 영향 낮음(면접 전사에 이모지가 드묾). 서버가 `[...str].length`로 세면 완전히 사라짐 |
| R3 | 계약 5.3절 `indexOf` 산출값의 의미 | `quote_start`/`quote_end`는 **JS UTF-16 오프셋**이다. 이 값을 Postgres `substring(transcript_text from quote_start+1 ...)`에 그대로 넣으면 비-BMP 문자에서 어긋난다. **DB 안에서 오프셋으로 원문을 다시 자르는 쿼리를 쓰면 안 된다**는 제약이 계약 어디에도 적힌 적이 없다 | 하이라이트는 프론트(JS)에서만 하면 안전. `vercel-platform-engineer`·`shadcn-ui-engineer`에게 전달 필요 |
| R4 | 계약 6.2절 `improvements` minItems/maxItems 3 vs 이 문서 3.7절 | 정확히 3건이라는 제약을 DB가 강제하지 않는다(`jsonb`에 개수 CHECK 없음) | 앱 검증(6.3절)이 이미 잡음. CHECK 추가는 선택 사항이며 코치 출력 형태가 바뀔 때 마이그레이션을 부르므로 **두지 않는 쪽을 권합니다** |
| R5 | 계약 8절 "코치 재시도 최대 2회" vs 이 문서 3.7절 `attempt_count` | `attempt_count`는 **평가자 시도 횟수**만 담는다(CHECK 0–3). 코치 시도 횟수를 담을 컬럼이 없어, 코치가 몇 번 만에 성공/실패했는지 추적할 수 없다 | ~~컬럼 추가(`coach_attempt_count int`)가 필요한지 리더 판단~~ → **해소(D10): 추가하지 않고 `session_events`로 관측.** 3.7절 참조 |
| R6 | 계약 9절 #8 vs 이 문서 3.9절 | 루브릭·계약은 인용 `comment`를 **필수**로 하는데 컬럼은 NULL 허용이다 | 계약 5.2절이 AI 출력에서 `required`로 강제하므로 실무상 NULL이 들어올 경로가 없음. **의도적으로 두는 여유**로 확정하며 컬럼은 바꾸지 않습니다 |
| R7 | 계약 10절 `[결정 필요]` wrap_up | 면접관의 `wrap_up` 발화를 `questions`에도 남길지 미결. 옵션 B를 택하면 `questions_kind_shape` CHECK와 `question_kind` CHECK를 모두 바꿔야 한다 | ~~스키마 변경을 부르는 유일한 미결 항목~~ → **해소(D5): 옵션 A(`turns`에만) 확정.** 이 문서의 CHECK는 그대로입니다 |

**불일치를 어느 쪽도 임의로 바꾸지 않습니다.** R1·R3는 문서·체크리스트로 처리하고,
**R5·R7은 리더 결정(D10·D5)으로 해소됐습니다.** R2·R4·R6은 의도적으로 남기는 여유입니다.

**2차 조정에서 새로 발견한 불일치는 없습니다.** D6(스냅샷)은 `02_ai_contracts.md`의 평가자·코치 입출력 계약을
건드리지 않습니다 — 계약은 이력서·JD 텍스트를 프롬프트 입력으로만 다루고 그 텍스트가 어디에 저장돼 있는지는
규정하지 않기 때문입니다. 다만 **면접관·평가자 프롬프트를 채우는 서버 코드가 `documents`가 아니라 세션의
스냅샷 컬럼에서 읽어야 한다**는 점은 계약 문서에 없는 구현 지침이라 12절로 전달했습니다.

---

## 14. 결정 완료

남은 미결 없음. (2026-09-09)

이 문서가 잠정값으로 열어 두었던 `[결정 필요]` **6건이 전부 확정됐습니다.**
전체 결정 기록과 근거는 [`00_input/decisions.md`](00_input/decisions.md)입니다.

| 이 문서의 옛 미결 | 확정 | 이 문서에 반영된 곳 | 스키마 변경 |
|---|---|---|---|
| 추출 성공 후 원본 파일 보관 여부 | **D3 — 계속 보관**(옵션 A) | 7.5절 | 없음 |
| 삭제된 세션의 지표 집계 테이블 | **D9 — 두지 않음**(옵션 A) | 9.5절 | 없음(테이블 12개 유지) |
| 이메일 확인(confirm email) | **D8 — 끔**(잠정값 뒤집힘) | 6.1절 | 없음(프로젝트 설정) |
| `paused` 자동 종료 시한 | **D7 — 7일**(잠정값 뒤집힘) | 3.3절 인덱스 서술 | 없음 |
| 코치 시도 횟수 컬럼 | **D10 — 추가 안 함**(옵션 A) | 3.7절, 13.3절 R5 | 없음 |
| `documents` 스냅샷 여부 | **D6 — 스냅샷**(잠정값 뒤집힘) | 3.3절, 2절, 9.2절, 4절, 10절 | **있음 — 컬럼 2개** |

이 문서 밖에서 확정되어 여기에 반영된 것: **D1**(총점 숫자 노출 → 12.1절 가중치 규칙),
**D4**(이의 제기는 수집만 → 3.11절), **D5**(`wrap_up`은 `turns`에만 → 13.3절 R7).

**뒤집힌 잠정값은 3건입니다**(D6·D7·D8). 그중 스키마를 바꾼 것은 **D6 하나뿐**이며,
아직 마이그레이션을 적용하지 않았으므로 ALTER가 아니라 파일 #4의 `create table`에 흡수됩니다(10절).

### 14.1 남은 것 — 판단이 아니라 **측정**이 필요한 항목

아래는 결정이 아니라 구현 착수 시 실측으로 확인할 값입니다. 어느 것도 스키마를 바꾸지 않습니다.

```
[확인 필요] 스냅샷 텍스트가 실제로 세션당 몇 KB인가
  근거: 3.3절은 상한 200,000자를 CHECK로 두었지만, 실제 이력서·JD는 수십 KB 수준으로 가정했습니다(4절).
  확인 시점: Phase 3에서 첫 세션 20~30건이 쌓인 뒤
  확인 방법: select pg_size_pretty(sum(pg_column_size(resume_text_snapshot) + pg_column_size(jd_text_snapshot)))
             from public.interview_sessions;
  가정이 틀렸을 때: 상한을 낮추거나(마이그레이션), 스냅샷을 원본 대신 context_summary로 대체하는 안을 재검토
```

```
[확인 필요] Storage 원본 파일 누적이 무료 티어 한도에 언제 닿는가
  근거: D3으로 원본을 계속 보관하므로 용량이 단조 증가합니다(7.5절). 줄어드는 힘이 없습니다.
  확인 시점: 상시(Supabase 대시보드 Storage 사용량)
  가정이 틀렸을 때: D3을 되돌리는 결정이 필요합니다 — 스키마가 아니라 정책 변경입니다
```

```
[확인 필요] 부분 인덱스 idx_sessions_status_updated가 7일 시한에서도 충분히 작은가
  근거: 3.3절은 paused 행이 최대 7배 오래 남아도 비용이 무시할 수준이라고 판단했습니다.
  확인 시점: Phase 3 이후 세션 수가 수백 건을 넘을 때
  확인 방법: select pg_size_pretty(pg_relation_size('idx_sessions_status_updated'));
  가정이 틀렸을 때: where 절에서 'completed'·'evaluating'을 떼고 워치독용 인덱스를 분리
```

이와 별개로 `00_input/decisions.md` 말미의 전사 `[확인 필요]` 2건(모델별 무료 티어 RPM/RPD/TPM,
JSON Schema 강제 범위)은 **데이터 레이어에 영향이 없습니다** — 둘 다 AI 호출 예산과 계약 검증에 관한 값입니다.
