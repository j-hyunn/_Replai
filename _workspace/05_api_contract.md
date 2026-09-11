# API 계약 (Next.js App Router 서버 레이어)

> 소유: `vercel-platform-engineer` · 상태: **초안(draft)** · `api_contract_version = "1.0.0-draft"`
> 입력: `01_state_machine.md`(전이 원본) · `01_product_spec.md`(화면 11개) · `01_rubric.md` ·
> `02_ai_architecture.md`(4.4·6·8절) · `02_ai_contracts.md`(SSE·`<<<META>>>` M1~M8) ·
> `03_voice_pipeline.md`(P1~P6) · `04_data_layer.md`(3·5·8·11·12·13절) ·
> `00_input/decisions.md`(D1~D34 — **D27 예약 게이트 · D28 BYOK · D29 체험 동의 · D34 단일 버킷 재유도**)
> 짝 문서: `05_deploy.md`(환경변수·런타임·무료 플랜 한도)

## 변경 로그
- 2026-09-09 최초 작성. 엔드포인트 32개, 응답 래핑 규칙, SSE 계약, 비동기 평가 체이닝, admin 경유 라우트 표 확정.
- 2026-09-09 (2차) **QA 리포트 F1·F2·F3·F4·F6·F8 대응.** 확정 결정 D18~D21을 계약에 전파했습니다.
  - **F1 / D18** — 평가 시작 주체를 클라이언트에서 **서버**로 정정(6.2·6.3절). `POST .../evaluate`(#16)는
    **`failed` 재시도 전용**으로 의미가 좁혀졌고, 대응 훅 이름이 `useStartEvaluation` → **`useRetryEvaluation`**으로 바뀝니다.
  - **F2 / D19** — `POST .../cancel`(#33) 신설. `→ canceled` 7개 전이를 담당하며 **취소 ≠ 삭제**입니다(4.2절).
    `GET /api/sessions`에 `includeCanceled` 쿼리 추가(4.3절).
  - **F3 / D20** — `Evaluation`에 `myFeedback` / `myDisputes` 추가(12절).
  - **F4 / D21** — `GET /api/documents/[documentId]`(#34) 신설, 응답에 `linkedSessionCount`(12절 `DocumentDetail`).
  - **F6** — `POST .../events`(#22)의 `session_events.to_status` 값 규약 확정(4.5절). 스키마 변경 없음.
  - **F8** — `configuring → failed`의 트리거 라우트 `POST .../abandon-preparation`(#35) 신설(4.4절).
  - 엔드포인트 **32개 → 35개**. 전이 표 33행 전수 대응 확인은 4.6절.
- 2026-09-10 (3차) **D27(예약 게이트) · D28(BYOK) · D29(체험 동의) 반영.** 기존 절만 고쳤고 문서를 다시 쓰지 않았습니다.
  - **D27** — 게이트 2곳(#3 문 앞 조회 / #6 확정 예약)과 **반납 6지점**을 4.7절에 명문화. 신규 오류 **503 `capacity_unavailable`**(13절).
    신규 `GET /api/capacity`(#36) — **잔여량·한도 수치는 응답에 담지 않습니다.**
  - **D28** — 키 라우트 4개(#37~#40, 4.8절), `LlmCallContext` 시그니처와 **공용 키 폴백 금지**(4.8.2절),
    사용자 키 오류 3분류(10.2절)와 신규 오류 **409 `byok_key_invalid` / `byok_quota_exhausted`**.
    `Session`에 **`fundingSource` 추가**, `PauseReason`이 **3개 → 5개**.
  - **D29** — 체험 동의 라우트(#41, 4.9절). **동의 없이 `prepare`가 오면 409 `trial_consent_required`.**
  - 엔드포인트 **35개 → 41개**. 크론 워치독 4종 → **5종**(만료 예약 스윕, `05_deploy.md` 5절).
- 2026-09-10 (4차) **D30(체험 예약 사용자당 동시 1건) 반영.** 해당 절만 고쳤고 문서를 다시 쓰지 않았습니다.
  - 신규 오류 **409 `trial_reservation_exists`**(13절) — `details.existingSessionId`로 **기존 세션 id를 실어 보냅니다.**
    프론트는 소거법을 버리고 `code`로 직접 분기합니다(`06_ui_plan.md` 16절 #10 회신).
  - #6 `prepare`의 체험 가드가 **동의(409) → 중복 예약(409) → 확정 예약(503)** 3단이 됐습니다(4.7.1·4.7.6절).
  - **`byok` 세션에는 해당하지 않습니다** — 예약 자체를 하지 않습니다. 엔드포인트 수 변화 없음(41개).
- 2026-09-10 (5차) **QA 2차 G3·G6 대응.** 해당 절만 고쳤고 문서를 다시 쓰지 않았습니다.
  - **G3** — 4.6절 전수 대응 표를 **33행 → 35행**으로 확장했습니다. D28이 추가한 `in_progress → paused`
    2행(**`byok_key_invalid` · `byok_quota_exhausted`**)의 담당을 **#9 `POST .../turns`(SSE)** 로 확정했고,
    #21(`paused → in_progress`) 칸에 두 사유의 재개 가드를 명시했습니다. `01_state_machine.md` 2절 전이 표를
    다시 전수 대조한 결과 **추가로 빠진 행은 없습니다**. 남은 미대응은 `evaluated → evaluating` 1행이며
    **`[later]` 범위 밖**임을 별도 표로 남겼습니다. 엔드포인트 수 변화 없음(41개).
  - **G6** — 14.1절 **R-A**를 갱신했습니다. `to_status` 값 규약이 `04_data_layer.md` 3.6절에 아직 미반영이며,
    D27 신규 비전이 이벤트 3종(**`quota_reserved` · `quota_released` · `quota_overflow`**)까지 포함해
    반영해 달라고 `supabase-engineer`에게 요청했습니다. **스키마 변경 요청 아님.**

- 2026-09-10 (6차) **D31 반영 — 2026-09-10 측정치(Vercel Hobby `maxDuration` = 300초)를 계약에 반영.**
  해당 절만 고쳤고 문서를 다시 쓰지 않았습니다.
  - **60초 가정이 틀렸습니다.** Hobby는 기본 300초 · 최대 300초입니다(`05_deploy.md` 3절, 확인일 2026-09-10).
    평가자와 코치를 별도 함수 호출로 체이닝하던 **회피책의 이유가 사라졌습니다.**
  - **I3 `POST /api/internal/jobs/coach`를 삭제했습니다.** 코치는 I2 워커 호출 안에서 **평가자 다음에 순차 실행**됩니다.
    **내부 워커 라우트 3종 → 2종**(I1 `jobs/plan` · I2 `jobs/evaluate`). 4절·4.1절·6.2·6.3·8·9절 갱신.
  - **두 단계를 논리적으로 합치지 않았습니다.** 독립 재시도와 부분 성공(코치 실패 → 점수·인용은 남고
    `improvement`는 `null`)은 그대로입니다. 바뀐 것은 **전송 계층뿐**입니다.
    없어지는 것: 내부 HTTP 홉 1개, `JOB_SECRET` 왕복 1회, **"1단계 성공 후 2단계 호출 유실" 실패 모드 1종.**
  - **#18 `coach/retry`의 진입점이 I2로 바뀝니다** — `{ stage: 'coach_only' }`로 같은 워커를 부릅니다.
    **프론트 응답 shape는 그대로**입니다(`202 { sessionId, evaluationId, coachStatus: 'running' }`).
  - `maxDuration` 표(11.2절)를 300초 상한 기준으로 재조정했습니다. **300을 다 쓰지 않습니다** — 근거는 11.2.1절.
  - 11.3절을 "상한이 60초보다 낮을 경우의 대비"에서 **"확인된 300초 아래에서 남는 위험"**으로 바꿨습니다.
  - **엔드포인트 수 변화 없음(41개).** 프론트 대응 훅·응답 타입 변화 **없음**.

- 2026-09-11 (7차) **D34 반영 — 무료 티어 실측으로 예약 버킷이 3개에서 1개가 됐습니다.** 해당 절만 고쳤습니다.
  - **원본은 `02_ai_architecture.md` 8.3.1·8.3.4절, 전이 문구 원본은 `01_state_machine.md` 2절 전이 표 + 각주 ※입니다.**
    `gemini-2.5-pro`는 무료 RPD 0, `flash` 계열은 RPD 20 — 둘 다 쓸 수 없어 **5개 역할 전부 `gemini-3.1-flash-lite`**로
    통일됐고, 세션당 예약은 **단일 버킷 `flash_lite` 34**(`pro`·`flash`는 휴면, 요청량 0)입니다.
  - **4.7.3절 1번(`→ completed`)이 "`flash_lite` 전량 반납"에서 "부분 반납"으로 바뀌었습니다.**
    `released = greatest(reserved − consumed − 6, 0)`, **남는 held = 6**(평가자 패스 A+B 4 + 코치 2).
    평가자·코치가 이제 **같은 버킷**을 먹으므로 전량 반납하면 리포트를 만들 여력이 사라집니다.
  - 4.7.4절 재시도 예약 버킷: #16 `pro` 3 → **`flash_lite` 4**, #18 `flash` 2 → **`flash_lite` 2**
    (엔드포인트 표 #16·#18 비고도 같이 고쳤습니다).
  - 4.7.1절 `p_limits`는 **키 3종을 그대로 보냅니다** — 요청량 0인 휴면 버킷은 DB 함수가 원장 행을 만들지 않고 건너뜁니다.
  - 4.7.6절 정원을 잠그는 주체를 `pro` 3 × N → **`flash_lite` 34 × N**(하루 12세션)으로 정정.
  - 11.3절 조정 레버 1번("Evaluator를 pro → flash로 내린다")을 **삭제 표시**했습니다 — 존재하지 않는 선택지입니다.
  - **엔드포인트 수·응답 shape·대응 훅 변화 없음(41개).** 버킷 이름은 어떤 응답에도 실리지 않으므로(4.7.5절 금지 항목)
    **프론트 타입에 영향이 없습니다.**

---

## 0. 이 문서의 위상

- **응답 스키마의 원본(source of truth)입니다.** 프론트 훅 타입은 여기서 파생되며, 반대 방향은 없습니다.
- 표의 **"대응 훅"** 열이 `qa-inspector`의 교차 대조 기준선입니다. 훅이 기대하는 모양과 여기 적힌 모양이
  다르면 그것은 컴파일이 통과해도 런타임 버그입니다.
- 필드명은 **camelCase**, **값은 영어 문자열 그대로**입니다(`in_progress`, `job_knowledge`,
  `transcription_error` 등). 값을 camelCase나 한국어로 바꾸면 DB CHECK와 API 계약이 동시에 깨집니다.
- 경로·필드명·이벤트명·에러 코드는 전부 영어입니다. 이 문서의 서술만 한국어입니다.

---

## 1. 응답 래핑 규칙 (**하나로 통일 — 흔들리면 훅이 깨진다**)

```
■ 성공 응답은 언제나 최상위 JSON 오브젝트다. 최상위 배열을 반환하는 엔드포인트는 하나도 없다.
■ 단건      : { "<resourceName>": T }              예) { "session": Session }
■ 목록      : { "<resourceNamePlural>": T[], "nextCursor": string | null }
              예) { "sessions": Session[], "nextCursor": null }
              항목이 없으면 [] 이고 null이 아니다. nextCursor는 항상 존재하며 마지막 페이지에서 null이다.
■ 복합      : 각 리소스를 자기 이름의 키로 나란히 둔다.
              예) { "turns": Turn[], "questions": Question[] }
■ 즉시 응답 : { "sessionId": uuid, "status": SessionStatus, ... }   (3절 — 최종 결과 타입과 별개 타입)
■ 부작용만  : { "ok": true }        (반환할 리소스가 없을 때만. 가능하면 갱신된 리소스를 돌려준다)
■ 오류      : { "error": { "code": string, "message": string, "details"?: object } }
              성공 바디와 오류 바디는 절대 섞이지 않는다. error 키가 있으면 다른 키는 없다.
```

**최상위 배열을 금지하는 이유.** `Session[]`을 반환하면 나중에 `nextCursor`나 `totalCount`를
붙일 자리가 없어 응답 모양을 바꿔야 하고, 그 순간 모든 훅이 런타임에서 깨집니다.
오브젝트로 감싸면 필드 추가는 하위 호환입니다.

**프론트는 반드시 언랩합니다.** `fetchJson<Session[]>('/api/sessions')` 같은 제네릭 선언은 **주장이지 검사가
아닙니다.** `const { sessions } = await fetchJson<SessionListResponse>(...)` 형태만 허용합니다.

---

## 2. snake_case → camelCase 변환 — **API 라우트에서 단 한 번**

```
Postgres / database.types.ts   : snake_case   (session_id, main_question_budget, is_insufficient_evidence)
        ↓ 변환은 여기서만 — src/lib/api/serialize.ts 의 toApi<T>() 한 곳
API 응답 / 프론트 타입          : camelCase    (sessionId, mainQuestionBudget, isInsufficientEvidence)
```

| 규칙 | 내용 |
|---|---|
| 변환 위치 | 각 라우트 핸들러가 응답을 만들기 직전. **DB 레이어에서도, 프론트에서도 변환하지 않습니다** |
| 변환 방식 | 리소스별 **명시적 매퍼 함수**(`toSessionDto(row)`)를 씁니다. 범용 자동 변환기(deep camelize)를 쓰지 않습니다 — 자동 변환은 `jsonb` 안의 사용자 데이터와 값 문자열까지 건드려 조용히 계약을 깹니다 |
| 요청 방향 | 요청 body도 **camelCase로 받고** 라우트에서 snake_case 컬럼으로 씁니다. 클라이언트가 snake_case를 보내는 경로는 없습니다 |
| 값은 변환 대상이 아님 | `status`·`persona`·`jobRole`의 값, 축 식별자, `reasonCode`, `pauseReason`, 4상태(`listening` 등), SSE 이벤트명은 **문자열 그대로** |

### 2.1 변환하지 **않는** 예외 — 3곳뿐이며 전부 이유가 있습니다

| # | 예외 | 모양 | 왜 예외인가 |
|---|---|---|---|
| E1 | **Supabase Realtime 페이로드** (`interview_sessions` 구독, `04_data_layer.md` 8절) | **snake_case** | Postgres가 직접 브로드캐스트하므로 우리 라우트를 거치지 않습니다. **UI는 이 페이로드의 필드 값을 렌더링하지 말고 "변경됐다"는 신호로만 쓰고, 즉시 해당 GET 라우트를 재조회하세요.** 페이로드에서 `new.status`를 읽어 화면에 그리는 순간 프론트에 snake_case가 새어 들어옵니다 |
| E2 | **Storage 직업로드 응답** (`04_data_layer.md` 7.4절) | 필드 없음 | 클라이언트가 anon 키로 직접 올립니다. 반환값은 경로 문자열뿐이라 변환 대상이 없습니다 |
| E3 | **`evaluations.coach_payload` / `evaluations.improvements` 안의 키** | **snake_case 유지** | 이 두 컬럼은 `02_ai_contracts.md` 6.2절 AI 출력을 그대로 담은 jsonb이고, `model_answers`·`next_actions`·`related_axis`·`why_weak`·`model_answer`·`expected_effect`가 **AI 계약의 필드명**입니다. API 응답에서도 이 이름을 유지합니다 — 바꾸면 저장된 값과 응답이 서로 다른 이름을 갖게 되어 디버깅이 불가능해집니다. 아래 `Evaluation` 타입에 그대로 명시했습니다 |

> E3는 "변환은 한 번"의 위반이 아니라 **jsonb 본문은 컬럼 값이지 컬럼명이 아니다**는 구분입니다.
> `improvements`라는 컬럼명은 camelCase 대상이 아니고(이미 한 단어), 그 안의 배열 원소는 데이터입니다.

---

## 3. 즉시 응답과 최종 결과는 **다른 타입**입니다

```ts
// 즉시 응답 — POST /api/sessions/[sessionId]/evaluate(= failed 재시도 전용, D18)가 202로 돌려주는 것.
// 정상 경로의 평가 등록은 서버 부작용이라(6.2절) 이 타입이 클라이언트에 나가는 경우는 재시도뿐이다.
type EvaluationJobAccepted = {
  sessionId: string;
  status: 'evaluating';        // 'evaluated'가 여기 올 일은 없다
  evaluationId: string;
  attempt: number;             // 1~3
  pollAfterMs: number;         // 클라이언트 권장 폴링 간격 (Realtime 실패 시 폴백용)
};

// 최종 결과 — GET /api/sessions/[sessionId]/evaluation 이 돌려주는 것
type EvaluationResponse = { evaluation: Evaluation | null };
```

**두 타입을 절대 합치지 마세요.** 합치면 프론트가 즉시 응답에서 `evaluation.axes[0].score`를 읽고
`undefined`에 접근해 터집니다. 즉시 응답에는 `axes`도 `overallScore`도 **물리적으로 없습니다.**

- 최종 결과 전달 경로 1순위: **Realtime**(`interview_sessions`, `id=eq.{sessionId}`) → `status`가
  `evaluated`/`failed`로 바뀌면 `GET .../evaluation` 재조회.
- 2순위(폴백): `GET .../evaluation` 폴링. `pollAfterMs` 기본 **3000ms**, 지수 증가 상한 15000ms.
- `evaluation`이 `null`인 경우: 아직 `evaluations` 행이 없거나(=`completed`) 접근 권한 밖.
  **`null`은 오류가 아닙니다.** 404를 쓰지 않습니다 — 세션은 존재하고 평가만 아직 없기 때문입니다.

---

## 4. 엔드포인트 전체 목록

인증 열: `auth` = 로그인 필수(미들웨어 + 라우트 재확인), `cron` = `CRON_SECRET`, `internal` = `JOB_SECRET`.
지연 열은 `02_ai_architecture.md` 8.1절 추정치 기준입니다.

| # | 메서드 | 경로 | 인증 | 요청 body | 응답(camelCase) | 스트리밍 | 예상 지연 | 상태 전이 | 대응 훅 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | GET | `/api/dashboard` | auth | — | `{ activeSessions: SessionSummary[], unreadReportCount: number, recentSessions: SessionSummary[] }` | 아니오 | ~250ms | **없음** | `useDashboard` |
| 2 | GET | `/api/sessions` | auth | 쿼리 `status?`, `includeCanceled?`, `limit?`, `cursor?` (4.3절) | `{ sessions: SessionSummary[], nextCursor: string \| null }` | 아니오 | ~200ms | **없음** | `useSessions` |
| 3 | POST | `/api/sessions` | auth | `{ sourceSessionId?: string \| null }` | `201 { session: Session }` — **`session.fundingSource`가 여기서 확정됩니다(이후 변경 불가)** | 아니오 | ~250ms | (없음) → `created`. **재원 분기 + 문 앞 조회(4.7절). 통과 못 하면 행을 만들지 않고 503 `capacity_unavailable`** | `useCreateSession` |
| 4 | GET | `/api/sessions/[sessionId]` | auth | — | `{ session: Session }` | 아니오 | ~150ms | **없음** | `useSession` |
| 5 | PATCH | `/api/sessions/[sessionId]/config` | auth | `SessionConfigPatch` | `{ session: Session }` | 아니오 | ~200ms | `created`→`configuring` / `configuring`→`configuring` | `useUpdateSessionConfig` |
| 6 | POST | `/api/sessions/[sessionId]/prepare` | auth | — | `202 { sessionId, status: 'configuring', preparation: PreparationState }` | 아니오 | ~250ms(`byok`는 키 검증 포함 ~1.5s / 작업은 8~20s) | `configuring`→`ready`(**작업 완료 시 워커가 수행**). **재원별 가드(4.7·4.8·4.9절): `trial_shared`는 동의(409 `trial_consent_required`) → 중복 예약 검사(409 `trial_reservation_exists` — D30, 4.7.6절) → 확정 예약(503 `capacity_unavailable`), `byok`는 키 검증(409). 실패하면 전이하지 않고 세션은 `configuring`에 남습니다** | `usePrepareSession` |
| 7 | POST | `/api/sessions/[sessionId]/back-to-config` | auth | — | `{ session: Session }` | 아니오 | ~250ms | `ready`→`configuring` | `useBackToConfig` |
| 8 | POST | `/api/sessions/[sessionId]/start` | auth | `{ micReady: boolean }` | `{ session: Session, openingQuestion: Question }` | 아니오 | ~250ms | `ready`→`in_progress` | `useStartSession` |
| 9 | **POST** | **`/api/sessions/[sessionId]/turns`** | auth | `AnswerCommit` | **`text/event-stream`** (5절) | **예** | 첫 청크 ~1.8s / 완료 ~2.5s | `in_progress`→`in_progress`, 종료 조건 충족 시 `in_progress`→`completed` | `useInterviewStream` |
| 10 | GET | `/api/sessions/[sessionId]/turns` | auth | 쿼리 `afterSeq?` | `{ turns: Turn[], questions: Question[] }` | 아니오 | ~200ms | **없음** (재접속·"다시 듣기" 재동기화. **LLM을 호출하지 않습니다**) | `useTurnsResync` |
| 11 | PATCH | `/api/sessions/[sessionId]/turns/[turnId]` | auth | `{ transcriptText: string }` | `{ turn: Turn }` | 아니오 | ~200ms | **없음** | `useCorrectTurn` |
| 12 | POST | `/api/sessions/[sessionId]/modality` | auth | `{ modality: 'voice'\|'text', reason: string }` | `{ session: Session }` | 아니오 | ~200ms | **없음** (`in_progress` 자기 전이) | `useSwitchModality` |
| 13 | POST | `/api/sessions/[sessionId]/pause` | auth | `{ pauseReason: PauseReason }` | `{ session: Session }` | 아니오 | ~200ms | `in_progress`→`paused` | `usePauseSession` |
| 14 | POST | `/api/sessions/[sessionId]/resume` | auth | — | `{ session: Session, currentQuestion: Question \| null, lastInterviewerTurn: Turn \| null }` | 아니오 | ~250ms | `paused`→`in_progress` | `useResumeSession` |
| 15 | POST | `/api/sessions/[sessionId]/complete` | auth | — | `{ session: Session }` | 아니오 | ~350ms | `in_progress`→`completed` / `paused`→`completed`, **이어서 `completed`→`evaluating`**(서버가 평가 등록 — D18, 6.2절) | `useCompleteSession` |
| 16 | POST | `/api/sessions/[sessionId]/evaluate` | auth | — | `202 EvaluationJobAccepted` | 아니오 | ~300ms(작업은 45~90s) | **`failed`→`evaluating` 전용(재시도, D18).** `completed`·`evaluating`·`evaluated`에 호출하면 **409 `invalid_transition`**. **체험 세션이면 `flash_lite` 4를 여기서 다시 예약합니다 — 실패 시 503, `failed` 유지(4.7.4절)** | **`useRetryEvaluation`** (구 `useStartEvaluation`) |
| 17 | GET | `/api/sessions/[sessionId]/evaluation` | auth | — | `{ evaluation: Evaluation \| null }` — **`Evaluation`에 `myFeedback`·`myDisputes` 포함(D20, 12절)** | 아니오 | ~300ms | **없음** (단, `report_first_viewed_at`을 최초 1회 기록 — 지표 2) | `useEvaluation` |
| 18 | POST | `/api/sessions/[sessionId]/coach/retry` | auth | — | `202 { sessionId, evaluationId, coachStatus: 'running' }` | 아니오 | ~250ms(작업은 20~40s) | **없음** (`evaluated` 유지. 점수·인용은 건드리지 않는 UPDATE). **체험 세션이면 `flash_lite` 2를 다시 예약 — 실패 시 503, 리포트는 계속 열람 가능(4.7.4절)** | `useRetryCoach` |
| 19 | GET | `/api/sessions/[sessionId]/transcript` | auth | — | `{ turns: Turn[], questions: Question[] }` | 아니오 | ~250ms | **없음** | `useTranscript` |
| 20 | PUT | `/api/sessions/[sessionId]/feedback` | auth | `{ isHelpful: boolean, comment?: string \| null }` | `{ feedback: ReportFeedback }` | 아니오 | ~200ms | **없음** | `useReportFeedback` |
| 21 | POST | `/api/sessions/[sessionId]/disputes` | auth | `{ scoreId, citationId?, reasonCode, comment? }` | `201 { dispute: ScoreDispute }` | 아니오 | ~200ms | **없음** | `useCreateDispute` |
| 22 | POST | `/api/sessions/[sessionId]/events` | auth | `{ eventName: ClientEventName, detail?: object }` | `{ ok: true }` | 아니오 | ~150ms | **없음** (감사 로그만) | `useReportEvent` |
| 23 | DELETE | `/api/sessions/[sessionId]` | auth | — | `{ ok: true }` | 아니오 | ~300ms | 모든 상태 → **행 삭제**(실제 삭제). **취소(#33)와 다른 경로입니다 — 4.2절** | `useDeleteSession` |
| 24 | GET | `/api/documents` | auth | 쿼리 `docType?`, `limit?`, `cursor?` | `{ documents: Document[], nextCursor: string \| null }` | 아니오 | ~200ms | **없음** | `useDocuments` |
| 25 | POST | `/api/documents` | auth | `DocumentCreate` | `201 { document: Document }` | 아니오 | ~200ms | **없음** | `useCreateDocument` |
| 26 | POST | `/api/documents/[documentId]/extract` | auth | — | `{ document: Document }` (`extractionStatus`가 `succeeded`\|`failed`) | 아니오 | 1~8s (10MB PDF 최악 ~25s) | **없음** (실패는 세션 전이가 아니라 문서 상태) | `useExtractDocument` |
| 27 | PATCH | `/api/documents/[documentId]` | auth | `{ title?, extractedText? }` | `{ document: Document }` | 아니오 | ~200ms | **없음** | `useUpdateDocument` |
| 28 | DELETE | `/api/documents/[documentId]` | auth | — | `{ ok: true, affectedSessionCount: number, configuringSessionCount: number }` (**삭제 전 경고 건수는 #34의 `linkedSessionCount`로 — D21**) | 아니오 | ~250ms | **없음** (세션은 건드리지 않음 — `04_data_layer.md` 9.2절) | `useDeleteDocument` |
| 29 | GET | `/api/documents/[documentId]/download-url` | auth | — | `{ url: string, expiresInSec: 60 }` | 아니오 | ~200ms | **없음** | `useDocumentDownloadUrl` |
| 30 | GET | `/api/account` | auth | — | `{ profile: Profile, stats: AccountStats }` | 아니오 | ~250ms | **없음** | `useAccount` |
| 31 | DELETE | `/api/account` | auth | `{ password: string }` (재인증) | `{ ok: true }` | 아니오 | 1~5s | 사용자의 **모든** 세션 행 삭제 | `useDeleteAccount` |
| 32 | POST | `/api/sessions/[sessionId]/prewarm` | auth | — | `204` (본문 없음) | 아니오 | ~120ms | **없음** (`03_voice_pipeline.md` C4/P6. **LLM을 호출하지 않습니다**) | `usePrewarm` |
| **33** | **POST** | **`/api/sessions/[sessionId]/cancel`** | auth | — | `{ session: Session }` | 아니오 | ~250ms | `created`·`configuring`·`ready`·`in_progress`·`paused`·`failed`·`abandoned` → **`canceled`** (**7개 전이 전부**, D19) | `useCancelSession` |
| **34** | **GET** | **`/api/documents/[documentId]`** | auth | — | `{ document: DocumentDetail }` (**`linkedSessionCount` 포함**, D21) | 아니오 | ~200ms | **없음** | `useDocument` |
| **35** | **POST** | **`/api/sessions/[sessionId]/abandon-preparation`** | auth | — | `{ session: Session }` | 아니오 | ~250ms | `configuring`→`failed` (`failureReason='document_extraction_failed'`) | `useAbandonPreparation` |
| **36** | **GET** | **`/api/capacity`** | auth | — | `{ capacity: Capacity }` (**D27·D28 — 잔여량·한도 수치 없음**) | 아니오 | ~150ms | **없음** | `useCapacity` |
| **37** | **GET** | **`/api/account/api-key`** | auth | — | `{ apiKey: ApiKeyStatus }` (**키 원문 필드 없음**) | 아니오 | ~150ms | **없음** | `useApiKeyStatus` |
| **38** | **PUT** | **`/api/account/api-key`** | auth | `{ apiKey: string }` (**요청에만 존재. 응답·로그에 되돌아오지 않습니다**) | `{ apiKey: ApiKeyStatus }` (`keyStatus='connected'`) | 아니오 | ~1.5s (프로바이더 검증 1회 포함) | **없음** (계정 자원). 연결·교체 **양쪽 다 이 라우트 — 전체 교체입니다** | `useConnectApiKey` |
| **39** | **DELETE** | **`/api/account/api-key`** | auth | — | `{ apiKey: ApiKeyStatus }` (`keyStatus='none'`, `keyLast4=null`) | 아니오 | ~250ms | **없음**. **실제 삭제**(Vault 암호문까지, D28 4항) | `useDisconnectApiKey` |
| **40** | **POST** | **`/api/account/api-key/verify`** | auth | — | `{ apiKey: ApiKeyStatus }` | 아니오 | ~1.5s | **없음** (`user_api_keys.status`·`last_verified_at`만 갱신) | `useVerifyApiKey` |
| **41** | **POST** | **`/api/trial-consent`** | auth | `{ consentVersion: string, sessionId?: string \| null }` | `201 { consent: TrialConsent }` (같은 버전 재동의는 **멱등**, `200`) | 아니오 | ~200ms | **없음** (`configuring → ready`의 **가드 충족**일 뿐 전이가 아닙니다) | `useGrantTrialConsent` |

> **⚠️ `→ completed` 라우트가 돌려주는 `session.status`를 `completed`로 가정하지 마세요 (D18).**
> #15와 #9는 세션을 `completed`로 옮긴 **직후 같은 요청 안에서** 평가를 등록하므로(6.2절),
> 응답의 `session.status`는 정상 경로에서 **`evaluating`**입니다. 등록이 실패해 재시도 중일 때만 `completed`가
> 나옵니다. 프론트는 `completed`와 `evaluating`을 **둘 다 "리포트 준비 중" 화면**으로 처리해야 하고,
> 어느 쪽에서도 `POST .../evaluate`를 부르지 않습니다(부르면 409입니다).

### 4.1 내부·스케줄 라우트 (프론트가 절대 호출하지 않음 — 대응 훅 없음)

| # | 메서드 | 경로 | 인증 | 역할 | 상태 전이 |
|---|---|---|---|---|---|
| I1 | POST | `/api/internal/jobs/plan` | internal | 플래너 실행 → `context_summary`·오프닝 질문·스냅샷 커밋 | `configuring`→`ready` |
| I2 | POST | `/api/internal/jobs/evaluate` | internal | **평가자 → 코치를 한 호출 안에서 순차 실행**(D31, 6.2절). 1단계: `evaluations`·`evaluation_scores`·`evaluation_citations` 저장. 2단계: `summary`/`improvements`/`coach_payload`/축별 `improvement` UPDATE. body의 `stage`가 `'coach_only'`면 1단계를 건너뜁니다(#18 재시도 경로) | 평가 실패+잔여 재시도 시 `evaluating`→`completed`, 소진 시 `evaluating`→`failed`. **코치 단계는 성공·실패 어느 쪽이든 `evaluating`→`evaluated`** |
| C1 | GET | `/api/cron/daily` | cron | 일 1회 워치독 **5종**(`05_deploy.md` 5절. **5종째는 D27 만료 예약 스윕** — `01_state_machine.md` 7.5절). **`paused`→`completed`로 보낼 때 평가를 함께 등록합니다**(D18 — 이 경로에는 클라이언트가 존재하지 않습니다). **1·2·3단계의 종료 전이는 전부 예약 반납을 동반합니다**(4.7.3절 — **단 1단계 `paused→completed`는 6을 남기는 부분 반납**입니다) | `paused`→`completed`(→ 이어서 `completed`→`evaluating`)/`abandoned`, `evaluating`→`failed`, `in_progress`→`paused` |

> **내부 워커 라우트는 2종입니다 (D31 — 3종에서 줄었습니다).** `POST /api/internal/jobs/coach`(구 I3)는
> **삭제됐습니다.** 코치는 I2 안에서 평가자 다음에 이어 실행되며, 별도의 HTTP 진입점을 갖지 않습니다.
> `/api/internal/jobs/coach` 경로로 오는 요청은 **404**입니다 — 옛 경로를 남겨 두면 `JOB_SECRET`만 알면
> 코치를 단독 호출할 수 있는 문이 하나 더 열린 채로 남습니다.
> **#18 `coach/retry`는 I2를 `{ stage: 'coach_only' }`로 부릅니다.**

### 4.2 취소(#33)와 삭제(#23)는 **다른 경로**입니다 (D19)

초안에는 `→ canceled` 전이를 일으키는 라우트가 하나도 없어 전이 표 7행이 죽어 있었고, `canceled`는
CHECK 제약에만 있고 어떤 행에도 존재할 수 없는 유령 값이었습니다. #33이 그 7행을 담당합니다.

| | **#33 `POST .../cancel`** | **#23 `DELETE /api/sessions/[sessionId]`** |
|---|---|---|
| 의미 | **종료 상태로 보낸다.** "더 진행하지 않겠다"는 선언 | **실제 삭제.** 행과 Storage 객체를 지운다 |
| DB | `status='canceled'`, `ended_at` 기록. **행은 남는다** | `interview_sessions` DELETE (CASCADE) |
| `turns`·`questions` | **유지** | 함께 삭제 |
| 평가 | **등록하지 않는다** | 해당 없음 |
| 목록 | 기본 숨김 + "취소된 세션 보기" 토글로 노출(4.3절) | 사라짐 |
| UI 확인 | 일반 확인 다이얼로그 | **"되돌릴 수 없습니다"를 명시한 확인** |

- **"이 세션 버리기" · "폐기"는 전부 #33입니다.** 이 문구를 #23에 연결하면 사용자가 확인 절차 없이
  대화 기록을 영구히 잃습니다 — D19가 명시적으로 막으려 한 시나리오입니다.
- #33이 받는 출발 상태는 전이 표의 **7개뿐**입니다: `created` · `configuring` · `ready` · `in_progress` ·
  `paused` · `failed` · `abandoned`. `completed` · `evaluating` · `evaluated` · `canceled`에 호출하면
  **409 `invalid_transition`** + `details: { from, to: 'canceled' }`입니다.
  평가가 이미 시작된 세션은 취소 대상이 아니라 삭제(#23) 대상입니다.
- **`ended_at`은 비어 있을 때만 채웁니다.** `failed`·`abandoned`처럼 종료 시각이 이미 있는 세션을
  취소하면서 덮어쓰면, 지표 1의 세션 길이가 실제보다 길게 기록됩니다.
- `in_progress`에서의 취소는 오디오 버퍼 폐기를 동반합니다(폐기 주체는 클라이언트입니다 — 서버는
  오디오를 갖고 있지 않습니다). 진행 중인 SSE 스트림이 있으면 클라이언트가 abort하고, 서버는 5.4절의
  종료 경로를 그대로 탑니다. **abort는 상태를 바꾸지 않으므로 취소와 충돌하지 않습니다.**
- `session_events`에 `from_status`(현재 상태) → `to_status='canceled'`, `trigger='user_action'`,
  `event_name='session_canceled'`로 남깁니다.
- **`canceled`에서 나가는 전이는 없습니다.** 취소는 최종 상태이고, 되돌리려면 새 세션을 만듭니다
  (#3의 `sourceSessionId`로 설정을 물려받을 수 있습니다).

### 4.3 세션 목록의 `canceled` 필터 (D19)

`GET /api/sessions`(#2)는 **기본적으로 `canceled` 세션을 제외**합니다.

| 쿼리 | 동작 |
|---|---|
| (없음) | `status <> 'canceled'`. **기본값** |
| `includeCanceled=true` | 취소된 세션도 함께 반환. "취소된 세션 보기" 토글이 이 값을 켭니다 |
| `status=canceled` | 취소된 세션만. **명시 필터가 기본 제외 규칙을 이깁니다**(`includeCanceled`와 무관) |
| `status=<그 외 값>` | 해당 상태만. `canceled`가 아니므로 제외 규칙이 걸릴 일이 없습니다 |

- `includeCanceled`는 **문자열 `'true'`일 때만 참**입니다. 쿼리스트링 값은 전부 문자열이므로
  `Boolean(searchParams.get('includeCanceled'))`로 판정하면 `'false'`가 참이 됩니다.
- `nextCursor` 페이지네이션은 필터를 적용한 뒤의 결과에 대해 계산합니다. 토글을 켜고 끄면
  커서는 무효가 되므로 **토글 변경 시 목록을 처음부터 다시 조회**합니다.
- **`GET /api/dashboard`(#1)의 `activeSessions`·`recentSessions`는 토글 없이 언제나 제외**합니다.
  대시보드는 "지금 할 일"을 보여주는 화면이라 취소된 세션이 낄 자리가 없습니다.

### 4.4 `configuring → failed`의 트리거 — #35 (QA F8)

전이 표 95행의 트리거는 "추출 실패 **후 사용자가 재시도를 포기**"인데, 이 전이를 일으키는 라우트가
없어 사용자가 `configuring`에 갇혀 있었습니다.

- **#26(`POST /api/documents/[id]/extract`)의 실패만으로는 전이하지 않습니다.** 문서는 세션에 종속되지
  않아 여러 세션이 같은 문서를 참조할 수 있고, 추출 실패는 **문서 상태**(`extraction_status='failed'`)이지
  세션의 종료가 아닙니다. 그 시점에도 사용자에게는 재추출·텍스트 직접 입력·다른 문서 선택이 남아 있습니다.
  한 문서의 실패가 그 문서를 참조하는 모든 세션을 `failed`로 만들면 **남의 세션까지 끌고 죽습니다.**
- 대신 **#26이 `failed`로 끝나면 UI가 "이 세션 준비 포기" 경로를 노출**하고, 사용자가 그것을 누르면
  #35가 전이를 수행합니다. 전이의 주체는 여전히 사용자이며, **#35가 그 유일한 진입점**입니다.
- **가드:** 세션이 `configuring`이고, `resumeDocumentId` 또는 `jdDocumentId`가 가리키는 문서의
  `extraction_status = 'failed'`. 못 채우면 **409 `guard_failed`** + `details.guard = 'extraction_not_failed'`.
  추출이 멀쩡한데 세션만 `failed`로 만드는 경로를 열면 `failureReason` 값의 의미가 무너집니다
  (그 경우 사용자가 원하는 것은 포기가 아니라 취소이며, 그것은 #33입니다).
- **부작용:** `failure_reason='document_extraction_failed'`, `ended_at` 기록,
  `session_events(configuring → failed, trigger='user_action', event_name='preparation_abandoned')`.
- `failed`에서 나가는 길은 열려 있습니다 — `failed → canceled`(#33). 단 **`failed → evaluating`(#16)은
  받지 않습니다**: #16은 `failureReason`이 평가 계열(`evaluation_failed` / `evaluation_enqueue_failed`)이고
  `turns`가 남아 있을 때만 동작하므로, `document_extraction_failed` 세션에는 **409**입니다.

### 4.5 `POST .../events`(#22)가 `session_events.to_status`에 넣는 값 (QA F6)

`session_events.to_status`는 **not null + 11개 값 CHECK**입니다(`04_data_layer.md` 3.6절).
그런데 이 테이블에는 상태 전이가 아닌 관측 이벤트(`score_card_viewed` · `report_viewed` ·
`modality_switched` · `voice_precheck` · `rate_limit_fallback`)도 쌓이고, 그때 무엇을 넣을지가
어느 문서에도 없었습니다. 이대로면 **첫 `score_card_viewed` INSERT가 not-null 위반으로 실패하고
지표 5(축별 카드 열람률)의 분모가 통째로 빕니다.**

**규약(확정): 비전이 이벤트는 `from_status = to_status = 그 시점 세션의 `status`` 입니다.**

| 항목 | 내용 |
|---|---|
| 채우는 주체 | **#22 라우트.** 요청 body는 `{ eventName, detail? }` 그대로이며 **클라이언트는 상태를 보내지 않습니다** |
| 값을 어디서 읽나 | 소유권 확인을 위해 이미 `server.ts`가 세션 행을 읽습니다(7.3절). 그 행의 `status`를 그대로 씁니다 — **DB 왕복이 늘지 않습니다** |
| 스키마 변경 | **없습니다.** `to_status`를 nullable로 완화하지 않습니다 |
| 지표 쿼리 규약 | 전이를 셀 때는 **반드시 `event_name`으로 먼저 필터**합니다. `to_status`만으로 세면 비전이 이벤트가 섞여 지표 1·2가 부풀어 오릅니다 |

**왜 nullable 완화가 아니라 "현재 상태 채우기"인가.**

1. `from_status = to_status`는 **이미 이 테이블에서 정상인 모양**입니다. 전이 표에는 `in_progress →
   in_progress` 자기 전이가 두 행(답변 제출, 모달리티 전환) 실재합니다. 규약이 새로운 모양을 만들지 않습니다.
2. nullable로 바꾸면 지표 1·2 쿼리가 매번 `to_status is not null`을 챙겨야 하고, 한 번 빠뜨리면
   **조용히 틀린 숫자**가 나옵니다. 값이 항상 있는 편이 쿼리 실수에 강합니다.
3. **어느 이벤트가 상태를 옮겼는지는 `event_name`이 이미 구분합니다.** 컬럼을 늘리거나 제약을 풀 이유가 없습니다.
4. 스키마는 `supabase-engineer` 소유이므로 이 계약은 **값 규약만** 정합니다. 문서 반영 요청은 14.1절에 있습니다.

### 4.6 전이 표 35행 ↔ 엔드포인트 전수 대응 (D28로 2행 추가 후 재전수)

`01_state_machine.md` 2절 전이 표를 위에서 아래로 다시 훑은 결과입니다. **D28이 `in_progress → paused`에
BYOK 사유 2행을 추가해 전이 표가 33행 → 35행이 되었고, 이 표도 35행으로 맞췄습니다.**
`in_progress → paused`는 이제 **5행**(사용자 · 레이트 리밋 · `byok_key_invalid` · `byok_quota_exhausted` · 연결 유실)입니다.
**남은 미대응은 의도적으로 MVP 범위 밖인 1행(#31)뿐입니다.**

| # | 전이 | 담당 |
|---|---|---|
| 1 | (없음) → `created` | #3 |
| 2 | `created` → `configuring` | #5 |
| 3 | `created` → `canceled` | #33 |
| 4 | `configuring` → `configuring` | #5 |
| 5 | `configuring` → `ready` | #6 → I1(워커가 수행) |
| 6 | `configuring` → `failed` | #35 |
| 7 | `configuring` → `canceled` | #33 |
| 8 | `ready` → `in_progress` | #8 |
| 9 | `ready` → `configuring` | #7 |
| 10 | `ready` → `canceled` | #33 |
| 11 | `in_progress` → `in_progress` (답변→다음 질문) | #9 |
| 12 | `in_progress` → `in_progress` (모달리티 전환) | #12 |
| 13 | `in_progress` → `paused` (사용자) | #13 |
| 14 | `in_progress` → `paused` (레이트 리밋) | #9 (10절 4단계) |
| 15 | `in_progress` → `paused` (**`byok_key_invalid`**) | **#9** ✅신규(D28). LLM 호출이 나가는 유일한 면접 루프 라우트이며, `normalizeProviderError`가 `key_invalid`로 접은 뒤 `stream_error{ retryable:false }` + `pause_reason='byok_key_invalid'`로 전이합니다(10.2절). **#6·#37~#40은 이 전이를 일으키지 않습니다** — 면접 전이라 `configuring`에 남습니다(4.8.2절) |
| 16 | `in_progress` → `paused` (**`byok_quota_exhausted`**) | **#9** ✅신규(D28). 같은 경로이며 `key_quota_exhausted` 분류입니다. **`resumableAfter`를 채우지 않습니다**(10.2절) |
| 17 | `in_progress` → `paused` (연결 유실) | C1 크론 근사 + 클라이언트 `sendBeacon`→#13 (15절 #2) |
| 18 | `in_progress` → `completed` | #9(종료 조건) 또는 #15. **둘 다 이어서 평가 등록**(6.2절) |
| 19 | `in_progress` → `canceled` | #33 |
| 20 | `in_progress` → `failed` | #9 (`provider_permanent_error` / `context_corrupted`) |
| 21 | `paused` → `in_progress` | #14. **BYOK 2종의 재개 가드도 여기입니다** — `byok_key_invalid`는 재개 시점에 키 재검증 1회(실패하면 전이하지 않고 409 `byok_key_invalid`), `byok_quota_exhausted`는 재검증 없이 시도 허용(`01_state_machine.md` 2절) |
| 22 | `paused` → `completed` (사용자) | #15. **이어서 평가 등록** |
| 23 | `paused` → `abandoned` | C1 |
| 24 | `paused` → `completed` (7일 스케줄러) | C1. **이어서 평가 등록** — 클라이언트가 없는 경로(D18의 근거) |
| 25 | `paused` → `canceled` | #33 |
| 26 | `completed` → `evaluating` | **서버 부작용 `enqueueEvaluation`**(6.2절) |
| 27 | `completed` → `failed` | `enqueueEvaluation` 3회 실패 시(6.2절) |
| 28 | `evaluating` → `evaluated` | **I2의 코치 단계 종료 시**(성공·실패 무관 — D31로 I3가 없어졌습니다) |
| 29 | `evaluating` → `completed` | I2 (재시도 잔여) |
| 30 | `evaluating` → `failed` | I2 또는 게으른 워치독(6.5절)/C1 |
| 31 | `evaluated` → `evaluating` | **미대응 — `[later]`.** 전이 표가 "MVP 범위 밖"으로 명시한 행이며, #16은 `evaluated`에 409를 돌려줍니다 |
| 32 | `failed` → `evaluating` | #16 (**사용자 재시도의 유일한 진입점**) |
| 33 | `failed` → `canceled` | #33 |
| 34 | `abandoned` → `canceled` | #33 |
| 35 | 모든 상태 → (행 삭제) | #23, #31 |

**남은 미대응 목록 (1행).**

| # | 전이 | 왜 대응이 없나 | 범위 |
|---|---|---|---|
| 31 | `evaluated` → `evaluating` | 전이 표 자신이 가드 칸에 "MVP 범위 밖 — `[later]`"라고 적어 둔 행입니다. 구현하면 기존 평가를 보존한 채 `evaluations` 행을 새로 만들어야 하는데, 리포트 화면이 다중 평가 버전을 다룰 준비가 되어 있지 않습니다 | **`[later]` — 범위 밖.** 결함이 아닙니다 |

**나머지 34행은 전부 담당이 있습니다.** D27(예약 게이트)·D29(체험 동의)·D30(동시 예약 1건)은 기존 전이의
**가드와 부작용만** 바꾸었을 뿐 새 전이를 만들지 않았으므로, 이번 재전수에서 추가된 행은 D28의 2행이 전부입니다.
MVP에서 이 전이가 일어나는 경로는 존재하지 않아야 하고, #16이 `evaluated` 세션에 409를 돌려주는 것이
그 보장입니다. 고아 엔드포인트(전이를 일으키지 않는데 전이를 주장하는 라우트)는 없습니다.

---

### 4.7 예약 게이트와 재원 분기 (D27 · 적용 범위는 D28이 좁힘)

> **원본은 `02_ai_architecture.md` 8.3절, 함수 시그니처는 `04_data_layer.md` 3.14.1절입니다.**
> 이 절은 **라우트가 무엇을 언제 부르는가**만 정합니다. 예약량·한도·마진 계산은 저 문서들이 원본입니다.

#### 4.7.0 적용 범위 — **체험 세션만**

**게이트·예약·소비·반납은 전부 `funding_source = 'trial_shared'` 세션에만 적용됩니다.**
`byok` 세션은 예약 원장을 **조회하지도, 잡지도, 반납하지도 않습니다.** BYOK 사용자는 공용 여력과
무관하게 언제든 시작할 수 있고, 그것이 D28의 유일한 이득입니다.

**분기는 라우트마다 흩지 않습니다.** `02_ai_architecture.md` 13.7.1절 ②의 요구를 그대로 받습니다 —
원장을 만지는 **네 함수의 진입부 한 곳**에만 둡니다.

```ts
// src/lib/quota/gate.ts — 원장을 만지는 유일한 모듈. 라우트는 여기만 부른다.
// 네 함수 전부 진입부 첫 줄이 같다:  if (fundingSource !== 'trial_shared') return NO_OP;
peekCapacity(userId, fundingSource)                   // #3 문 앞 조회 (비원자적, 홀드 없음)
reserveSessionQuota(sessionId, fundingSource)         // #6 / #16 / #18 확정 예약 (원자적)
consumeSessionQuota(sessionId, fundingSource, bucket) // 프로바이더 호출 직전
releaseSessionQuota(sessionId, fundingSource, buckets, reason)  // 반납 6지점
```

> **2026-09-11 구현 반영 (`vercel-platform-engineer`).** `src/lib/quota/gate.ts`가 위 4종을 그대로
> 구현했고, 문서와 두 가지가 달라졌습니다 — 둘 다 **진입부 가드를 성립시키기 위한 변경**입니다.
>
> 1. **`peekCapacity`가 `fundingSource`를 인자로 받습니다.** 초안 시그니처(`peekCapacity(userId)`)로는
>    "네 함수 전부 진입부 첫 줄이 같다"를 만족시킬 수 없습니다 — 판정할 재원 값이 함수 안에 없으니
>    분기가 다시 라우트(#3)로 흩어집니다. #3은 사용자 키 유무로 재원을 이미 정한 뒤 이 함수를
>    부르므로(4.7.1절 ①②) 호출 측에 없는 값을 요구하는 것도 아닙니다.
> 2. **네 함수의 반환값에 `applicable: boolean`이 붙습니다.** `NO_OP`이 "여력이 없다"로 읽히면
>    BYOK 세션이 막힙니다 — `peekCapacity`의 NO_OP은 `{ applicable: false, hasCapacity: true }`이며,
>    **BYOK 사용자는 여력과 무관하게 항상 통과**한다는 4.7.5절 규칙이 이 값으로 표현됩니다.
>
> 한도 미설정(fail-open)도 `applicable: false`로 돌아옵니다 — 게이트가 꺼진 것과 BYOK라서 해당이
> 없는 것은 라우트 입장에서 같은 처분(그냥 통과)이기 때문입니다.

> **분기를 라우트에 흩으면 한 군데를 빠뜨리는 순간 BYOK 세션이 공용 원장을 갉아먹습니다.**
> 증상은 "체험 정원이 왜인지 부족하다"로만 보여 원인을 찾기 어렵습니다.
> DB 함수도 같은 가드를 갖고 있지만(`04_data_layer.md` 3.14.1절 — `byok`면
> `quota_not_applicable:byok` 예외 / `consume`은 조용히 0), **그것은 마지막 방어선이지 유일한 방어선이 아닙니다.**

#### 4.7.1 게이트 2곳 — 조회는 문 앞(#3), 홀드는 준비(#6)

| 라우트 | 성격 | 동작 |
|---|---|---|
| **#3 `POST /api/sessions`** | **문 앞 조회 — 비원자적, 홀드 없음** | ① 유효한 사용자 키가 있으면 `fundingSource='byok'`로 **무조건 통과**(원장을 읽지 않습니다). ② 아니면 체험 경로 — `profiles.trial_consumed_at IS NULL` **이고** 원장 3행이 세션 1개분을 수용하면 `fundingSource='trial_shared'`. ③ 둘 다 아니면 **세션 행을 만들지 않고 503 `capacity_unavailable`** |
| **#6 `POST .../prepare`** | **확정 예약 — 원자적, 권위** | `trial_shared`일 때만 `reserve_session_quota(sessionId, quotaDate, p_request, p_limits)`. 실패(`quota_exhausted:<bucket>`)면 **503, 전이하지 않습니다.** 세션은 `configuring`에 남고 **설정이 보존됩니다**(내일 그대로 이어서 준비할 수 있습니다). 성공하면 `session_events`에 `quota_reserved` → I1 플래너 체이닝 → 202. **그 전에 같은 사용자의 `held` 예약이 이미 있으면 409 `trial_reservation_exists`(D30, 4.7.6절)** |

- **#3의 조회는 원자적이지 않습니다.** 동시 요청이 함께 통과한 뒤 #6에서 한쪽이 거절될 수 있고,
  이는 설계에 포함된 사실입니다(`02_ai_architecture.md` 8.3.10절 2). **권위 있는 판정은 #6뿐입니다.**
- **`p_limits`는 서버가 계산해 넘깁니다 (R8).** DB는 환경변수를 읽을 수 없으므로, 그날 원장 행에 박을
  `limit_calls`를 `floor(AI_RPD_LIMIT_<BUCKET> × (1 − AI_QUOTA_SAFETY_MARGIN_PCT/100))`로 **라우트가 계산**해
  `{"pro":n,"flash":n,"flash_lite":n}` 형태로 전달합니다(`04_data_layer.md` 12.2절 R8).
  **키 3종은 그대로 보냅니다 — D34 이후 `pro`·`flash`는 휴면 버킷이라 `p_request`가 0이고, 요청량 0인
  버킷은 DB 함수가 원장 행을 만들지 않고 건너뜁니다**(`02_ai_architecture.md` 8.3.1절). 세션당 실제 요청은
  `{"pro":0,"flash":0,"flash_lite":34}` 하나뿐입니다.
- **`quota_date`는 `AI_QUOTA_RESET_TIMEZONE` 기준의 날짜**이지 UTC 날짜가 아닙니다. `new Date().toISOString().slice(0,10)`으로
  계산하면 리셋 경계에서 어긋납니다.
- **`fundingSource`는 #3에서 확정되고 이후 어떤 라우트도 바꾸지 않습니다.** DB 트리거가 UPDATE를
  예외로 막습니다(`04_data_layer.md` 3.3절). 세션 INSERT에서 이 값을 빠뜨리면 **not null 위반으로 행이 만들어지지 않습니다** — 기본값이 없는 것은 의도입니다.

#### 4.7.2 소비 기록 — 프로바이더 계층에서, 호출을 보내기 **전에**

`src/lib/ai/provider.ts`의 `complete()`/`stream()` **진입부**에서 `consumeSessionQuota(...)`를 실행합니다.
성공 후가 아닙니다 — RPD는 429로 끝난 호출도 세므로, 사후 증가는 **반납을 과다하게 만들어**
다음 사용자가 있지도 않은 여력을 예약합니다(`02_ai_architecture.md` 8.3.4절).
버킷은 `ROLE_BUCKET[role]`로 결정하며 라우트가 직접 고르지 않습니다.

#### 4.7.3 반납 6지점 — **빠뜨리면 여력이 샙니다. 두 번 부르면 여력이 부풀어 오릅니다**

| # | 지점 | 호출 | 반납 버킷 |
|---|---|---|---|
| 1 | `→ completed` (#15, #9 종료 조건, C1 1단계) | `release(id, ['flash_lite'], 'completed')` — **부분 반납** | **`flash_lite` 한 버킷에서 `reserved − consumed − 6`**(0 미만이면 0). **6은 남깁니다** — 평가자 4 + 코치 2가 아직 같은 버킷을 먹습니다(D34) |
| 2 | **I2 코치 단계 완료 → `evaluated`** | `release(id, null, 'settled')` | 잔여 전부(정산) |
| 3 | #33 `cancel` (7개 전이 전부) | `release(id, null, 'canceled')` | 전부 |
| 4 | C1 `paused → abandoned` | `release(id, null, 'abandoned')` | 전부 |
| 5 | I2 재시도 소진 → `failed`, I1 플래너 실패, #35 `abandon-preparation` | `release(id, null, 'failed')` | 전부 |
| 6 | C1 만료 예약 스윕(워치독 5종째) | `quota_date < today AND status='held'` 행 정리 | 전부(`reason='expired'`) |

**1번은 "전량"이 아니라 "부분"입니다 (2026-09-11 D34).** D34 이전에는 버킷이 3개였고 면접이 끝나면
`flash_lite` 26을 **전량** 반납하면서 평가·코치용 `pro` 3 + `flash` 4는 계속 붙들고 있었습니다.
지금은 **활성 버킷이 `flash_lite` 하나뿐**이고 평가자·코치도 **같은 버킷**에서 먹으므로,
면접이 끝났다고 전량 반납하면 **리포트를 만들 여력이 사라집니다.** 그래서 1번만 뺄셈이 다릅니다.

```
# 1번(→ completed) — 부분 반납
released := greatest(reserved_calls - consumed_calls - 6, 0)
남는 held := 6                                    # 평가자 패스 A+B 4 + 코치 2 (02_ai_architecture.md 8.3.1절 내역 표)

# 2~6번 — 전량 반납(정산·취소·포기·실패·만료)
released := greatest(reserved_calls - consumed_calls, 0)
```

> **2026-09-11 결함 정정 — DB 함수가 부분 반납을 표현할 수 없었습니다.**
> 위 1번은 문서에만 있었고 `release_session_quota(uuid, text[], text)`에는 **남길 양을 받는 인자가
> 없었습니다.** 그대로 `'completed'`로 불렀다면 면접이 끝나는 순간 평가자 4 + 코치 2의 여력까지
> 반납돼 **완주한 세션이 리포트를 받지 못했을 것**이고, 반대로 부르지 않았다면 세션당 34가 하루 종일
> 묶였을 것입니다. 마이그레이션 `20260911000300_release_session_quota_keep.sql`이
> **`p_keep int default 0`** 을 더해 해소했습니다(기본값이 0이라 2~6번의 동작은 그대로입니다).
> `p_keep > 0`이면 행을 **`held`로 남기고** `reserved_calls`만 `consumed + keep`으로 줄입니다 —
> 여기서 `status`를 `released`로 바꾸면 뒤이은 전량 반납이 대상을 못 찾아 세션당 6이 영구히 샙니다.
> 남길 양(6)은 애플리케이션 상수 `COMPLETED_KEEP_CALLS`이며 **DB는 정책을 모릅니다.**

- **세션당 예약은 `flash_lite` 34 한 건입니다**(`02_ai_architecture.md` 8.3.1절). `pro`·`flash` 버킷은
  **휴면(요청량 0)** 이라 원장 행 자체가 만들어지지 않으므로, 반납 호출에 이 두 버킷을 넣을 일이 없습니다.
  `ModelBucket` 값 3종과 DDL은 그대로 남아 있습니다(유료 전환 대비) — **값이 남아 있다고 해서
  반납 대상이라는 뜻이 아닙니다.**
- **잔여 6은 2번(`evaluating → evaluated`)에서 정산 반납됩니다.** 즉 1번과 2번은 **같은 세션에서 순서대로
  둘 다 일어납니다** — 1번이 일어났다고 2번을 건너뛰면 세션당 6이 영구히 샙니다.
- 원본 문구는 `01_state_machine.md` 2절 전이 표(`→ completed` 3행)와 같은 문서 각주 ※입니다.

**멱등이어야 합니다 — 이중 반납 금지.** 종료 상태로 가는 경로가 여럿이므로(`failed → canceled`,
`abandoned → canceled`) **전량 반납(2~6번)은 세션이 처음 종료 계열에 도달할 때 한 번만** 일어나야 합니다.
(1번의 부분 반납은 예외가 아니라 **그 앞 단계**입니다 — 예약 행은 `held`로 남고 `reserved`가 6으로 줄어들 뿐이며,
뒤이은 2~6번 중 하나가 그 6을 마저 가져갑니다.)
`release_session_quota()`는 `status='held'` 행만 대상으로 하는 멱등 연산이고, **라우트도 그 사실에 의존해
"이미 반납했는지"를 스스로 기억하지 않습니다.** 이중 반납은 쓰지 않은 여력을 원장에 되돌려 놓아
오늘 정원을 실제보다 크게 만들고, 그러면 **벽이 다시 면접 도중으로 돌아옵니다**(`01_state_machine.md` 2절).

- **행 삭제(#23 / #31)에는 반납 호출을 두지 않습니다.** `before delete` 트리거가 보증합니다
  (`04_data_layer.md` 3.14.2절). 라우트가 한 번 더 부르면 트리거와 겹쳐 이중 반납이 됩니다.
- **6번은 안전망이지 정상 경로가 아닙니다.** 여기서 정리되는 행이 꾸준히 나오면 1~5번 중 하나가
  빠졌다는 신호입니다(`01_state_machine.md` 7.5절).

#### 4.7.4 재시도 2곳은 그때 예약합니다

| 라우트 | 필요량 | 실패 시 |
|---|---|---|
| #16 `POST .../evaluate` (`failed` 재시도 전용) | `flash_lite` **4** (평가자 패스 A + 패스 B, 재시도 여유 포함) | **503 `capacity_unavailable`. 전이하지 않습니다.** 세션은 `failed`에 남고 재시도 버튼도 그대로입니다 |
| #18 `POST .../coach/retry` | `flash_lite` **2** | **503.** `evaluated` 유지. 점수·인용은 이미 있으므로 **리포트 자체는 계속 열람 가능**합니다 |

둘 다 이미 `released`된 세션에 다시 예약하는 경로이며, 같은 unique 키를 재사용해 `status`를 `held`로 되돌립니다.
**`byok` 세션에서는 두 라우트 모두 예약 단계를 건너뜁니다.**

#### 4.7.5 `GET /api/capacity`(#36) — 버튼을 미리 잠그기 위한 라우트

원장 3행 + `profiles` 1행 + `user_api_keys` 1행을 읽습니다. **버킷별 잔여량이나 한도 수치를 응답에
담지 않습니다** — 클라이언트에 서비스 전체 여력을 노출할 이유가 없고, 내부 용어가 새는 경로가 됩니다.

```jsonc
{ "capacity": {
    "canStartSession": true,
    "keyStatus": "none",              // 'none' | 'connected' | 'invalid'
    "trialStatus": "available",       // 'available' | 'consumed'
    "nextFundingSource": "trial_shared",  // 지금 세션을 만들면 어느 재원이 되는가. 못 만들면 null
    "requiresTrialConsent": true,     // 다음 세션이 체험이고 현재 문구 버전에 동의가 없으면 true
    "consentVersion": "1.0.0",        // 현재 문구 버전. #41에 그대로 되돌려 보냅니다
    "availableAtIso": null } }
```

| 필드 | 규칙 |
|---|---|
| `canStartSession` | **`keyStatus='connected'`면 여력과 무관하게 항상 `true`**(`02_ai_architecture.md` 13.7.1절 ⑤). 그 외에는 `trialStatus='available'` **이고** 원장에 세션 1개분이 들어갈 때만 `true` |
| `availableAtIso` | 여력 소진으로 막혔을 때만 값이 있습니다(`AI_QUOTA_RESET_TIMEZONE` 기준 다음 자정). **체험 소진으로 막힌 경우는 `null`** — 기다려도 풀리지 않기 때문입니다. `null`을 "내일 오세요"로 렌더하면 거짓말이 됩니다 |
| `requiresTrialConsent` | 동의 행이 **현재 버전**에 대해 있는지로 판정합니다(4.9절). 과거 버전 동의만 있으면 `true`입니다 |
| 금지 | `limitCalls`·`heldCalls`·`available`·버킷 이름 — **어느 것도 응답에 넣지 않습니다** |

#### 4.7.6 체험 예약은 **사용자당 동시 1건** — 두 번째 `prepare`는 409 (D30)

`profiles.trial_consumed_at`은 **첫 주질문에 답한 시점**에 기록되는데 예약은 그보다 앞선 `prepare`에서
잡힙니다. 그 틈 때문에 세션을 여러 개 만들어 `prepare`만 반복하면 **실제 체험은 0회인데 `flash_lite` 34 × N을
동시에 점유**할 수 있고, `flash_lite`가 그날 체험 정원을 혼자 결정하므로(`02_ai_architecture.md` 8.3.1절 —
하루 12세션) **한 사용자가 탭 12개로 정원 전체를 잠급니다.**
악의가 없어도 브라우저 탭 몇 개면 발생합니다.

**`funding_source = 'trial_shared'` 사용자가 이미 `status='held'` 예약을 갖고 있으면 #6의 두 번째 예약을
409 `trial_reservation_exists`로 거절합니다.** 전이하지 않고 세션은 `configuring`에 남으며 설정도 보존됩니다.

- **강제 지점은 DB 함수입니다.** `reserve_session_quota`가 같은 사용자의 `held` 예약 존재를 확인하고
  있으면 예외를 던집니다(`04_data_layer.md` 3.14.1절). **라우트에만 두면 동시 요청에서 빠져나갑니다** —
  BYOK 세션의 원장 행을 함수가 막는 것과 같은 이유입니다. 라우트는 이 예외를 409로 번역할 뿐입니다.
- **`byok` 세션에는 해당하지 않습니다.** 예약 자체를 하지 않으므로 `held` 행이 존재할 수 없고,
  이 코드는 `funding_source='byok'`에서 **절대 나오지 않습니다**(`capacity_unavailable`과 같은 성질입니다).
- **재시도 2곳(#16·#18)에서는 나오지 않습니다.** 둘 다 이미 `released`된 **같은 세션**의 예약을 되돌리는
  경로라 "다른 세션이 물고 있는 `held`"가 아닙니다(4.7.4절).
- **빠져나가는 길은 취소입니다.** 기존 예약을 버리고 새 세션으로 가고 싶으면 이전 세션을 #33으로
  취소하면 되고, 취소는 이미 반납을 부작용으로 갖습니다(4.7.3절 3번). 반납 6지점 중 어느 하나가
  일어나면 `held`가 사라져 다음 `prepare`가 통과합니다.
- **`details.existingSessionId`는 그 `held` 예약이 붙어 있는 세션의 id입니다.** 프론트가
  "진행 중인 면접으로 가기" 링크를 만드는 유일한 근거이며, `activeSessions`로 추측하지 않습니다
  (`06_ui_plan.md` 16절 #10 — 폴백이 틀리면 사용자를 엉뚱한 세션으로 보냅니다).

---

### 4.8 BYOK — 키 라우트와 프로바이더 호출 (D28)

#### 4.8.1 키 라우트 4개 — **응답에 키 원문 필드가 존재하지 않습니다**

| # | 라우트 | 하는 일 |
|---|---|---|
| 37 | `GET /api/account/api-key` | 상태 조회. 행이 없으면 `keyStatus='none'`(별도 상태 값이 아니라 **행 없음**입니다) |
| 38 | `PUT /api/account/api-key` | **연결과 교체가 같은 라우트입니다.** ① 형식 검증 → ② 프로바이더 검증 호출 1회 → ③ 성공 시 `set_user_api_key(userId, key, last4)`(전체 교체, 옛 암호문 파기) → ④ `account_events`에 `api_key_connected` / `api_key_replaced` |
| 39 | `DELETE /api/account/api-key` | **실제 삭제.** 행 삭제 → 트리거가 `vault.secrets`까지 지웁니다. `account_events`에 `api_key_disconnected` |
| 40 | `POST /api/account/api-key/verify` | 검증만 재실행. 성공이면 `status='connected'` + `last_verified_at=now()`, 실패면 3분류(10.2절)를 `last_failure_code`에 기록하고 `api_key_marked_invalid` |

**키 원문이 나가지 않는 것을 어떻게 보장하는가 — 4중 강제**

| # | 강제 지점 | 내용 |
|---|---|---|
| 1 | **타입에 자리가 없다** | 12절 `ApiKeyStatus`에 키 원문 필드가 **없습니다.** 네 라우트 전부 이 타입만 반환하고, `user_api_keys`를 `select *`로 읽어 그대로 돌려주는 코드 경로를 두지 않습니다(원문 컬럼 자체가 DB에 없습니다 — `04_data_layer.md` 3.15절) |
| 2 | **방향이 한쪽뿐이다** | 키 원문은 **#38 요청 body에만** 존재합니다. `PUT`이 "조회 후 편집"이 아니라 **전체 교체**인 이유가 이것입니다 — 편집하려면 먼저 읽어야 하고, 읽는 순간 원문이 클라이언트로 나갑니다 |
| 3 | **복호화 지점이 하나다** | `src/lib/ai/credentials.ts`의 `resolveCallCredentials(sessionId)`만 `get_user_api_key()`(service_role 전용)를 부릅니다. 라우트도 UI도 이 함수를 부르지 않습니다 |
| 4 | **로깅 화이트리스트** | `ctx`를 통째로 직렬화하지 않습니다. 로그·스팬 속성·예외 페이로드에 남는 것은 **`{ sessionId, role, bucket, fundingSource, keyFingerprint }`** 뿐이고, `keyFingerprint`는 **끝 4자리**입니다. `06_ui_plan.md`가 화면에 쓰는 값도 `keyLast4` 하나뿐입니다(복사 버튼·"보기" 토글을 만들 수 없습니다 — 줄 값이 없습니다) |

**#38 요청 body의 취급.** `{ apiKey }`는 zod 검증 후 **즉시 `set_user_api_key`의 인자로 넘기고 변수를 재사용하지 않습니다.**
요청 body 전체를 로깅하는 미들웨어·에러 리포터를 이 라우트에 붙이지 마세요 — **body 로깅이 이 설계에서
키가 샐 수 있는 유일한 남은 경로입니다.** 검증 실패(400)의 `details.fields`에도 입력값을 되비추지 않습니다.

#### 4.8.2 프로바이더 호출 — `LlmCallContext`와 **공용 키 폴백 금지**

`02_ai_architecture.md` 4.4.1절의 시그니처를 그대로 따릅니다. **`ctx`는 선택 인자가 아닙니다.**

```ts
type FundingSource = 'trial_shared' | 'byok';
type ModelBucket   = 'flash_lite' | 'flash' | 'pro';  // D34 이후 활성 버킷은 'flash_lite' 하나.
                                                      // 'flash'·'pro'는 휴면(요청량 0)이며 값만 남겨 둡니다(유료 전환 대비).
                                                      // ROLE_BUCKET은 5개 역할 전부를 'flash_lite'로 매핑합니다.

interface LlmCallContext {
  sessionId: string;
  role: AgentRole;
  fundingSource: FundingSource;
  apiKey: string;          // byok일 때 서버에서 복호화된 평문. 로깅 금지
  keyFingerprint: string;  // 끝 4자리. 로깅 가능한 유일한 키 관련 값
}

interface LlmProvider {
  complete(req: CompletionRequest, ctx: LlmCallContext): Promise<CompletionResult>;
  stream  (req: CompletionRequest, ctx: LlmCallContext): AsyncIterable<StreamChunk>;
}
```

**폴백 금지를 구조로 거는 방법 — 주석으로 적지 않습니다.**

```ts
// ✅ ctx를 재시도 루프 "밖"에서 한 번 만들어 고정한다 (02_ai_architecture.md 4.4.3절)
const ctx = await resolveCallCredentials(sessionId, role);   // 이 호출은 세션당 1회
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try { return await provider.complete(req, ctx); }          // 언제나 같은 ctx
  catch (e) { const n = normalizeProviderError(e, ctx); if (!n.retryable) throw n; await backoff(attempt); }
}

// ❌ 재시도 루프 "안"에서 ctx를 다시 만들면 그곳이 폴백 구멍이다
```

| 규칙 | 내용 |
|---|---|
| `ctx`는 루프 밖에서 한 번 | 재시도(`02_ai_architecture.md` 11.4절)와 폴백 사다리 3단계 백오프는 **같은 `ctx`로만** 재호출합니다 |
| 정합성 단언 | `fundingSource='byok'`인데 `apiKey`가 비었으면 **호출하지 않고 즉시 실패**합니다. 공용 키로 대체하지 않습니다 |
| 클라이언트 캐시 금지 | 프로바이더 클라이언트를 **키가 박힌 싱글턴**으로 만들지 않습니다. 호출마다 `ctx.apiKey`로 구성합니다 — 세션 A의 키가 붙은 싱글턴을 세션 B가 재사용하는 사고가 여기서 납니다 |
| 체험 잔여는 판단에 들어오지 않음 | "BYOK 키가 죽었는데 마침 체험이 남았으니 공용으로 돌리자"가 **정확히 금지된 동작**입니다 |
| 반대 방향도 금지 | 체험 세션이 사용자 키로 넘어가는 것도 금지입니다 — 사용자가 그 세션에 자기 토큰을 쓰겠다고 말한 적이 없습니다 |

**폴백하면 무슨 일이 일어나는가:** D29 동의를 받지 않은 **이력서와 답변이 공용 경로로** 나가고,
사용자는 그 사실을 모릅니다. `pause_reason='rate_limited'`가 `funding_source='byok'` 행에 기록되면
이 금지가 깨졌다는 뜻이고, **보안 사고로 다룹니다**(`02_ai_architecture.md` 8.3.9절).

---

### 4.9 체험 데이터 처리 동의 (D29)

#### 4.9.1 라우트 — `POST /api/trial-consent`(#41)

```jsonc
// 요청
{ "consentVersion": "1.0.0", "sessionId": "…" }   // sessionId는 선택(이 동의를 유발한 세션)
// 응답 201 (같은 버전 재동의는 200, 기존 행 그대로)
{ "consent": { "id": "…", "consentVersion": "1.0.0",
               "grantedAt": "2026-09-10T…Z", "sessionId": "…" } }
```

- `trial_consents`에 **`(user_id, consent_version)` upsert**로 씁니다 — 같은 버전 재동의는 멱등입니다.
- **`consent_text_sha256`은 서버가 계산합니다.** 클라이언트가 보내지 않습니다 — 보내게 하면 사용자가
  본 적 없는 문구에 대한 해시를 기록할 수 있습니다. 대상은 **애플리케이션 상수의 문구 원문 전체(공백 정규화 후)** 의 SHA-256 hex입니다.
- **문구 원본은 `src/lib/consent/trial-consent.ts` 한 곳입니다.** 서버 라우트와 동의 다이얼로그가
  **같은 상수를 import**하며, 화면과 해시가 갈라질 수 있는 두 번째 사본을 만들지 않습니다.
  이 때문에 문구를 내려주는 별도 엔드포인트를 두지 않습니다.
- **`consentVersion`이 현재 버전과 다르면 409 `consent_version_stale`**(`details.currentVersion`)입니다.
  오래된 클라이언트 번들이 옛 문구를 띄워 놓고 동의를 기록하는 것을 막습니다. 프론트는 이 오류를 받으면
  **새로고침 후 다시 띄웁니다.**
- `account_events`에 `trial_consent_granted`를 남깁니다(`session_events`가 아닙니다 — 지표 1·2의 원천을 오염시키지 않습니다).

#### 4.9.2 가드 — 동의 없이 `prepare`가 오면 **409**

```
#6 prepare, funding_source = 'trial_shared':
   1. trial_consents에 (user_id, 현재 문구 버전) 행이 있는가?
        없음 → 409 trial_consent_required { requiredConsentVersion }   ← 전이하지 않음
   2. reserve_session_quota(...)                                       ← 실패 시 503
   3. quota_reserved 이벤트 → I1 체이닝 → 202
```

> **"현재 버전에 동의했는가"는 서버 가드의 책임입니다 (R9).**
> DB 트리거는 **동의 행의 존재**만 검사합니다 — 현재 버전이 애플리케이션 상수라 DB가 알 수 없기 때문입니다
> (`04_data_layer.md` 3.16절·12.2절 R9). 문구를 올린 뒤 **옛 버전 동의만 가진 사용자는 DB 층을 통과합니다.**
> 라우트가 버전을 대조하지 않으면 D29가 실질적으로 깨집니다. **DB는 마지막 방어선이지 유일한 방어선이 아닙니다.**

- 동의는 **체험에만** 필요합니다. `funding_source='byok'` 세션은 이 검사를 전혀 타지 않습니다.
- 거부는 막다른 길이 아닙니다 — 세션은 `configuring`에 그대로 머물고 설정이 보존됩니다.
  프론트는 `/settings/api-key`로 보냈다가 돌아와 같은 세션을 이어서 준비합니다.
- **체험 소진 기록은 동의 시점이 아닙니다.** `profiles.trial_consumed_at`은 체험 세션에서
  **후보가 첫 주질문에 답한 턴을 저장하는 트랜잭션 안에서** `... where trial_consumed_at is null`로 기록합니다
  (#9, `04_data_layer.md` 3.1절). 준비만 하고 그만둔 세션은 체험을 소진하지 않습니다.

---

## 5. 면접관 스트리밍 엔드포인트 — `POST /api/sessions/[sessionId]/turns`

### 5.1 요청

```ts
type AnswerCommit = {
  answerSeq: number;            // 이 후보 발화가 차지할 turns.seq. 클라이언트가 마지막으로 아는 seq + 1
  questionId: string;           // 지금 답한 질문
  transcriptText: string;       // 1~4000자. 정화 전 원본을 그대로 보낸다
  modality: 'voice' | 'text';
  sttConfidence?: number | null;// 0~1. 없으면 null (03_voice_pipeline.md L6 — NULL이 흔함)
  startedAt?: string | null;    // ISO8601
  endedAt?: string | null;
};
```

- **`Content-Type`은 `application/json`만 허용합니다.** `multipart/form-data`와 `audio/*`는
  **415 `unsupported_media_type`으로 거부**합니다 (`03_voice_pipeline.md` P4 — 오디오 미저장의 서버 쪽 장치).
- 요청 본문 상한 **64KB**. 초과 시 413.
- **멱등성은 `unique (session_id, seq)`가 담당합니다.** `answerSeq`가 이미 있으면
  **409 `turn_seq_conflict`** + `details: { currentSeq }`를 돌려주고, 클라이언트는 #10으로 재동기화합니다.
  **여기서 LLM을 다시 부르지 않습니다** — 중복 호출은 무료 티어 쿼터를 그대로 태웁니다.

### 5.2 응답 — SSE 이벤트 4종 (`02_ai_contracts.md` 3.5절이 원본. 페이로드는 camelCase)

```
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

| event | data | 비고 |
|---|---|---|
| `utterance_chunk` | `{ "seq": number, "text": string }` | 문장 단위 10~80자. **`<<<META>>>` 이후 텍스트는 절대 포함되지 않는다** |
| `utterance_done` | `{ "turnId": string, "questionId": string \| null, "parentQuestionId": string \| null, "depth": number, "questionKind": "main"\|"follow_up"\|null, "action": InterviewerAction, "targetAxis": Axis \| null, "sessionStatus": StreamSessionStatus }` | 전부 **서버 확정값**(3.4절 후처리 결과). 모델 원본 META가 아니다. `sessionStatus`로 종료 조건 충족(`completed`)을 함께 알린다. **타입은 `SessionStatus`(11값)가 아니라 그 2값 부분집합 `StreamSessionStatus`입니다** — 아래 주석 참조 |
| `session_notice` | `{ "kind": "distress_guard"\|"pressure_capped"\|"rate_limit_fallback", "level": number \| null, "messageKo": string }` | G4 발동 시 UI가 3지 선택 다이얼로그를 띄우는 신호 |
| `stream_error` | `{ "code": "llm_timeout"\|"llm_rate_limited"\|"llm_failed"\|"byok_key_invalid"\|"byok_quota_exhausted", "retryable": boolean, "messageKo": string }` | 폴백 사다리(`01_state_machine.md` 4절) 연동. **HTTP 상태는 이미 200이므로 오류는 이 이벤트로만 전달된다**. **`byok_*` 2종은 2026-09-10 신규(D28)** — `funding_source='byok'`에서만 나오고 `retryable:false`이며, 세션은 대응하는 `pause_reason`으로 `paused`가 된다(10.2절). **`messageKo`에 프로바이더 원문을 넣지 않는다** |

- **`utterance_done`은 스트림당 정확히 1회**이며 마지막 이벤트입니다. `stream_error`가 나간 경우에는
  `utterance_done`을 보내지 않고 스트림을 닫습니다.
- **`utterance_done.sessionStatus`의 타입은 `StreamSessionStatus` = `'in_progress' | 'completed'`** 입니다
  (12절에 정의). 세션 객체의 `status`(`SessionStatus`, 11값)와 **같은 문자열 공간이지만 폭이 다릅니다** —
  좁힌 것이지 누락이 아닙니다. 스트림은 `in_progress`에서만 시작하고(`01_state_machine.md` 2절),
  그 스트림이 끝난 뒤의 상태는 계속(`in_progress`) 아니면 종료 조건 충족(`completed`) 둘뿐입니다.
  `paused`(`rate_limited`·`byok_key_invalid`·`byok_quota_exhausted`)와 `failed`는 전부 `stream_error`로
  끝나 `utterance_done` 자체가 나가지 않고, `canceled`는 스트림 밖의 별도 요청이며, `evaluating` 이후는
  `completed` 전이의 서버 부작용이라 이 스트림에서 관측되지 않습니다.
  **원본은 `02_ai_contracts.md` 3.5절**(`utterance_done.sessionStatus` 항)입니다.
- 15초마다 SSE 주석 하트비트(`: ping\n\n`)를 보내 중간 프록시의 유휴 종료를 막습니다.
- **프론트는 이 응답에 `res.json()`을 호출하면 안 됩니다.** 표의 "스트리밍" 열이 이 사고를 막기 위한 열입니다.

### 5.3 `<<<META>>>` 서버 처리 (M1~M8 구현 규약)

```
buffer      := ''      // 아직 청크로 확정되지 않은 발화 텍스트
held        := ''      // 센티널 부분 일치 방어용 보류분 (최대 9자 = len('<<<META>>>') - 1)
metaMode    := false   // 센티널 통과 후에는 true. 이후 모든 텍스트는 제어 블록

각 델타 d 수신:
  if metaMode: metaRaw += d; continue          // M3 — TTS·화면으로 절대 나가지 않는다
  s := held + d
  i := s.indexOf('<<<META>>>')
  if i >= 0:                                   // M1·M2 — 첫 번째만 유효
      buffer += s[0..i);  metaMode := true;  metaRaw := s[i+10..]
      flushSentences(buffer, force=true)       // 센티널 앞 텍스트는 남김없이 내보낸다
      continue
  held := 센티널의 진부분 문자열이 될 수 있는 s의 최대 접미사 (길이 ≤ 9)
  buffer += s[0 .. len(s)-len(held))
  flushSentences(buffer)                       // 종결 문자 기준. 10~80자 규칙
```

| # | 규칙 | 구현 |
|---|---|---|
| M1 | 센티널은 정확히 `<<<META>>>` | 문자열 일치. 정규화·trim 하지 않음 |
| M2 | 응답당 1회, 2회째부터 무시 | `metaMode`가 true가 된 뒤에는 재탐색하지 않음 |
| M3 | 센티널 이후는 서버 전용 | `metaRaw`에만 쌓고 `utterance_chunk`로 내보내지 않음 |
| M4 | 센티널 다음 줄은 개행 없는 JSON 1줄 | `metaRaw.trim()`을 `JSON.parse`. 코드펜스가 있으면 벗겨서 1회 재시도 |
| M5 | 발화 본문에 JSON·마크다운·이모지 금지 | 출력 검사기(G5)가 위반 시 1회 재생성 |
| M6 | 센티널 미도착 | `action := guards.forced_action ?? 'follow_up'`, `session_events(event_name='interviewer_meta_missing')` 경고. **대화는 멈추지 않는다** |
| M7 | 스트림 중단(abort) | 확정된 청크까지를 `turns.transcript_text`로 저장하고 M6 적용 |
| **M8** | **스트림 종료 시 보류분 `held` 처리** | `held`가 센티널을 포함하면 센티널 처리 / **센티널의 진부분 문자열이면 그대로 발화로 flush** / 그 외에도 flush. **버리는 경로는 존재하지 않는다.** flush 이후에 `utterance_done`을 보낸다 |

> **M8은 `03_voice_pipeline.md` 7.2절 표의 두 번째 조건과 정면으로 반대입니다.** 그 표는 "접두사이면
> 버린다"라고 적혀 있고, 계약 M8(D17)은 "접두사이면 flush 한다"입니다. **D17이 확정 결정이므로 M8을
> 구현합니다.** 9절 불일치 #1에 기록했습니다.

**보류분은 청크 확정 판정에도 동일하게 적용됩니다**(`03_voice_pipeline.md` 7.2절 첫 번째 조건).
즉 `held`를 포함한 상태로 문장 종결을 판정하지 않습니다. `...했습니다.<<<M` 상태에서
`...했습니다.`를 먼저 확정해 버리면, 다음 델타에서 센티널이 완성돼도 **이미 발화된 텍스트를 되돌릴 수 없습니다.**

### 5.4 클라이언트 abort 감지

`02_ai_contracts.md`에 감지 수단이 없어(`03_voice_pipeline.md` 15절 #5) 여기서 확정합니다.

```
1. Route Handler의 request.signal 에 'abort' 리스너를 건다.
2. ReadableStream의 cancel(reason) 콜백도 같은 종료 경로를 부른다. (두 신호 중 먼저 오는 쪽)
3. 종료 경로가 하는 일 (순서 고정):
   a. 프로바이더 스트림에 상위 AbortController.abort() 전파 — 쿼터를 계속 태우지 않는다
   b. M8의 held flush 로직을 그대로 실행해 텍스트를 확정
   c. 확정 텍스트가 1자 이상이면 turns(면접관 발화) INSERT  ← M7
      0자면 INSERT 하지 않는다 (transcript_text는 not null, char_length >= 1)
   d. META가 없으므로 M6 적용 → action 확정 → questions 필요 시 INSERT
   e. session_events(event_name='interviewer_stream_aborted', trigger='system_error')
4. b~e는 waitUntil()로 감싼다. 응답이 이미 끊긴 뒤에도 실행이 보장되어야 한다.
   await 하지 않은 promise는 함수 종료와 함께 잘려나가 turns 행이 유실된다.
```

**클라이언트가 abort했다고 세션 상태를 바꾸지 않습니다.** `in_progress` 그대로입니다
(`03_voice_pipeline.md` 12절 F18: "변화 없음").

### 5.5 재연결 시 동작

**SSE 재개(resume)를 지원하지 않습니다.** `Last-Event-ID` 헤더를 읽지 않고 `id:` 필드도 보내지 않습니다.

| 근거 | 내용 |
|---|---|
| 부분 발화를 이어 붙일 수 없다 | 재개하려면 중단 지점의 LLM 스트림 상태를 서버가 들고 있어야 하는데, 서버리스 함수는 호출 간 상태를 유지하지 않습니다 |
| 다시 호출하면 쿼터를 두 번 쓴다 | 무료 티어 RPD가 유일한 병목입니다(`02_ai_architecture.md` 8.3절) |
| 이미 저장돼 있다 | M7·5.4절이 확정분을 `turns`에 저장했으므로 **재조회로 복구하면 됩니다** |

```
재연결 절차 (클라이언트):
  1. EventSource/fetch 스트림이 끊김 → 재요청하지 않는다
  2. GET /api/sessions/[sessionId]/turns?afterSeq={마지막으로 받은 seq}  ← #10
  3. 응답의 turns/questions로 화면을 복구. 면접관 발화가 저장돼 있으면 그것이 정답이다
  4. "다시 듣기"는 2번 결과의 텍스트를 TTS에 다시 넣을 뿐 서버를 다시 부르지 않는다
  5. 2번 응답에 면접관 발화가 없으면(=0자 확정) 같은 answerSeq로 #9를 재시도한다.
     이 경우에만 LLM이 다시 호출된다
```

---

## 6. 비동기 평가 — `evaluating` → `evaluated` / `failed`

### 6.1 왜 요청-응답으로 끝낼 수 없는가

`02_ai_architecture.md` 8.1절: 평가자 25~50s + 코치 20~40s = **정상 경로만 45~90s**,
재시도(평가 3회·코치 2회) 포함 시 **수 분**.

**실행 상한이 300초라는 사실(D31)은 이 절의 결론을 바꾸지 않습니다.** 이유는 시간이 아니라
**요청의 수명**입니다 — 사용자가 탭을 닫으면 그 요청은 끝나고, 응답을 기다리던 화면도 없습니다.
`01_state_machine.md` 7절("평가 대기 중 나감 → 평가는 서버에서 계속")을 지키려면 평가는
**사용자 요청과 분리된 함수 호출**에서 돌아야 합니다. 그래서 `evaluate`는 여전히 **202를 즉시 반환하고
`waitUntil`로 워커를 띄웁니다.** D31이 바꾼 것은 그 워커 **안쪽**입니다.

### 6.2 채택안 — **워커 1회 호출 + Realtime 전달 + 게으른 워치독** (D31로 단순화)

무료 플랜에는 **상시 실행 워커도, 관리형 큐도, 분 단위 크론도 없다는 전제**에서 출발합니다
(`05_deploy.md` 3절 — 2026-09-10 확인). 그래서 큐 인프라를 새로 붙이지 않고, **DB를 큐로 쓰고
사용자 요청과 분리된 함수 호출 하나에 평가 작업 전체를 맡깁니다.**

> **D31로 무엇이 바뀌었나 (2026-09-10).** 초안은 실행 상한을 60초로 가정해 평가자와 코치를
> **별도 함수 호출로 체이닝**했습니다. 실제 상한은 **300초**이므로 그 회피책의 이유가 사라졌습니다.
> 이제 **한 워커 호출 안에서 평가자 → 코치를 순차 실행**합니다.
>
> **두 단계를 논리적으로 합치지는 않았습니다.** 독립 재시도(평가 3회 / 코치 2회)와 부분 성공
> (**코치가 실패해도 점수·인용은 남습니다** — `improvement`가 nullable인 이유)은 **의도된 성질**이며
> 그대로입니다. 바뀐 것은 **전송 계층뿐**입니다.
>
> | | 이전 | 이후 |
> |---|---|---|
> | 내부 워커 라우트 | **3종**(I1·I2·I3) | **2종**(I1·I2) |
> | 내부 HTTP 홉 | 2회(evaluate → coach) | **1회**(enqueue → evaluate) |
> | `JOB_SECRET` 왕복 | 2회 | **1회** |
> | 실패 모드 | + "1단계 성공 후 2단계 호출 유실" | **그 모드 소멸** |
> | 단계 경계 | 함수 경계 | **함수 안의 코드 경계**(try/catch 2블록) |
>
> **사라진 실패 모드가 이 변경의 본체입니다.** 체이닝 `fetch`가 유실되면 점수는 저장됐는데 세션은
> `evaluating`에 남아 워치독이 집을 때까지 리포트가 열리지 않았습니다. 이제 그 구간 자체가 없습니다.

**t=0은 사용자 요청이 아니라 `completed` 전이입니다 (D18).**
평가 등록은 `completed`로 **가는 모든 경로의 서버 부작용**이며, 클라이언트가 시작하지 않습니다.
근거는 `paused` 7일 자동 종료(D7)입니다 — 스케줄러가 답변 ≥ 1인 세션을 `completed`로 보낼 때
**클라이언트는 아예 존재하지 않습니다.** 클라이언트가 평가를 시작하는 구조라면 이 세션들과
"마지막 답변 직후 탭을 닫은" 세션은 영원히 `completed`에 갇힙니다
(`01_state_machine.md` 80~82행이 명시적으로 금지한 상태입니다).

```
[t=0] enqueueEvaluation(sessionId, trigger)   — `→ completed` 전이 직후, 같은 요청 안에서 실행되는 서버 함수

  ■ 호출 지점 = `→ completed` 전이가 일어나는 **모든** 곳. 예외 없음
      #15 POST .../complete       사용자가 "면접 종료" / "여기서 끝내기"     trigger='user_action'
      #9  POST .../turns (SSE)    종료 조건 충족(3절 4개 조건)              trigger='ai_completion'
      C1  GET  /api/cron/daily    paused 7일 + 답변한 주질문 ≥ 1 자동 종료   trigger='scheduler'
      ─────────────────────────────────────────────────────────────────────
      #16 POST .../evaluate       **failed 세션의 사용자 재시도일 때만**     trigger='user_action'
                                  (failed → evaluating. completed에서는 호출되지 않는다)

  ■ 하는 일
      1. 한 트랜잭션:
           interview_sessions.status = 'evaluating'
           evaluations INSERT (status='running', attempt_count=1, started_at=now())
           session_events INSERT (completed → evaluating, trigger=위 값)
      2. waitUntil(fetch(POST /api/internal/jobs/evaluate, { headers: JOB_SECRET,
                                                            body: { sessionId, evaluationId, attempt:1 } }))
         ← 응답을 기다리지 않는다. 이 fetch가 새 함수 호출을 띄운다
      3. 호출한 라우트는 **자기 응답**을 반환하고 끝난다
           #15/#9 → 갱신된 세션(= status 'evaluating')
           #16    → 202 EvaluationJobAccepted
      4. 등록 실패 시 같은 요청 안에서 3회까지 재시도하고, 소진되면 completed → failed
         (failure_reason='evaluation_enqueue_failed'). **세션을 `completed`에 방치하지 않는다**
```

- **`→ completed` 전이와 `completed → evaluating` 전이는 둘 다 `session_events`에 남깁니다.**
  등록이 같은 요청 안에서 일어난다고 `completed` 도달 기록을 건너뛰면 **지표 2(리포트 도달률)의 분모가 사라집니다.**
- `enqueueEvaluation`은 **멱등**합니다. 진입 시 세션 status가 `completed`(또는 #16 경로에서 `failed`)가
  아니면 아무것도 하지 않고 돌아옵니다. #9의 종료 판정과 #15가 경합해도 평가는 한 번만 등록됩니다.

```
POST /api/internal/jobs/evaluate           (워커 — 유일한 평가 워커. maxDuration 240s)
  body: { sessionId, evaluationId, attempt, stage?: 'full' | 'coach_only' }   기본 'full'

  ── 1단계: 평가 (stage='coach_only'이면 건너뛴다) ────────────────────────────
  → 평가자 호출 → 스키마·인용 검증(02_ai_contracts.md 5.3절) → 총점 계산(9.1절)
  → evaluations/evaluation_scores/evaluation_citations 저장 (한 트랜잭션)
  → 실패 & attempt < 3 : status='completed'로 되돌리고 attempt_count += 1,
                          지연 후 재시도 (6.4절). **여기서 함수를 끝낸다 — 코치로 내려가지 않는다**
  → 실패 & attempt = 3 : status='failed', failure_reason='evaluation_failed'. **여기서 끝낸다**

  ── 2단계: 코치 (1단계가 성공했거나 stage='coach_only'일 때만) ──────────────
  → **같은 함수 호출 안에서 이어서 실행한다.** HTTP 홉 없음
  → 코치 호출 → 검증 → summary/improvements/coach_payload + 축별 improvement UPDATE
  → 성공·실패 **어느 쪽이든** interview_sessions.status = 'evaluated'
     (코치 실패는 리포트 실패가 아니다 — 02_ai_architecture.md 3절, 04_data_layer.md 3.8절)
```

**1단계와 2단계는 서로 다른 try/catch 블록입니다.** 코치에서 던져진 예외가 평가 결과를 되돌리면 안 됩니다 —
점수·인용은 이미 커밋됐고, 코치 실패의 정의는 "`summary`가 `null`인 채로 `evaluated`"입니다.
**두 단계를 한 트랜잭션으로 묶지 마세요.** 묶는 순간 부분 성공이 사라지고 `improvement`의 nullable이
의미를 잃습니다.

| 단계 | 실패 시 세션 status | 사용자가 보는 것 | 재시도 주체 |
|---|---|---|---|
| 1단계 평가 | `completed`(잔여) 또는 `failed`(소진) | 대기 화면 / 재시도 버튼 | I2 자기 자신 → 소진 후 #16 |
| 2단계 코치 | **`evaluated`** (실패가 아닙니다) | **점수·인용이 있는 리포트** + "코칭 다시 받기" | #18 (`stage='coach_only'`) |

**#18 `coach/retry`가 부르는 것도 이 라우트입니다.** `{ stage: 'coach_only' }`를 실어 보내면
1단계를 건너뛰고 2단계만 돕니다. **코치 전용 엔드포인트를 따로 두지 않는 이유**는, 두 진입점이 갈리면
"코치 결과를 쓰는 코드"가 두 곳이 되고 축별 `improvement` UPDATE 규약이 조용히 어긋나기 때문입니다.

> **I2가 재시도를 위해 `status='completed'`로 되돌리는 것은 `enqueueEvaluation`을 부르지 않습니다.**
> 그 함수는 6.2절에 나열한 4개 라우트에서만 호출됩니다. 워커의 내부 되돌림이 등록을 다시 트리거하면
> `attempt_count`가 리셋되며 무한 루프가 됩니다. **재시도는 I2가 직접 합니다**(같은 호출 안의 `sleep` 또는 자기 재호출 — 6.4절).

**두 단계의 합이 실행 상한 아래인지가 이제 관심사입니다.** 평가자 최악 50s + 코치 최악 40s = **90s**,
평가 3회 재시도(백오프 2s + 8s 포함)까지 최악으로 겹쳐도 **약 200s**로 `maxDuration = 240`(11.2절) 안입니다.
Hobby 상한 300초와의 여유 60초는 **일부러 남긴 것**이며 근거는 11.2.1절입니다.

**왜 이 안인가 — 대안과 비교**

| 대안 | 판단 |
|---|---|
| 외부 큐(QStash·Inngest 등) | **기각.** 무료 티어 밖의 외부 의존성을 하나 더 늘립니다. 예산 제약("각 프로바이더 무료 티어 안")과 D8·D2가 만든 "외부 의존성 0" 기조에 어긋납니다 |
| 크론이 큐를 폴링 | **기각(단독으로는).** 무료 플랜의 크론 최소 주기가 분 단위가 아니면 평가가 최대 하루 늦게 시작됩니다. 리포트 대기 화면이 성립하지 않습니다 |
| 한 라우트에서 평가+코치를 다 돌리고 스트리밍으로 시간 벌기 | **기각.** 사용자가 탭을 닫으면 함수가 종료돼 `evaluating`에 갇힙니다. `01_state_machine.md` 7절이 금지한 상황입니다. **300초가 확인된 뒤에도 이 기각은 유효합니다** — 문제는 시간이 아니라 요청의 수명입니다(6.1절) |
| ~~단계 체이닝(평가 워커 → 코치 워커)~~ | **폐기(D31).** 실행 상한 60초 가정 위에서만 필요했던 회피책입니다. 홉 하나가 유실 지점이었고, 300초가 확인되면서 그 대가를 치를 이유가 없어졌습니다 |
| **워커 1회 호출(평가→코치 순차) + Realtime + 게으른 워치독** | **채택(D31).** 인프라 추가 0, 상한 준수(합계 최악 ~200s < 240s), 탭을 닫아도 서버에서 계속, **유실 지점 1개 제거** |

**남는 위험과 그 방어**

| 위험 | 방어 |
|---|---|
| ~~체이닝 `fetch`가 실패해 다음 단계가 시작되지 않음~~ | **D31로 소멸.** 단계 사이에 `fetch`가 없습니다 |
| 워커를 띄우는 첫 `fetch`(enqueue → I2)가 실패 | 남은 **유일한** 유실 지점입니다. `evaluations.status='running'` + `started_at`이 큐 역할을 하고, 게으른 워치독(6.5절)과 일 1회 크론이 재기동합니다 |
| 워커가 상한(240s)에 걸려 중간에 죽음 | 소프트 데드라인 210s에서 **새 단계를 시작하지 않고** 함수를 끝냅니다(11.2.1절). `status='running'`으로 남아 워치독이 집습니다. **상한에 그대로 잘리면 실패 상태를 기록할 시간조차 없다는 것이 여유 60초를 남기는 이유입니다** |
| `waitUntil`을 쓰지 않아 `fetch`가 잘림 | **`waitUntil` 사용을 계약으로 못박습니다.** await하지 않은 promise는 함수 종료와 함께 취소됩니다 |
| 같은 평가가 두 번 실행 | 워커는 진입 시 `evaluations`를 `status='running' and id=:evaluationId`로 조건부 UPDATE(`locked_at` 대용으로 `started_at` 갱신)해 선점하고, 갱신 행 수가 0이면 즉시 종료합니다 |

### 6.3 전이 매핑 (전이 표와 1:1)

| 전이 표 행 | 수행 주체 |
|---|---|
| `completed`→`evaluating` (평가 워커가 작업을 집음) | **서버.** `→ completed` 전이의 부작용인 `enqueueEvaluation`(6.2절)이며, 호출 지점은 **#15 · #9 · C1**입니다. 클라이언트가 이 전이를 일으키는 경로는 없습니다 (D18) |
| `evaluating`→`evaluated` (평가 결과 저장 완료) | **I2의 코치 단계 종료 시**(성공·실패 무관). D31로 별도 코치 워커 호출은 없습니다 |
| `evaluating`→`completed` (평가 실패 + 재시도 잔여) | I2 |
| `evaluating`→`failed` (재시도 3회 소진 또는 10분 워치독) | I2 또는 워치독(6.5절) |
| `completed`→`failed` (평가 큐 등록 자체가 실패, 재시도 3회) | `enqueueEvaluation`이 3회 실패 시. `failure_reason='evaluation_enqueue_failed'` |
| `failed`→`evaluating` (사용자가 리포트에서 재시도) | **#16 — 이것이 #16의 유일한 용도입니다.** `failureReason`이 평가 계열이고 `turns`가 남아 있을 때만 |
| `evaluated`→`evaluating` (평가 다시 실행) | **MVP 범위 밖 `[later]`.** #16은 `evaluated` 세션에 409를 돌려줍니다 |

**#16 `POST /api/sessions/[sessionId]/evaluate`의 상태별 응답 (D18로 좁혀진 계약)**

| 세션 status | 응답 |
|---|---|
| `failed` (+ `failureReason`이 평가 계열 + `turns` 존재) | **202 `EvaluationJobAccepted`.** 재시도 카운터를 초기화하고 `enqueueEvaluation` |
| `failed` (그 외 `failureReason`, 예: `document_extraction_failed`) | **409 `invalid_transition`** |
| `completed` | **409 `invalid_transition`.** 정상 경로에서는 서버가 이미 등록했습니다. 등록 재시도 중이라면 그 재시도가 끝납니다 |
| `evaluating` | **409 `invalid_transition`.** 이미 실행 중입니다 |
| `evaluated` | **409 `invalid_transition`** (`[later]` — 재평가는 MVP 범위 밖) |
| 그 외 전부 | **409 `invalid_transition`** |

> **UI는 리포트 화면 진입 시 #16을 자동 호출하지 않습니다.** 자동 호출은 정상 경로에서 **항상 409**를
> 받으므로 "실패하면 [평가 시작하기] 버튼 노출" 같은 폴백은 **언제나 죽은 버튼을 그립니다.**
> 재시도 버튼은 `session.status === 'failed'`이고 `failureReason`이 평가 계열일 때만 그립니다.

### 6.4 재시도·백오프

```
attempt 1 실패 → 2s 후 재시도 → attempt 2 실패 → 8s 후 재시도 → attempt 3 실패 → failed
```

- 백오프 대기가 **15초 이하면** 다음 워커 호출 안에서 `sleep` 후 이어서 돌립니다(함수 하나 안에서 끝냄).
- 15초를 넘는 대기가 필요해지면(429의 `Retry-After`가 긴 경우) **대기하지 않고 함수를 끝냅니다.**
  `evaluations.status='running'`으로 남고 게으른 워치독·크론이 다시 집습니다.
  **함수 안에서 분 단위로 잠자는 것은 실행 시간을 그대로 태우는 짓이며 금지합니다.**
- `evaluations.attempt_count`는 **평가자 시도만** 셉니다(최초 포함, 최대 3 — `04_data_layer.md` 3.7절).
  **코치 단계는 이 컬럼을 절대 UPDATE하지 않습니다.** 코치 시도는 `session_events`로만 관측합니다(D10).

### 6.5 워치독 — 10분 규칙을 무료 플랜에서 지키는 방법

`01_state_machine.md`는 "`evaluating`에 10분 이상 머문 세션은 워치독이 `failed`로 내린다"고 규정합니다.
분 단위 크론이 없으므로 **두 겹**으로 근사합니다.

| 겹 | 이름 | 동작 |
|---|---|---|
| 1 | **게으른 워치독** | `GET /api/sessions/[sessionId]`와 `GET .../evaluation`이 호출될 때, 해당 세션이 `evaluating`이고 `evaluations.started_at < now() - 10분`이면 **응답을 만들기 전에** 판정합니다: `attempt_count < 3`이면 **I2를 다시 띄우고**(D31 이후 띄울 워커는 하나뿐입니다), 아니면 `failed`로 내립니다. **사용자가 리포트 대기 화면에 있으면 폴링/재조회가 이 검사를 자동으로 돌립니다** — 정확히 필요한 사람에게만 정확한 시점에 동작합니다 |
| 2 | **일 1회 크론**(C1) | 아무도 보지 않는 세션의 안전망. 같은 규칙을 배치로 적용합니다 |

**게으른 워치독을 1순위로 두는 이유:** 이 판정이 필요한 유일한 순간은 사용자가 결과를 기다리는 순간이고,
그때는 반드시 조회 요청이 들어옵니다. 크론을 1순위로 두면 요청이 없는 세션을 위해 하루치 지연을 감수하게 됩니다.

### 6.6 `report_first_viewed_at` (지표 2)

`GET /api/sessions/[sessionId]/evaluation`이 `evaluation != null`을 반환하는 **최초 1회**에만
`report_first_viewed_at`을 `now()`로 채웁니다(이미 값이 있으면 건드리지 않음). 별도 라우트를 두지 않습니다 —
UI가 호출을 잊으면 북극성 직전 지표가 통째로 비기 때문입니다.

---

## 7. 인증·미들웨어

### 7.1 클라이언트 3종 분리 (`04_data_layer.md` 6.3절 그대로)

| 파일 | 키 | 용도 | 노출 |
|---|---|---|---|
| `src/lib/supabase/client.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저. Realtime 구독, Storage 직업로드 | 공개 |
| `src/lib/supabase/server.ts` | 같은 anon 키 + 쿠키 세션 | 서버 컴포넌트·라우트 핸들러. **소유권 확인과 읽기** | 서버 |
| `src/lib/supabase/admin.ts` | `SUPABASE_SERVICE_ROLE_KEY` | **서버 전용. RLS 우회 쓰기** | **서버 전용** |

- `admin.ts`는 첫 줄에 `import 'server-only'`를 둡니다. 클라이언트 컴포넌트가 import하는 모듈에서
  **어떤 경로로도** 참조되면 안 됩니다.
- `admin.ts`를 쓰는 모든 호출 지점에 **왜 RLS 우회가 필요한지 한 줄 주석**을 답니다.

### 7.2 `proxy.ts`

```ts
export const config = {
  matcher: [
    // 정적 자산과 이미지 최적화를 제외한 전부
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)',
  ],
};
```

| 하는 일 | 상세 |
|---|---|
| **세션 쿠키 갱신** | `@supabase/ssr`의 `createServerClient` + `getUser()`를 매 요청 호출해 만료 임박 토큰을 갱신하고 응답에 쿠키를 되씁니다. **이 갱신을 빠뜨리면 "로그인했는데 로그아웃됨" 버그가 납니다** |
| **보호 라우트 판정** | 아래 표 |
| **하지 않는 일** | 리소스 소유권 확인. 미들웨어는 "로그인했는가"만 봅니다 |

| 경로 | 미인증 | 인증됨 |
|---|---|---|
| `/`, `/login` | 통과 | `/login`은 **`/dashboard`로 302** |
| `/dashboard`, `/sessions/**`, `/documents/**`, `/settings/**` | **`/login?next={원래 경로}`로 302** | 통과 |
| `/api/**` (내부·크론 제외) | **401 JSON** (`{ "error": { "code": "unauthenticated", ... } }`) | 통과 |
| `/api/internal/**` | **미들웨어 통과 없이 라우트가 `JOB_SECRET` 헤더를 검사** | 동일 |
| `/api/cron/**` | **`Authorization: Bearer ${CRON_SECRET}`** 검사. 불일치 시 401 | 동일 |

**API 라우트를 302로 리다이렉트하지 않습니다.** fetch가 로그인 HTML을 받아 `res.json()`이
`SyntaxError`로 터지고, 프론트에는 "알 수 없는 오류"만 보입니다. API는 **언제나 JSON 401**입니다.

### 7.3 라우트 안에서 **다시** 확인합니다

미들웨어 통과는 "로그인했다"일 뿐 **"이 세션의 주인이다"가 아닙니다.**

```
모든 /api/sessions/[sessionId]/** 라우트의 첫 3줄:
  const { data: { user } } = await supabaseServer.auth.getUser()
  if (!user) → 401 unauthenticated
  const session = await supabaseServer.from('interview_sessions').select().eq('id', sessionId).maybeSingle()
  if (!session) → 404 not_found     // RLS가 남의 세션을 이미 안 보이게 하므로 403이 아니라 404다
```

- **RLS가 있어도 코드로 확인합니다.** 쓰기는 `admin.ts`(service_role)로 하는데 그 클라이언트는 RLS를
  우회하므로, **소유권 검사가 빠지면 남의 세션을 마음대로 고칠 수 있습니다.** 이 프로젝트에서 가장 비싼 버그가 됩니다.
- 소유권 확인은 반드시 **`server.ts`(anon + 쿠키)로 읽어서** 합니다. `admin.ts`로 읽으면 RLS가
  꺼진 상태라 검사 자체가 의미를 잃습니다.
- 존재하지 않는 세션과 남의 세션을 **똑같이 404**로 답합니다. 403을 쓰면 "그 id는 존재한다"가 새어 나갑니다.

---

## 8. RLS와의 관계 — 어느 라우트가 `admin.ts`를 쓰는가

`04_data_layer.md` 5.1절 3항: **세션·질문·턴·이벤트·평가 계열은 클라이언트 쓰기 정책이 아예 없습니다.**
정책이 없으면 `authenticated`의 INSERT/UPDATE/DELETE는 전부 거부되므로, 이 데이터는
**반드시 서버 라우트 + `service_role`**로만 씁니다.

| 라우트 | 읽기(`server.ts`) | **쓰기(`admin.ts`)** | 쓰는 테이블 |
|---|---|---|---|
| #3 POST `/api/sessions` | 소유권 없음(생성) | **예** | `interview_sessions`, `session_events` |
| #5 PATCH `.../config` | 세션 | **예** | `interview_sessions`, `session_events` |
| #6 POST `.../prepare` | 세션·문서 | **예** | `session_events` |
| #7 POST `.../back-to-config` | 세션 | **예** | `interview_sessions`(스냅샷 2개 NULL 복귀), `questions` DELETE, `session_events` |
| #8 POST `.../start` | 세션·질문 | **예** | `interview_sessions`, `questions.asked_at`, `session_events` |
| **#9 POST `.../turns` (SSE)** | 세션·질문·턴 | **예** | `turns`(후보+면접관), `questions`(꼬리질문), `interview_sessions`, `session_events` |
| #11 PATCH `.../turns/[turnId]` | 턴 | **예** | `turns`(`transcript_raw`·`transcript_text`·`is_corrected`) |
| #12 POST `.../modality` | 세션 | **예** | `interview_sessions.current_modality`, `session_events` — **한 트랜잭션**(P5) |
| #13/#14/#15 pause/resume/complete | 세션 | **예** | `interview_sessions`, `session_events` |
| #15 POST `.../complete` | 세션 | **예** | `interview_sessions`, `evaluations`(등록), `session_events` — **`→ completed`와 `completed → evaluating` 두 전이를 모두 기록**(6.2절) |
| #16 POST `.../evaluate` (**`failed` 재시도 전용**) | 세션 | **예** | `interview_sessions`, `evaluations`, `session_events` |
| **#33 POST `.../cancel`** | 세션 | **예** | `interview_sessions`(`status`·`ended_at`), `session_events` — **한 트랜잭션** |
| **#35 POST `.../abandon-preparation`** | 세션·문서 | **예** | `interview_sessions`(`status`·`failure_reason`·`ended_at`), `session_events` |
| #17 GET `.../evaluation` | 평가 계열 | **예**(단, `report_first_viewed_at` 최초 1회 + 게으른 워치독일 때만) | `interview_sessions` |
| #18 POST `.../coach/retry` | 평가 | **예** | `evaluations`, `session_events` |
| #22 POST `.../events` | 세션 | **예** | `session_events` |
| #23 DELETE `/api/sessions/[sessionId]` | 세션 | **예** | `interview_sessions` DELETE(CASCADE) |
| #26 POST `/api/documents/[id]/extract` | 문서 | 아니오 — `server.ts`로 UPDATE(정책 있음) | `documents` |
| #31 DELETE `/api/account` | 프로필 | **예** | Storage 일괄 삭제 + `auth.admin.deleteUser()` (**`user_api_keys`·`trial_consents`·`account_events`는 CASCADE, Vault 암호문은 트리거가 파기**) |
| **#36 GET `/api/capacity`** | 프로필·키 상태 | **예**(읽기 전용) | 없음 — `ai_quota_ledger` **읽기**. 이 테이블은 **RLS 켜고 정책 0개**라 `server.ts`로는 한 행도 못 읽습니다 |
| **#37~#40 키 라우트** (`/api/account/api-key`) | — | **예** | `user_api_keys`(RLS 정책 0개), `vault.secrets`(함수 경유), `account_events`. **접근자 함수 2종이 `service_role`에만 grant돼 있습니다** |
| **#41 POST `/api/trial-consent`** | — | **예** | `trial_consents`, `account_events`. **`insert` 정책이 없습니다** — 클라이언트 INSERT를 허용하면 동의 화면을 거치지 않고 행을 만들어 게이트를 우회할 수 있습니다 |
| **예약 게이트**(#3·#6·#16·#18·반납 6지점) | — | **예** | `ai_quota_ledger`, `ai_quota_reservations` — **함수 3종이 `service_role` 전용**(`anon`/`authenticated`에서 revoke) |
| I1/I2 내부 워커 (**2종** — D31) | 세션·문서·턴 | **예** | `interview_sessions`, `questions`, `turns`, `evaluations`, `evaluation_scores`, `evaluation_citations`, `session_events` |
| C1 크론 | — | **예** | `interview_sessions`, `session_events`, `storage_cleanup_queue`, Storage |

**`admin.ts`를 쓰지 않는 라우트 (클라이언트 쓰기 정책이 있는 4개 테이블만 다룸)**

| 라우트 | 이유 |
|---|---|
| #24~#29, **#34** `documents` 계열 | `documents`에 select/insert/update/delete 정책이 전부 있습니다. `server.ts`로 쓰면 RLS가 소유권을 한 번 더 지켜 줍니다. **#34는 읽기 전용이며 `linkedSessionCount`도 `server.ts`로 셉니다**(RLS가 남의 세션을 세지 않게 막아 줍니다) |
| #20 PUT `.../feedback` | `report_feedback` insert/update 정책 있음. **WITH CHECK가 `user_id` + `OWNS_SESSION`을 둘 다 보므로 RLS가 오히려 더 안전합니다** |
| #21 POST `.../disputes` | `score_disputes` insert 정책 있음. 위와 동일 |
| #30 GET `/api/account` | 읽기만 |

> **원칙: 클라이언트 정책이 있는 테이블에는 `admin.ts`를 쓰지 않습니다.** service_role로 쓰면 편하지만
> RLS라는 두 번째 그물을 스스로 걷어내는 것이고, 라우트의 소유권 검사 한 줄이 빠지는 순간 방어가 0이 됩니다.

### 8.1 `documents`·`report_feedback`·`score_disputes`도 API를 경유하는 이유

RLS상으로는 클라이언트가 Supabase 클라이언트로 직접 읽고 쓸 수 있습니다. 그럼에도 라우트를 두는 이유는
**네이밍 경계 하나**입니다. 직접 읽으면 프론트에 `extraction_status`·`is_helpful` 같은 snake_case가
그대로 들어오고, 고정 제약("프론트 타입은 camelCase, 변환은 API 라우트에서 한 번")이 깨집니다.
**예외는 2.1절 E1(Realtime)과 E2(Storage 직업로드) 둘뿐입니다.**

---

## 9. 서버가 계산하는 값 (LLM에 맡기지 않는 것)

`02_ai_architecture.md` 6.4절 + `02_ai_contracts.md` 0.2절 4항. **AI 출력 스키마에는 이 필드들의 자리가
물리적으로 없습니다.** 값이 오면 `additionalProperties: false`로 검증 실패입니다.

| 값 | 계산 위치 | 방법 |
|---|---|---|
| `questions.depth` | #9 SSE 라우트 | `follow_up`이면 현재 질문 `depth + 1`, `next_main`이면 0. 모델 선언값과 다르면 **서버 값 채택 + 경고 로그** |
| `questions.parent_question_id` | #9 | `follow_up`이면 `current_question.question_id`, 그 외 `null` |
| `questions.order_index` | I1 플래너 워커 | 폐기(V1~V7)로 구멍이 나므로 **0부터 재부여** |
| `questions.seed_version` | I1 | 시드 팩 파일에서. AI 출력 아님 |
| 압박 카운터(G1~G6) | #9 | 같은 `parent_question_id` 아래 연속 꼬리질문 수 등. `guards`로 모델에 주입 |
| 종료 판정 | #9 | `01_state_machine.md` 3절 4개 조건 |
| `evaluation_citations.quote_start` / `quote_end` | I2 | `turn.transcript_text.indexOf(quote_text)`. `< 0`이면 그 인용 폐기 |
| `evaluation_citations.citation_index` | I2 | 폐기 후 **0..n-1로 재부여** |
| `evaluation_scores.weight` | I2 | 페르소나 표(`01_rubric.md` 3절)의 **정규화 전 원값**. AI가 보내면 검증 실패 |
| `evaluations.overall_score` | I2 | 아래 9.1절 |
| `evaluations.ai_contract_version` / `provider` / `model_name` | I2 (평가 단계·코치 단계 모두) | 애플리케이션 상수 |

### 9.1 `overall_score` — 인용이 없는 축은 **가중치 합에서 제외** (D1)

```ts
const scored = axes.filter(a => !a.isInsufficientEvidence);   // 곧 score !== null
if (scored.length === 0) {
  overallScore = null;                     // ★ 0으로 나누지 않는다
  evaluationStatus = 'succeeded';          // 실패가 아니라 "점수 없는 리포트"
} else {
  const W = sum(scored.map(a => WEIGHT[persona][a.axis]));            // 제외 축의 weight는 W에 없다
  overallScore = round(sum(scored.map(a => WEIGHT[persona][a.axis] * a.score)) / W, 2);
}
```

- **저장 시 한 번만 계산해 컬럼에 넣습니다.** 조회할 때마다 다시 계산하지 않습니다 —
  같은 리포트가 코드 버전에 따라 다른 숫자를 보이면 안 됩니다.
- **제외된 축도 `evaluation_scores` 행은 그대로 만듭니다**(5행 전제와 `unique (evaluation_id, axis)`).
- 응답의 `scoredAxisCount`가 **몇 개 축이 총점에 반영됐는지**를 알려 줍니다. 5축 중 2축만 채점된 4.5와
  5축 전부 채점된 4.5는 같은 숫자가 아닙니다(`04_data_layer.md` 12.1절).

### 9.2 ⚠️ 인용 오프셋은 **JS UTF-16 기준**입니다 (R3 — 함정)

```
quote_start / quote_end 는 JS String.prototype.indexOf() 가 돌려준 UTF-16 코드 단위 오프셋이다.

■ 허용: 프론트엔드에서 text.slice(quoteStart, quoteEnd) 로 하이라이트    ← JS끼리라 정확히 일치
■ 금지: Postgres substring(transcript_text from quote_start + 1 for quote_end - quote_start)
        Postgres의 문자 함수는 **코드포인트** 단위여서 비-BMP 문자(이모지 등)가 섞이면
        서로게이트 페어 하나를 JS는 2, Postgres는 1로 세어 오프셋이 어긋난다.
        어긋난 substring은 오류를 내지 않고 **조용히 다른 문장을 잘라 낸다.**
```

| 규칙 | 내용 |
|---|---|
| **DB 안에서 오프셋으로 원문을 다시 자르는 쿼리를 만들지 않습니다** | 뷰·함수·리포트 쿼리 어디에도 두지 않습니다 |
| 응답에는 `quoteText`를 **그대로 담아 보냅니다** | 프론트가 오프셋으로 다시 자를 필요가 없게 합니다. 오프셋은 원문 안에서 **위치를 표시**하는 용도로만 씁니다 |
| 길이 검사는 서버에서 `[...str].length`로 | JS `String.length`(UTF-16)와 Postgres `char_length`(코드포인트)의 경계값 불일치(R2)를 없앱니다. **20/160 경계에서만 재현되는 저장 실패**를 미리 막습니다 |

---

## 10. 레이트 리밋 4단 폴백 사다리에서 서버가 맡는 부분

`01_state_machine.md` 4절이 원본입니다. 1·2단계는 브라우저 내장 STT/TTS라 **서버가 할 일이 거의 없고**,
3·4단계가 서버 책임입니다.

| 단계 | 리밋 주체 | 서버가 하는 일 | 상태 전이 |
|---|---|---|---|
| 1 | TTS | 없음(클라이언트 판정). `POST .../events`로 `rate_limit_fallback`(layer:'tts') 기록만 받음 | 없음 |
| 2 | STT | `POST .../modality`로 `current_modality='text'` + `session_events` **한 트랜잭션**(P5) | 없음 |
| **3** | **LLM 일시** | SSE 안에서 **지수 백오프 재시도**(1s→2s→4s, 지터 ±20%). 그동안 `stream_error{retryable:true}`를 보내 UI가 `thinking`을 유지하게 함. **60초 예산 안에서만** | 없음 |
| **4** | **LLM 60초 초과·일일 한도** | `stream_error{retryable:false}` 전송 → `in_progress`→`paused`, `pause_reason='rate_limited'`, **`resumable_after`** 기록 → 스트림 종료 | `in_progress`→`paused` |

### 10.1 429 정규화

프로바이더마다 다른 한도 오류를 **하나의 내부 오류 타입으로 정규화**합니다(`02_ai_contracts.md` 8절).

```ts
type NormalizedAiError =
  | { kind: 'RateLimitError';        retryable: true;  retryAfterSec: number | null }
  | { kind: 'TimeoutError';          retryable: true;  retryAfterSec: null }
  | { kind: 'SchemaValidationError'; retryable: true;  fieldErrorsKo: string[] }
  | { kind: 'CitationValidationError';retryable: true; invalidCitations: unknown[] }
  | { kind: 'OutputPolicyError';     retryable: true;  once: true }
  | { kind: 'AuthError';             retryable: false }      // 키 오류·모델명 오류 — 즉시 실패
  | { kind: 'ContextOverflowError';  retryable: false };
```

| 규칙 | 내용 |
|---|---|
| **판별 기준** | HTTP 429 + 프로바이더별 한도 오류 코드/메시지. `Retry-After` 헤더가 있으면 `retryAfterSec`에 담습니다 |
| **재시도하지 않는 것** | `AuthError`(키 무효·모델명 오타)와 `ContextOverflowError`. **이 둘을 재시도하면 남은 쿼터를 확실히 실패할 호출로 태웁니다** |
| **클라이언트에 나가는 모양** | SSE에서는 `stream_error{ code:'llm_rate_limited', retryable }`, 일반 라우트에서는 **HTTP 429** + `{ error: { code:'rate_limited', details: { retryAfterSec } } }` |
| **기록** | `session_events(event_name='rate_limit_fallback')`, `detail: { step: 1..4, layer, provider, retryAfterSec }` |
| **`resumable_after`** | 4단계에서 `now() + (retryAfterSec ?? 1시간)`. 일일 한도 소진이 의심되면(연속 429 + `Retry-After` 없음) **다음 날 00:00 UTC**를 넣습니다. D7이 `paused` 시한을 7일로 잡은 것이 이 경우를 위한 것입니다 |
| **키 오류를 리밋으로 오해하지 않기** | 401/403은 `AuthError`입니다. 폴백 사다리를 태우면 안 되고 즉시 `failed`(`failure_reason='provider_permanent_error'`)입니다. 원인 구분은 운영 로그에 `provider`/`model_name`과 함께 남깁니다 |

> **⚠️ 위 표의 마지막 행은 `funding_source = 'trial_shared'`(공용 키)에만 해당합니다.**
> 공용 키의 401/403은 **우리 설정 오류**라 즉시 `failed`가 맞지만, **사용자 키의 401/403은 사용자가
> 고칠 수 있는 상태**이므로 `failed`가 아니라 `paused`입니다. 10.2절이 그 분기를 정합니다.

### 10.2 사용자 키 오류 3분류 (D28 — **우리 여력과 분리합니다**)

`02_ai_architecture.md` 4.6절이 원본이고, 상태 전이는 `01_state_machine.md` 4.5절이 원본입니다.
`src/lib/ai/errors.ts`의 **`normalizeProviderError(raw, ctx)`** 가 원시 오류를 세 값 중 하나로 접고,
**상위 계층은 원시 오류를 보지 않습니다.**

| 분류 | 판정 조건 | `pause_reason` | HTTP / SSE | 사용자에게 |
|---|---|---|---|---|
| `transient` | 3단계 백오프(최대 60초) 안에 회복 | **없음 — `paused`로 가지 않습니다** | `stream_error{ retryable:true }` | 아무것도 보이지 않습니다(면접이 계속됩니다) |
| `key_invalid` | 401·403·`API_KEY_INVALID` 계열이 **재시도 1회 후에도 동일** | `byok_key_invalid` | **409 `byok_key_invalid`** / `stream_error{ retryable:false }` | "연결하신 키로 접속할 수 없었어요…" → 키 교체 |
| `key_quota_exhausted` | 429 중 일당·계정 한도 계열, 결제 미활성 거부. **백오프로 회복되지 않음** | `byok_quota_exhausted` | **409 `byok_quota_exhausted`** / `stream_error{ retryable:false }` | "연결하신 키의 사용량이 오늘 한도에 도달했어요…" → Google AI Studio 확인 |

**판정 순서를 지켜야 합니다 — 순서가 바뀌면 멀쩡한 키를 죽은 키로 신고하게 됩니다.**

1. **먼저 `transient`를 배제합니다.** 어떤 오류든 3단계 백오프를 **먼저** 태웁니다. 회복되면 그것으로 끝이고
   사용자에게는 아무 일도 일어나지 않습니다. 이 단계를 건너뛰면 **분당 한도에 순간적으로 부딪힌 멀쩡한 키**가
   `key_quota_exhausted`로 내려갑니다.
2. **`key_invalid`는 재시도 1회 후에 판정합니다.** 일시적 네트워크 오류를 키 문제로 오인해 "키를 확인하세요"라고
   말하면 사용자가 멀쩡한 키를 지우고 다시 발급받습니다.
3. **애매하면 `key_invalid`가 아니라 `key_quota_exhausted`로 접습니다.** 두 오해의 대가가 비대칭입니다 —
   한도 문제를 "키를 확인하세요"로 말하면 사용자가 멀쩡한 키를 파괴하지만, 그 반대는 사용자가 Google AI Studio에서
   진짜 원인을 보게 됩니다. **회복 가능한 오해 쪽으로 틀립니다.**

**응답에 절대 포함되지 않는 것:** 프로바이더 오류 메시지 원문, 요청 헤더, 키 평문·해시.
정규화 결과는 `{ kind, retryable, keyFingerprint, sessionId }`뿐이고, `details`에 실을 수 있는 것은
**`{ keyLast4 }`** 하나입니다. 사용자에게 보이는 문구는 `06_ui_plan.md`가 `code`로 조회하는 고정 문안입니다.

| 구분 | 코드 | 원인 주체 | 나오는 재원 |
|---|---|---|---|
| 우리 공용 여력이 없음 (**부딪히기 전**) | **503 `capacity_unavailable`** | 우리 | `trial_shared`만 |
| 프로바이더 한도에 **부딪힌 뒤** | 429 `rate_limited` | 우리 | `trial_shared`만 (**예외 경로** — 나오면 예약 모델이 틀렸다는 신호, `02_ai_architecture.md` 8.3.9절) |
| 사용자 키가 유효하지 않음 | **409 `byok_key_invalid`** | 사용자 | `byok`만 |
| 사용자 키의 한도 소진 | **409 `byok_quota_exhausted`** | 사용자 | `byok`만 |

- **`byok_quota_exhausted`에는 재개 가능 시각을 넣지 않습니다.** `resumable_after`를 채우지 않고
  `details.availableAtIso`도 두지 않습니다 — 우리 원장에는 사용자 계정의 리셋 시각이 없고,
  **없는 정보를 지어내면 그 시각에 다시 온 사용자가 또 막힙니다**(`01_state_machine.md` 4.5절 규칙 2).
- **1·2단계(TTS·STT 텍스트화)는 그대로 탑니다.** STT/TTS는 사용자 키와 무관한 경로이므로
  음성이 막혀도 텍스트로 면접이 계속됩니다.
- **완주율(지표 1) 집계에서 `byok_key_invalid`·`byok_quota_exhausted`는 분리합니다.** 사용자 계정 사정으로
  끊긴 세션을 "압박을 못 견디고 이탈"로 세면 제품 지표가 틀립니다.

---

## 11. 런타임·`maxDuration` 선택

### 11.1 결론: **전 라우트 `runtime = 'nodejs'`**

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';   // 인증 응답이 캐시되면 남의 데이터가 보인다
```

| 근거 | 내용 |
|---|---|
| **PDF·DOCX 추출**(D 결정, `01_product_spec.md` 6절) | 파서가 Node API(Buffer·스트림)에 의존합니다. Edge에서는 동작하지 않습니다 |
| **`admin.ts`와 `server-only`** | service_role 클라이언트를 Edge에 두면 번들 경계가 넓어져 실수로 클라이언트 번들에 섞일 위험이 커집니다 |
| **SSE 스트리밍은 Node에서도 문제없음** | Route Handler가 `ReadableStream`을 반환하면 됩니다. Edge의 이점은 TTFB 수십 ms인데, 우리 임계 경로는 **LLM TTFT 1,200ms**가 지배하므로 유의미하지 않습니다 |
| **런타임 1개** | 두 런타임을 섞으면 환경변수 접근·타임아웃·로그가 각각 달라집니다. MVP에서 그 복잡도를 살 이유가 없습니다 |

**Edge를 쓰지 않는 대가:** 콜드 스타트가 조금 더 깁니다. 면접관 라우트는 세션 중 반복 호출되어
따뜻하게 유지되므로 실질 영향이 작다고 판단합니다. Phase 3에서 TTFB를 실측해 재검토합니다.

### 11.2 `maxDuration` (**2026-09-10 측정 반영 — Hobby 상한 300초**)

**플랜 상한은 300초입니다**(Hobby 기본 300 / 최대 300, `05_deploy.md` 3절, 확인일 2026-09-10).
초안의 60초 가정은 틀렸고, 아래 표는 실제 상한 기준으로 다시 잡은 값입니다.

| 라우트 | `maxDuration` | 근거 |
|---|---|---|
| #9 SSE `.../turns` | **90** | `02_ai_contracts.md` 8절의 **"면접관 60초 예산"은 UX 예산이지 플랫폼 상한이 아닙니다.** 그 예산을 60초로 유지한 채, `<<<META>>>` 커밋·turn 저장 같은 **스트림 종료 후 꼬리 작업**과 abort 정리에 30초 여유를 둡니다. 상한에 잘리면 답변은 화면에 흘렀는데 DB에 없는 상태가 됩니다 |
| #26 `/api/documents/[id]/extract` | **120** | 10MB PDF 최악 ~25s + Storage 다운로드. D26이 "실측 30초 초과 시 비동기로 옮긴다"고 정해 둔 라우트이므로, **관측 구간을 넓게 잡아 실제 분포를 보고 판단**합니다 |
| I1 `jobs/plan` | **120** | 플래너 8~18s + 재호출 1회(V8) + 스냅샷 커밋. 내부 워커라 UX 지연이 아닙니다 |
| **I2 `jobs/evaluate`** | **240** | **평가자 25~50s + 코치 20~40s를 한 호출에서 순차 실행**(D31, 6.2절). 재시도 백오프까지 최악 ~200s. **소프트 데드라인 210s**(11.2.1절) |
| ~~I3 `jobs/coach`~~ | — | **삭제(D31).** 코치는 I2 안에서 돕니다 |
| C1 `cron/daily` | **240** | 배치 200건 단위. 시간이 길수록 하루치 잔여가 줄고, 못 끝내도 다음 날 이어서 (멱등) |
| #31 `DELETE /api/account` | **120** | Storage 목록·일괄 삭제. 세션·문서가 많은 계정이 최악입니다 |
| **#38 PUT `/api/account/api-key` · #40 verify** | **15** | 프로바이더 검증 호출 1회(~1.5s) + Vault 쓰기. 상한에 여유가 큽니다 |
| **#6 `prepare`** | **15** | `byok`일 때 키 검증 1회가 붙지만(~1.5s) 플래너는 **기다리지 않고 체이닝**합니다 |
| 그 외 전부 (**#33 cancel · #34 문서 단건 · #35 abandon-preparation · #36 capacity · #37/#39 키 · #41 동의 포함**) | **15** | DB 왕복 1~3회. 15초를 넘으면 그건 버그이지 지연이 아닙니다 |

> **#15 `complete`도 15입니다.** 평가 등록(6.2절)은 트랜잭션 1회 + `waitUntil`로 띄우는 `fetch` 1회이고,
> **워커의 응답을 기다리지 않으므로** 평가자의 25~50초가 이 라우트의 실행 시간에 들어오지 않습니다.
> 기다리는 순간 이 설계 전체가 무너집니다.

#### 11.2.1 **300초를 다 쓰지 않는 이유** — 여유는 낭비가 아니라 실패 경로의 예산입니다

가장 긴 I2에도 **240초만 줍니다.** 상한과의 차이 60초를 남기는 근거는 셋입니다.

| # | 근거 |
|---|---|
| 1 | **상한에 걸린 함수는 실패를 기록할 시간이 없습니다.** 플랫폼이 300초에서 실행을 끊으면 `catch`도 `finally`도 돌지 않습니다. `evaluations.status`는 `running`, 세션은 `evaluating`에 남고 **여력 예약도 반납되지 않습니다**(4.7.3절). 즉 상한 초과는 "느린 실패"가 아니라 **여력이 새는 실패**입니다. 240에서 끊기면 남은 60초가 전부 우리 것이라 상태를 정리할 수 있습니다 |
| 2 | **소프트 데드라인이 하드 상한보다 먼저 와야 합니다.** I2는 시작 시각을 기록하고, **210초를 넘긴 시점에는 새 단계(코치)나 새 재시도를 시작하지 않고** 함수를 정상 종료합니다. `status='running'`으로 남은 평가는 게으른 워치독이 집습니다(6.5절). 이 규칙이 성립하려면 `maxDuration`이 소프트 데드라인보다 확실히 커야 합니다 |
| 3 | **추정치는 추정치입니다.** 25~50s·20~40s는 `02_ai_architecture.md` 8.1절의 **미측정 추정**이고, 프로바이더 지연은 우리가 통제하지 못합니다. 상한을 실측 최악에 딱 맞추면 추정이 20%만 빗나가도 1번 상황이 됩니다 |

> **`maxDuration`을 올리는 데 드는 비용은 0이 아닙니다.** Hobby의 과금 단위는 실행 시간이며,
> 상한을 크게 잡을수록 **폭주한 함수가 태울 수 있는 시간**도 커집니다. 상한은 "여기까지는 정상"이
> 아니라 **"여기를 넘으면 버그"** 라는 선언이므로, 라우트마다 근거 있는 값을 따로 줍니다.
> 15초짜리 DB 라우트를 300으로 올리지 않는 이유도 같습니다 — 15초를 넘으면 그건 지연이 아니라 버그입니다.

### 11.3 확인된 300초 아래에서 남는 위험 (`05_deploy.md` 3절 — 확인일 2026-09-10)

**초안이 걱정하던 "상한이 60초보다 낮을 가능성"은 해소됐습니다.** Hobby는 300초입니다.
그 대신 남는 위험은 **한 호출 안에서 두 단계를 돌리게 되면서 최악 경로가 길어졌다**는 점입니다.

| 위험 | 현재 판단 |
|---|---|
| 평가 3회 재시도 + 코치까지 겹쳐 240s에 근접 | 소프트 데드라인 210s가 먼저 잡습니다(11.2.1절). **워치독이 이어받으므로 사용자 관점에서는 지연이지 실패가 아닙니다** |
| 프로바이더 지연이 추정치를 크게 벗어남 | 아래 조정 순서를 그대로 유지합니다 |

**조정 순서는 바뀌지 않았습니다** (`02_ai_architecture.md` 4.2절 지시 그대로):

```
1) [2026-09-11 D34로 삭제] "Evaluator 모델을 pro → flash 로 내린다"는 더 이상 선택지가 아니다.
   무료 티어 실측에서 pro 계열은 RPD 0, flash 계열은 RPD 20이라 둘 다 쓸 수 없고,
   5개 역할 전부가 이미 gemini-3.1-flash-lite 하나를 쓴다(02_ai_architecture.md 4.2·8.3.7절).
   모델을 내리는 레버 자리는 비어 있다 — 현재 레버는 같은 문서 8.3.9절 표에 있다.
2) 넘으면 평가를 축 단위로 쪼갠다 (5축 = 5호출).
   대가: 호출 수가 5배로 늘어 RPD를 태운다. 인용 검증은 축 단위라 쪼개도 정합성은 유지된다
3) 대화 전문을 넣는 방침(5.3절)은 마지막까지 건드리지 않는다 — 요약본으로 채점하면 인용 오프셋이
   전부 어긋나 핵심 가치 2번이 무너진다
```

> **300초가 확인됐다고 해서 남은 2번 레버가 필요 없어진 것은 아닙니다.** 그 레버가 방어하는 진짜 제약은
> 실행 시간이 아니라 **RPD와 체험 정원**입니다(4.7절). 실행 상한은 그중 한 증상이었을 뿐입니다.

**사용자 요청 라우트는 여유가 큽니다.** 가장 느린 #26(문서 추출)도 최악 ~25s로 120s 상한의 20% 수준이고,
넘더라도 `extraction_status='failed'` + 텍스트 직접 입력 안내라는 **이미 정의된 실패 경로**로 떨어집니다.

---

## 12. 타입 정의 (프론트 타입의 원본)

```ts
// ── 값 유니온 — 전부 영어 문자열 그대로. 번역·camelCase 변환 금지 ──────────────
type SessionStatus =
  | 'created' | 'configuring' | 'ready' | 'in_progress' | 'paused'
  | 'completed' | 'evaluating' | 'evaluated' | 'failed' | 'abandoned' | 'canceled';
// SSE `utterance_done.sessionStatus` 전용 부분집합. 의도적으로 2값입니다(QA G8).
// 스트림은 in_progress에서만 시작하고, 끝난 뒤 관측 가능한 상태는 계속/종료 둘뿐입니다.
// paused·failed는 stream_error로 끝나 utterance_done이 나가지 않고, canceled는 스트림 밖 요청,
// evaluating 이후는 completed 전이의 서버 부작용입니다. 근거: 01_state_machine.md 2절·3절,
// 원본 정의: 02_ai_contracts.md 3.5절.
type StreamSessionStatus = Extract<SessionStatus, 'in_progress' | 'completed'>;
// PauseReason은 2026-09-10 D28로 3개 → 5개가 됐습니다. 재개 패널이 5종을 전부 분기해야 합니다.
type PauseReason  = 'user_requested' | 'rate_limited' | 'connection_lost'
                  | 'byok_key_invalid' | 'byok_quota_exhausted';   // ★ 신규 2종 — funding_source='byok'에서만
type FundingSource = 'trial_shared' | 'byok';                      // ★ 신규 (D28)
type KeyStatus     = 'none' | 'connected' | 'invalid';             // 'none' = 행이 없는 상태
type TrialStatus   = 'available' | 'consumed';
type Modality     = 'voice' | 'text';
type Persona      = 'deep_pressure' | 'technical_probe';
type JobRole      = 'pm' | 'pd' | 'security' | 'ai' | 'engineer';
type Axis = 'job_knowledge' | 'logical_consistency' | 'evidence_specificity' | 'structure' | 'communication';
type QuestionKind = 'main' | 'follow_up';
type TurnRole     = 'interviewer' | 'candidate';
type InterviewerAction = 'follow_up' | 'next_main' | 'neutral_transition' | 'comfort' | 'wrap_up';
type ReasonCode   = 'transcription_error' | 'misinterpreted' | 'score_too_low' | 'other';
type ExtractionStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'not_required';
type DocType      = 'resume' | 'job_description';
type SourceType   = 'file' | 'text';
type ClientEventName = 'score_card_viewed' | 'report_viewed' | 'modality_switched' | 'voice_precheck' | 'rate_limit_fallback';

// ── 세션 ──────────────────────────────────────────────────────────────────
type Session = {
  id: string;
  status: SessionStatus;
  fundingSource: FundingSource;    // ★ 신규 (D28). #3에서 확정되고 이후 변경 불가. null이 될 수 없다
  jobRole: JobRole | null;
  persona: Persona | null;
  modality: Modality;
  currentModality: Modality;
  resumeDocumentId: string | null;
  jdDocumentId: string | null;
  hasResumeSnapshot: boolean;      // ★ 스냅샷 본문은 응답에 담지 않는다 (수십 KB × 2, 화면에 쓰이지 않음)
  hasJdSnapshot: boolean;
  mainQuestionBudget: number;
  maxFollowUpDepth: number;
  maxTurns: number;
  maxDurationMin: number;
  pauseReason: PauseReason | null;
  resumableAfter: string | null;   // ISO8601
  failureReason: string | null;    // 12.1절 값 목록
  startedAt: string | null;
  endedAt: string | null;
  pausedAt: string | null;
  reportFirstViewedAt: string | null;
  sourceSessionId: string | null;
  createdAt: string;
  updatedAt: string;
  // ── 서버 파생 필드 (DB 컬럼 아님) ──
  preparation: PreparationState;        // 6번 라우트가 진행 중인지 (12.2절)
  answeredMainQuestionCount: number;    // 종료·평가 가능 최소선 판정을 UI가 보여줄 수 있게
  turnCount: number;
};

type PreparationState = {
  state: 'idle' | 'running' | 'failed';
  errorCode: string | null;
  updatedAt: string | null;
};

type SessionSummary = {          // 목록·대시보드 전용. Session의 부분집합 + 점수
  id: string;
  status: SessionStatus;
  jobRole: JobRole | null;
  persona: Persona | null;
  modality: Modality;
  overallScore: number | null;   // evaluations.overall_score. 없으면 null
  scoredAxisCount: number | null;
  isReportUnread: boolean;       // status='evaluated' && reportFirstViewedAt === null
  createdAt: string;
  endedAt: string | null;
};

type SessionConfigPatch = {      // #5 요청. 전부 선택 — 부분 저장이 정상 경로다
  jobRole?: JobRole;
  persona?: Persona;
  modality?: Modality;
  resumeDocumentId?: string | null;
  jdDocumentId?: string | null;
};

// ── 질문·턴 ────────────────────────────────────────────────────────────────
type Question = {
  id: string;
  parentQuestionId: string | null;
  depth: number;
  orderIndex: number;
  questionKind: QuestionKind;
  questionText: string;
  targetAxis: Axis | null;
  sourceSpan: string | null;
  archetypeId: string | null;
  seedVersion: string | null;
  probeHints: string[] | null;   // jsonb 문자열 배열. 오브젝트 배열이 아니다
  askedAt: string | null;
  createdAt: string;
};

type Turn = {
  id: string;
  questionId: string | null;
  seq: number;
  role: TurnRole;
  transcriptText: string;        // 정본
  transcriptRaw: string | null;  // 정정 시 STT 원문
  isCorrected: boolean;
  modality: Modality;
  sttConfidence: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

// ── 평가 (최종 결과 타입) ──────────────────────────────────────────────────
type Evaluation = {
  id: string;
  sessionId: string;
  status: 'running' | 'succeeded' | 'failed';
  overallScore: number | null;         // 1.00~5.00. 모든 축이 근거 부족이면 null
  scoredAxisCount: number;             // 총점에 반영된 축 수 (0~5). UI는 총점 옆에 이 값을 함께 보여준다
  rubricVersion: string;
  summary: string | null;              // null이면 "코치 미완료" ★ 판정 기준은 이 필드 하나다
  improvements: CoachImprovement[] | null;
  coachPayload: CoachPayload | null;
  modelName: string | null;
  provider: string | null;
  aiContractVersion: string | null;
  attemptCount: number;                // 평가자 시도만 (최초 포함, 최대 3)
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  axes: EvaluationAxis[];              // 언제나 정확히 5개
  // ── 사용자가 이 리포트에 이미 남긴 것 (D20 — 별도 조회 엔드포인트를 늘리지 않는다) ──
  myFeedback: ReportFeedback | null;   // #20 PUT .../feedback 으로 남긴 것. 없으면 null
  myDisputes: ScoreDispute[];          // #21 POST .../disputes 로 남긴 것. 없으면 [] (★ null이 아니다)
};

type EvaluationAxis = {
  id: string;                          // evaluation_scores.id — 이의 제기의 scoreId
  axis: Axis;
  score: number | null;                // 1~5 정수. 근거 부족이면 null
  isInsufficientEvidence: boolean;
  weight: number;                      // 정규화 전 페르소나 원값
  rationale: string;
  improvement: string | null;          // ★ null 가능. 코치 실패 시 UI는 이 축의 개선 영역을 감춘다
  citations: Citation[];               // 채점된 축은 1~3건, 근거 부족 축은 0건
};

type Citation = {
  id: string;                          // 이의 제기의 citationId
  turnId: string;
  quoteText: string;                   // 20~160자. 하이라이트는 이 문자열을 쓴다
  quoteStart: number;                  // ⚠️ JS UTF-16 오프셋 (9.2절)
  quoteEnd: number;
  comment: string | null;
  citationIndex: number;               // 0~2, 축 안에서 연속
};

// jsonb 본문은 AI 계약의 필드명을 유지한다 (2.1절 E3)
type CoachImprovement = { priority: 1|2|3; title: string; action: string; related_axis: Axis };
type CoachPayload = {
  model_answers: { question_id: string; turn_id: string | null; why_weak: string; model_answer: string }[];
  next_actions: { order: 1|2|3; action: string; expected_effect: string }[];
};

// ── 문서·피드백·계정 ───────────────────────────────────────────────────────
type Document = {
  id: string;
  docType: DocType;
  sourceType: SourceType;
  title: string;
  storagePath: string | null;
  mimeType: string | null;
  byteSize: number | null;
  extractedText: string | null;
  extractionStatus: ExtractionStatus;
  extractionError: string | null;
  isEditedByUser: boolean;
  createdAt: string;
  updatedAt: string;
};

type DocumentDetail = Document & {   // #34 GET /api/documents/[documentId] 전용 (D21)
  linkedSessionCount: number;        // 이 문서를 resume_document_id 또는 jd_document_id로 참조하는 세션 수
  configuringSessionCount: number;   // 그중 created·configuring 상태(= 아직 스냅샷이 없는) 세션 수
};

type DocumentCreate =
  | { docType: DocType; sourceType: 'file'; title: string; documentId: string; storagePath: string; mimeType: string; byteSize: number }
  | { docType: DocType; sourceType: 'text'; title: string; extractedText: string };

type ReportFeedback = { id: string; sessionId: string; isHelpful: boolean; comment: string | null; createdAt: string; updatedAt: string };
type ScoreDispute  = { id: string; scoreId: string; citationId: string | null; reasonCode: ReasonCode; comment: string | null; createdAt: string };
type Profile      = { id: string; displayName: string | null; defaultJobRole: JobRole | null; email: string; createdAt: string };
type AccountStats = { sessionCount: number; documentCount: number; storageBytes: number };

// ── 여력·재원 (D27·D28·D29) ────────────────────────────────────────────────
// #36 GET /api/capacity → { capacity: Capacity }
type Capacity = {
  canStartSession: boolean;             // keyStatus==='connected'면 여력과 무관하게 항상 true
  keyStatus: KeyStatus;
  trialStatus: TrialStatus;
  nextFundingSource: FundingSource | null;  // 지금 세션을 만들면 어느 재원이 되는가. 못 만들면 null
  requiresTrialConsent: boolean;        // 다음 세션이 체험이고 "현재" 문구 버전 동의가 없으면 true
  consentVersion: string;               // 현재 문구 버전. #41 요청에 그대로 되돌려 보낸다
  availableAtIso: string | null;        // 여력 소진으로 막혔을 때만. 체험 소진이면 null (기다려도 안 풀린다)
};
// ★ 금지: limitCalls / heldCalls / available / 버킷별 잔여량 — 어느 것도 이 타입에 없고 앞으로도 없다

// #37~#40 → { apiKey: ApiKeyStatus }
type ApiKeyStatus = {
  keyStatus: KeyStatus;                 // 'none'이면 아래가 전부 null
  keyLast4: string | null;              // 정확히 4자. 화면에 쓸 수 있는 유일한 키 값
  provider: 'google' | null;
  lastVerifiedAt: string | null;
  lastFailureCode: 'auth_rejected' | 'quota_exhausted' | 'unknown' | null;
  lastFailureAt: string | null;
};
// ★ 이 타입에 키 원문 필드는 없고, 앞으로도 추가하지 않는다 (4.8.1절 강제 1).
//   키 원문이 존재하는 방향은 #38 요청 body 하나뿐이다.

// #41 POST /api/trial-consent → { consent: TrialConsent }
type TrialConsent = {
  id: string;
  consentVersion: string;
  grantedAt: string;
  sessionId: string | null;
};
// consentTextSha256은 서버가 계산해 저장하며 응답에 싣지 않는다 (화면이 쓸 데가 없다)
```

### 12.1 `failureReason` 값 목록

`interview_sessions.failure_reason`에는 DB CHECK가 없습니다(`04_data_layer.md` 6.4절 — CHECK를 걸면
새 사유가 CHECK를 어겨 **세션이 `failed`로도 못 넘어가 `evaluating`에 갇히는** 사고가 납니다).
대신 **이 목록이 계약**이며, 값을 늘릴 때 이 표에 함께 추가합니다.

```
document_extraction_failed     이력서·JD 텍스트 추출 실패 후 사용자가 재시도를 포기  (configuring → failed)
evaluation_enqueue_failed      평가 시작 자체가 실패, 재시도 3회 소진               (completed → failed)
evaluation_failed              평가 재시도 3회 소진 또는 10분 워치독 타임아웃        (evaluating → failed)
provider_permanent_error       AuthError·모델명 오류 등 복구 불가 프로바이더 오류    (in_progress → failed)
context_corrupted              세션 컨텍스트 손상(질문 트리 불일치 등)              (in_progress → failed)
```

UI는 이 값들을 **한국어 문구로 매핑해 보여주되, 값 자체를 번역해 서버로 되돌려 보내지 않습니다.**

### 12.2 `preparation` 파생 필드의 근거

`01_state_machine.md`에는 `configuring`과 `ready` 사이에 중간 상태가 없습니다. 그런데 플래너는 8~20초가
걸리므로, 그동안 화면은 "준비 중"을 보여야 합니다. **새 상태 값이나 새 컬럼을 만들지 않고**
`session_events`의 최신 플래너 이벤트에서 파생합니다.

```
planner_started   → preparation.state = 'running'
planner_succeeded → status가 이미 'ready'가 되므로 preparation은 'idle'
planner_failed    → preparation.state = 'failed', errorCode = detail.code
```

- **스키마 변경이 필요 없습니다**(`supabase-engineer`에게 요청할 것 없음). `session_events`는 이미
  `event_name` + `detail jsonb`를 갖고 있고 `idx_session_events_session_time`으로 세션을 좁힐 수 있습니다.
- 플래너 실패는 **상태 전이가 아닙니다.** 세션은 `configuring`에 남고 사용자는 "다시 준비"를 누르면 됩니다.
  `configuring → failed`는 **문서 추출 실패 경로에만** 존재하며(전이 표 95행), 그 유일한 진입점은
  **#35 `POST .../abandon-preparation`** 입니다(4.4절).

### 12.3 `myFeedback` / `myDisputes` — 왜 평가 응답에 실려 오는가 (D20)

`PUT .../feedback`(#20)과 `POST .../disputes`(#21)만 있고 **조회 경로가 없어서**, 새로고침하면
D4가 약속한 "접수되었습니다" 확인이 사라지고 사용자가 같은 이의를 다시 제기합니다.
**지표 5(이의 제기)가 중복으로 오염됩니다.**

엔드포인트를 늘리는 대신 `GET .../evaluation`(#17) 응답에 실어 보냅니다. 리포트 화면은 이미 이 하나를
호출하므로 **왕복이 늘지 않고**, "리포트를 여는 것"과 "내가 이 리포트에 무엇을 남겼는지"는 화면에서
분리될 이유가 없습니다.

| 규칙 | 내용 |
|---|---|
| 범위 | **호출한 사용자 본인의 것만.** 이름이 `my*`인 이유입니다. RLS와 소유권 검사가 이미 그것만 읽게 합니다 |
| 빈 값 | `myFeedback`은 `null`, `myDisputes`는 **`[]`**(빈 배열). `null`을 돌려주지 않습니다 — `.map()` 앞에 방어 코드를 강요하게 됩니다 |
| 연결 키 | `myDisputes[].scoreId` ↔ `EvaluationAxis.id`, `myDisputes[].citationId` ↔ `Citation.id`. 프론트는 이 키로 축 카드·인용에 "이의 접수됨" 배지를 답니다 |
| 중복 방지 | 같은 `scoreId`에 이미 이의가 있으면 UI가 재제출 버튼을 잠급니다. **서버도 #21에서 같은 `(scoreId, citationId)` 조합을 409로 막습니다** |
| `evaluation`이 `null`일 때 | 필드 자체가 없습니다(`Evaluation` 안에 있으므로). 평가가 없으면 남길 피드백도 없습니다 |
| 정렬 | `myDisputes`는 `createdAt` 오름차순 |

### 12.4 `linkedSessionCount` — 무엇을 세는 값인가 (D21)

`DELETE` 응답에만 건수가 있어서 **누르기 전에는 경고할 수 없었습니다.** 확인 다이얼로그가 영향 범위를
모른 채 뜨는 셈입니다. #34가 그 값을 미리 줍니다.

- `linkedSessionCount` = 이 문서를 `resume_document_id` 또는 `jd_document_id`로 참조하는 **세션 수**
  (`canceled`·`abandoned` 포함. "이 문서가 쓰인 이력" 전부를 셉니다).
- **의미는 "리포트가 손상될 세션 수"가 아니라 "출처 표시가 사라질 세션 수"입니다.**
  D6(스냅샷)으로 `resume_text_snapshot` / `jd_text_snapshot`이 세션 안에 남으므로,
  문서를 지워도 **과거 리포트·전사·질문 근거는 온전합니다**(`04_data_layer.md` 9.2절).
  잃는 것은 원본 파일 열람 · 재추출 · 지표 3의 "같은 이력서" 묶음뿐입니다.
  **"과거 리포트가 손상된다"는 취지의 경고 문구는 사실이 아니므로 쓰지 마세요.**
- `configuringSessionCount` = 그중 `created` / `configuring` 세션 수. **이쪽만 실질 피해**입니다 —
  아직 스냅샷을 복사하지 않았으므로 문서가 사라지면 `configuring → ready` 가드를 통과하지 못하고,
  사용자가 설정 화면에서 다른 문서를 다시 골라야 합니다.
- 두 값은 **#28 `DELETE` 응답의 `affectedSessionCount` / `configuringSessionCount`와 같은 수**이며,
  차이는 **삭제 전에 아는가 후에 아는가**뿐입니다. 확인 다이얼로그는 #34를 씁니다.

---

## 13. 오류 응답

```jsonc
{ "error": { "code": "invalid_transition", "message": "지금 상태에서는 할 수 없는 동작입니다.",
             "details": { "from": "evaluated", "to": "evaluating" } } }
```

| HTTP | `code` | 언제 |
|---|---|---|
| 400 | `validation_failed` | 요청 body 스키마 위반. `details.fields`에 필드별 사유(한국어) |
| 401 | `unauthenticated` | 세션 없음·만료 |
| 403 | `forbidden` | 내부·크론 시크릿 불일치 |
| 404 | `not_found` | 리소스 없음 **또는 남의 리소스**(구분하지 않음 — 7.3절) |
| **409** | **`invalid_transition`** | **전이 표에 없는 조합**(`01_state_machine.md` 2절). `details: { from, to }` |
| 409 | `turn_seq_conflict` | `answerSeq` 중복. `details: { currentSeq }` |
| 409 | `extraction_in_progress` | `extraction_status='running'`인 문서에 추출 재요청 |
| 409 | `guard_failed` | 전이는 맞으나 가드 미충족(예: 추출 미완료 상태로 `prepare`). `details.guard` |
| **409** | **`trial_consent_required`** | **D29.** 체험 세션인데 **현재 문구 버전**의 동의 기록이 없는 상태로 #6 `prepare` 호출. `details: { requiredConsentVersion }`. **전이하지 않고 세션은 `configuring`에 남습니다**(4.9.2절) |
| **409** | **`consent_version_stale`** | **D29.** #41이 보낸 `consentVersion`이 현재 버전과 다름(옛 클라이언트 번들). `details: { currentVersion }`. 프론트는 새로고침 후 다시 띄웁니다 |
| **409** | **`trial_reservation_exists`** | **D30.** 체험 사용자가 이미 `held` 예약을 가진 채 다른 세션에서 #6 `prepare` 호출. `details: { existingSessionId }`. **전이하지 않고 세션은 `configuring`에 남습니다**(4.7.6절). **`funding_source='byok'`에서는 절대 나오지 않습니다** |
| **409** | **`byok_key_invalid`** | **D28.** 사용자 키가 인증 거절(재시도 1회 후 판정). `details: { keyLast4 }`. #6에서는 전이하지 않고, 면접 중이면 `paused(byok_key_invalid)`(10.2절) |
| **409** | **`byok_quota_exhausted`** | **D28.** 사용자 키가 계정 한도 소진(백오프로 회복되지 않음). `details: { keyLast4 }`. **재개 가능 시각을 넣지 않습니다** — 우리는 그 시각을 모릅니다 |
| 413 | `payload_too_large` | 본문 상한 초과(#9는 64KB, 그 외 1MB) |
| 415 | `unsupported_media_type` | #9에 `multipart/form-data`·`audio/*` (P4) |
| 429 | `rate_limited` | 프로바이더 한도. `details: { retryAfterSec }` + `Retry-After` 헤더 |
| 500 | `internal_error` | 그 외. `message`는 일반 문구, 상세는 서버 로그로만 |
| 503 | `provider_unavailable` | 프로바이더 영구 오류. 재시도 안내 없음 |
| **503** | **`capacity_unavailable`** | **D27.** 오늘 여력이 없어 체험 세션을 시작·준비할 수 없음(#3·#6·#16·#18). `Retry-After` 헤더 동반. **`funding_source='byok'`에서는 절대 나오지 않습니다** |

```jsonc
// 503 capacity_unavailable — 429 rate_limited와 반드시 구분해 주세요
{ "error": { "code": "capacity_unavailable",
             "message": "지금은 새 면접을 시작할 수 없습니다.",
             "details": { "availableAtIso": "2026-09-11T07:00:00.000Z", "retryAfterSec": 33120 } } }
```

```jsonc
// 409 trial_reservation_exists — D30. existingSessionId는 항상 채워집니다(null이 아닙니다)
{ "error": { "code": "trial_reservation_exists",
             "message": "준비 중인 면접이 이미 있어요. 그 면접을 이어서 진행하거나 취소한 뒤 다시 시도해 주세요.",
             "details": { "existingSessionId": "b2f1c8e0-3a44-4f9d-9c21-5f0e7d8a1b23" } } }
```

- **`trial_reservation_exists`를 503 `capacity_unavailable`과 섞지 마세요.** 여력이 남아 있어도 나오고,
  `Retry-After`도 `availableAtIso`도 없습니다. **사용자가 지금 할 수 있는 행동(이어서 하기 / 취소하기)이
  있는 유일한 예약 계열 오류**이므로 "내일 오세요" 계열 문구를 붙이면 안 됩니다.

- **429는 프로바이더 한도에 *부딪힌 뒤*의 사후 신호, 503은 우리가 *부딪히기 전에* 막은 사전 신호입니다.**
  프론트 처리가 다릅니다 — 429는 "잠시 뒤 자동 재시도", 503은 **"키를 연결하면 지금 시작할 수 있어요" 화면**입니다.
- **체험 소진으로 막힌 경우 `availableAtIso`·`retryAfterSec`는 `null`입니다**(기다려도 풀리지 않습니다).
  `Retry-After` 헤더도 이때는 보내지 않습니다. 프론트는 `null`을 "내일 오세요"로 렌더하면 안 됩니다.
- **`details`에 버킷 이름·잔여량·한도 수치를 넣지 않습니다.** 여력 부족 화면의 금칙어 목록
  (`02_ai_architecture.md` 13.6.3절)이 응답 페이로드에도 그대로 적용됩니다.

**`invalid_transition`이 정상 동작인 경우 — 프론트가 오류로 취급하면 안 됩니다**

| 호출 | 언제 409인가 | 프론트가 할 일 |
|---|---|---|
| #16 `POST .../evaluate` | 세션이 `completed`·`evaluating`·`evaluated`일 때 (D18: 서버가 이미 등록했습니다) | **애초에 호출하지 않습니다.** 재시도 버튼은 `status === 'failed'` + `failureReason`이 평가 계열일 때만 그립니다 |
| #33 `POST .../cancel` | 세션이 `completed`·`evaluating`·`evaluated`·`canceled`일 때 | 취소 버튼을 그 상태에서 노출하지 않습니다. 그 세션은 삭제(#23) 대상입니다 |
| #35 `POST .../abandon-preparation` | 세션이 `configuring`이 아닐 때 / 추출이 실패하지 않았을 때(`guard_failed`) | 추출 실패 배너 안에서만 노출합니다 |

**모든 전이 시도는 라우트 진입 시 전이 표를 검사하고, 없는 조합이면 409입니다**(`01_state_machine.md` 124행).
전이 표는 `src/lib/session/transitions.ts`에 **표 그대로** 옮기고, 코드가 표의 유일한 사본이 되게 합니다.

---

## 14. 팀 전달 사항

| 대상 | 내용 |
|---|---|
| `shadcn-ui-engineer` | **1절 응답 래핑 규칙과 12절 타입이 훅 타입의 원본입니다.** 특히 (a) 최상위 배열은 어느 엔드포인트에도 없습니다, (b) `EvaluationJobAccepted`와 `Evaluation`은 **다른 타입**이며 즉시 응답에 `axes`가 없습니다, (c) **Realtime 페이로드는 snake_case이므로 값을 렌더링하지 말고 재조회 트리거로만 쓰세요**(2.1절 E1), (d) `EvaluationAxis.improvement`는 `null`일 수 있고 "코치 미완료" 판정은 `evaluation.summary === null` 하나입니다, (e) 인용 하이라이트는 `quoteText` 문자열로 하고 오프셋은 JS `slice`에서만 쓰세요 |
| `shadcn-ui-engineer` | SSE 응답에 **`res.json()`을 호출하지 마세요**(#9). 그리고 스트림이 끊기면 재요청이 아니라 **#10으로 재동기화**입니다(5.5절) |
| `voice-pipeline-engineer` | **P1 회신: STT/TTS 토큰 발급 라우트를 만들지 않습니다.** 브라우저 내장 API를 쓰므로 인증할 프로바이더가 없다는 3.5절 판단을 그대로 수용합니다. P3(`PATCH .../turns/[turnId]`) = #11, P4(multipart 거부) = 5.1절, P5(모달리티 한 트랜잭션) = #12, P6(프리워밍 LLM 미호출) = #32로 각각 반영했습니다. **P2(보류 버퍼)는 M8을 따릅니다 — 7.2절 표의 "접두사이면 버린다"와 반대이니 9절 불일치 #1을 확인해 주세요** |
| `qa-inspector` | 대조 기준선: (1) 4절 표의 "대응 훅" 열 ↔ 실제 훅의 언랩 코드, (2) 8절 admin 라우트 표 ↔ 실제 `admin.ts` import 지점, (3) 13절 409 목록 ↔ `transitions.ts`가 전이 표와 문자 단위로 같은지, (4) SSE `utterance_chunk.text`에 `<<<`가 없는지, (5) **`quote_start`를 Postgres 문자 함수에 넣는 코드가 없는지 전역 grep**, (6) `admin.ts`가 클라이언트 번들에 들어가지 않는지 |
| `ai-interview-architect` | 9절이 "서버가 계산하는 값" 목록이며 AI 출력 스키마에 자리가 없어야 하는 필드와 1:1입니다. 11.3절: 예산을 넘으면 **첫 레버는 Evaluator를 flash로** 내리는 것이라는 4.2절 지시를 그대로 따릅니다 (**실행 상한은 300초로 확인됐지만 이 레버가 방어하는 진짜 제약은 RPD입니다** — D31) |
| `supabase-engineer` | **스키마 변경 요청 없음.** `preparation` 상태는 새 컬럼 없이 `session_events`에서 파생합니다(12.2절). 다만 크론이 `in_progress` 세션을 `updated_at`으로 스캔하는데 `idx_sessions_status_updated` 부분 인덱스가 `in_progress`를 포함하지 않습니다 — MVP 규모에서는 순차 스캔으로 충분하다고 판단하지만, 세션이 수천 건을 넘으면 알려 주세요. **04 문서 반영 요청 2건은 14.1절에 있습니다(스키마 변경 아님).** |
| `shadcn-ui-engineer` (**2차 / QA 대응 — 응답 shape가 바뀐 4곳**) | (1) **#16의 대응 훅 이름이 `useStartEvaluation` → `useRetryEvaluation`으로 바뀌고 의미가 `failed` 재시도 전용으로 좁혀졌습니다.** 리포트 화면 진입 시 자동 호출을 **삭제**하세요 — 정상 경로에서 항상 409입니다(6.3절). (2) **`Evaluation`에 `myFeedback: ReportFeedback \| null`과 `myDisputes: ScoreDispute[]`가 추가됐습니다**(12.3절). 새로고침 후에도 "접수되었습니다" 배지가 유지되며, 별도 조회 훅을 만들지 마세요. (3) **`GET /api/documents/[documentId]`(#34) + `useDocument`가 신설됐고 응답은 `{ document: DocumentDetail }`, `DocumentDetail`은 `Document` + `linkedSessionCount` + `configuringSessionCount`입니다**(12.4절). 삭제 확인 다이얼로그는 이 값을 읽고, 문구는 "출처 표시가 사라진다"이지 "리포트가 손상된다"가 아닙니다. (4) **#15/#9 응답의 `session.status`는 정상 경로에서 `evaluating`입니다** — `completed`를 기대하는 분기가 있으면 깨집니다(4절 표 아래 경고) |
| `shadcn-ui-engineer` (**2차 / D19 — 취소는 삭제가 아닙니다**) | "이 세션 버리기"·"폐기"를 **`useDeleteSession`(#23)에서 `useCancelSession`(#33 `POST .../cancel`)으로 옮기세요.** 응답은 `{ session: Session }`(`status='canceled'`)입니다. 두 경로의 차이는 4.2절 표에 있습니다. 세션 목록은 기본으로 취소된 세션을 숨기고 **"취소된 세션 보기" 토글이 `includeCanceled=true`** 를 붙입니다(4.3절, 문자열 `'true'`). 토글을 바꾸면 커서를 버리고 처음부터 다시 조회하세요 |
| `shadcn-ui-engineer` (**2차 / F8 — 추출 실패 탈출구**) | 문서 추출이 `failed`로 끝난 뒤 사용자가 포기할 수 있게 **"이 세션 준비 포기"(#35 `useAbandonPreparation`)** 를 추출 실패 배너 안에 두세요. 이것이 없으면 사용자가 `configuring`에 갇힙니다. 응답은 `{ session: Session }`(`status='failed'`, `failureReason='document_extraction_failed'`) |
| `qa-inspector` (**2차**) | 재검증 요청: (1) 전이 표 33행 전수 대응은 **4.6절**에 정리했습니다 — 남은 미대응은 29번 `evaluated → evaluating` **1행뿐이고 `[later]`로 의도된 것**입니다. (2) F1은 6.2·6.3절, F2는 4.2·4.3절 + #33, F3은 12.3절, F4는 12.4절 + #34, F6은 4.5절, F8은 4.4절 + #35에서 각각 대응했습니다. (3) **F10(15절 #1의 노후화)은 아직 손대지 않았습니다** — 이번 지시 범위 밖이라 남겨 두었습니다. (4) 대응 훅 이름이 바뀐 것은 #16 하나(`useStartEvaluation` → `useRetryEvaluation`)이며, 신설 훅은 `useCancelSession`·`useDocument`·`useAbandonPreparation` 3개입니다 |
| `shadcn-ui-engineer` (**3차 / D27·D28·D29 — 신설 6개 + shape 변경 2건**) | **신설 엔드포인트 6개와 훅:** (1) `#36 GET /api/capacity` → `{ capacity: Capacity }` / `useCapacity` — **`canStartSession`은 `keyStatus==='connected'`면 항상 true**이고, `availableAtIso`가 `null`이면 **"내일 오세요"를 렌더하지 마세요**(기다려도 안 풀리는 벽입니다). (2) `#37 GET /api/account/api-key` → `{ apiKey: ApiKeyStatus }` / `useApiKeyStatus`. (3) `#38 PUT /api/account/api-key` (body `{ apiKey }`) → `{ apiKey: ApiKeyStatus }` / `useConnectApiKey` — **연결과 교체가 같은 라우트**입니다. (4) `#39 DELETE /api/account/api-key` → `{ apiKey: ApiKeyStatus }`(`keyStatus='none'`) / `useDisconnectApiKey` — **`{ ok: true }`가 아닙니다.** (5) `#40 POST /api/account/api-key/verify` → `{ apiKey: ApiKeyStatus }` / `useVerifyApiKey`. (6) `#41 POST /api/trial-consent` (body `{ consentVersion, sessionId? }`) → `{ consent: TrialConsent }` / `useGrantTrialConsent`. **`ApiKeyStatus`에 키 원문 필드가 없으므로 "보기" 토글·복사 버튼을 만들 수 없습니다** — 화면에 쓸 값은 `keyLast4` 하나입니다 |
| `shadcn-ui-engineer` (**3차 / 기존 shape 변경**) | (1) **`Session`에 `fundingSource: 'trial_shared' \| 'byok'`가 추가됐습니다**(nullable 아님). (2) **`PauseReason`이 3개 → 5개**입니다 — 재개 패널이 `byok_key_invalid`·`byok_quota_exhausted`를 분기해야 하고, **`byok_quota_exhausted`에는 재개 가능 시각을 표시하지 마세요**(`resumableAfter`가 `null`입니다). (3) 신규 오류 4종을 처리하세요: **503 `capacity_unavailable`**(여력 부족 화면, **1순위 버튼은 "키 연결하기"**), **409 `trial_consent_required`**(동의 다이얼로그), **409 `byok_key_invalid` / `byok_quota_exhausted`**(세 문구를 서로 다르게 — `06_ui_plan.md`가 `code`로 조회하는 고정 문안이며 **프로바이더 메시지를 그대로 띄우지 마세요**). (4) **`consentVersion`은 `useCapacity` 응답에서 받아 `#41`에 그대로 되돌려 보냅니다** — 하드코딩하면 `409 consent_version_stale`이 납니다. (5) 동의 문구 원본은 `src/lib/consent/trial-consent.ts` 한 곳이고 다이얼로그가 이 상수를 import합니다(두 번째 사본을 만들면 해시가 갈라집니다) |
| `qa-inspector` (**3차 검증 요청 — 엔드포인트별로 나눠서 봐 주세요**) | (1) **키 원문이 어떤 응답에도 없는지** — `ApiKeyStatus`에 자리가 없고 키 원문의 방향은 #38 요청 body 하나뿐입니다(4.8.1절). **body 로깅 미들웨어가 #38에 붙어 있지 않은지**가 남은 유일한 누출 경로입니다. (2) **공용 키 폴백 금지** — `resolveCallCredentials` 호출이 **재시도 루프 안에** 있는 코드가 없는지 grep(4.8.2절). (3) **`byok` 세션이 예약 원장에 행을 만들지 않는지** — 분기가 `src/lib/quota/gate.ts` 네 함수 진입부 한 곳에만 있는지(4.7.0절). (4) **반납 6지점 전수**(4.7.3절)와 **이중 반납이 없는지**(#23/#31에 반납 호출을 따로 두지 않았는지). **D34 추가 — 1번(`→ completed`)이 `− 6`을 뺀 부분 반납인지, 2번(`→ evaluated`)이 그 6을 정산하는지 둘 다 확인해 주세요.** 1번이 전량 반납이면 완주한 세션이 리포트를 못 받고, 2번이 빠지면 세션당 6이 영구히 샙니다. (5) **동의 없이 `prepare`가 통과하지 않는지** — 특히 **옛 버전 동의만 가진 사용자**(DB 트리거는 통과시킵니다, R9). (6) **503 `capacity_unavailable`과 429 `rate_limited`가 섞이지 않는지**, `details`에 버킷·잔여량·한도가 없는지 |
| `shadcn-ui-engineer` (**3차 / 함정 2건**) | (1) **503을 무조건 "여력 부족" 화면으로 렌더하지 마세요.** `useCapacity`의 `keyStatus === 'invalid'`이면 원인은 여력이 아니라 **무효한 키**이고, 이때 띄울 문구는 "키를 다시 확인해 주세요"입니다(15절 #11). 세 상황(공용 여력 소진 / 키 무효 / 사용자 키 한도 소진)의 문구는 서로 달라야 합니다. (2) **#41 응답의 `consent.sessionId`가 요청에 보낸 값과 다를 수 있습니다** — 같은 문구 버전에 이미 동의한 사용자는 **기존 행이 그대로 반환**되기 때문입니다(멱등). 이 값으로 화면을 분기하지 마세요. 동의 여부 판정은 `useCapacity`의 `requiresTrialConsent` 하나입니다 |
| `ai-interview-architect` · `product-architect` (**판단 요청 회신 — D30으로 확정됨**) | **체험 예약 중복 문제는 D30으로 확정됐고 계약에 반영했습니다.** 완화책 (a)를 채택합니다 — 체험 사용자가 이미 `held` 예약을 가지고 있으면 #6 `prepare`의 두 번째 예약을 **409 `trial_reservation_exists`**로 거절합니다(4.7.6절, 13절). **8.3.3절의 "예약은 세션에 붙는다"는 뒤집지 않았습니다** — 사용자당 동시 예약 개수만 1건으로 제한합니다. 강제 지점은 `reserve_session_quota`(DB 함수)이며 라우트는 예외를 409로 번역할 뿐입니다. **`byok` 세션에는 해당하지 않습니다** |
| `voice-pipeline-engineer` | **토큰 발급 라우트는 이번에도 만들지 않습니다.** 브라우저 내장 STT/TTS를 쓰므로 인증할 프로바이더가 없다는 3.5절 판단이 그대로이고, **BYOK는 이 판단을 바꾸지 않습니다** — 사용자 키는 LLM 경로에만 쓰이고 음성 경로에는 닿지 않습니다. 그래서 `byok` 세션에서도 폴백 사다리 1·2단계(TTS 텍스트화 → STT 텍스트 전환)가 그대로 동작합니다(`01_state_machine.md` 4.5절 규칙 4). **`pause_reason`이 5종이 되었으므로 음성 UI가 일시정지 사유를 분기한다면 신규 2개를 처리**해야 하고, `stream_error.code`에도 `byok_key_invalid`·`byok_quota_exhausted` 2종이 늘었습니다(5.2절) |
| `ai-interview-architect` (**3차**) | 4.4.1절 `LlmCallContext` 시그니처, 4.4.3절 폴백 금지, 4.6절 3분류, 8.3절 예약 모델을 **그대로 계약에 옮겼습니다**(4.7·4.8·10.2절). 계약이 추가한 것은 셋입니다 — (1) `p_limits` 계산 주체를 라우트로 명시(R8), (2) `quota_date`를 `AI_QUOTA_RESET_TIMEZONE` 기준으로 계산하라는 못, (3) **`/api/capacity` 응답을 `{ capacity: Capacity }`로 감쌌습니다** — 13.6.2절은 평탄한 오브젝트로 적었지만 1절 래핑 규칙(최상위는 리소스 이름 키)이 이 문서의 법이라 그쪽을 따랐습니다. 필드 이름·의미는 그대로입니다 |
| `supabase-engineer` (**3차**) | **스키마 변경 요청 없음.** 12.2절 전달 사항을 전부 반영했습니다(`p_limits`는 라우트가 계산, 키 원문은 `get_user_api_key()`로만, 동의는 `(user_id, consent_version)` upsert, `funding_source`는 #3에서 확정). 확인 요청 1건: **`ai_quota_ledger`가 RLS 정책 0개**라 `#36 GET /api/capacity`는 읽기 전용인데도 `admin.ts`를 씁니다(8절 표) — "클라이언트 정책이 있는 테이블에는 admin을 쓰지 않는다"는 원칙의 예외가 아니라, **정책이 아예 없는 테이블이라 다른 길이 없다**는 뜻으로 적었습니다. 이 해석이 맞는지만 봐 주세요 |
| `product-architect` | **요청 2건.** (1) `01_state_machine.md` 전이 표 95행(`configuring → failed`)의 트리거 문구에 진입점이 #35라는 사실이 반영되면 좋겠습니다(문구 변경일 뿐 전이 자체는 그대로입니다). (2) `01_product_spec.md`의 `/sessions` 화면 요구에 **"취소된 세션 보기" 토글**을 넣어 주세요(QA F12). API 쪽 `includeCanceled`는 4.3절에 이미 있습니다 |
| `shadcn-ui-engineer` (**4차 / D30 — 소거법을 버리세요**) | **신규 오류 409 `trial_reservation_exists`를 `usePrepareSession`에서 `code`로 직접 분기하세요.** `details.existingSessionId`가 **항상 채워져** 오므로 "진행 중인 면접으로 가기" 링크는 이 값으로 만들고, **`useDashboard`의 `activeSessions`에서 세션을 찾는 폴백은 삭제하세요**(`06_ui_plan.md` 16절 #10 · 14절 §5 회신). 다른 409 3종(`trial_consent_required`·`byok_key_invalid`·`consent_version_stale`)이 아니면 D30으로 간주하던 소거법도 함께 폐기합니다. 이 오류는 **여력 부족이 아니므로** 503 화면·"내일 오세요" 문구와 섞지 말고, 안내에는 **[이어서 하기]와 [이전 면접 취소하기](#33)** 두 행동을 두세요 |
| `qa-inspector` (**4차 / D30 검증 요청**) | (1) **#6이 `trial_reservation_exists`를 409로 내는지**, 그리고 이 코드가 `funding_source='byok'` 경로에서 나올 수 없는지. (2) **강제가 라우트가 아니라 `reserve_session_quota`(DB 함수)에 있는지** — 라우트 단독 검사면 동시 요청에서 빠져나갑니다. (3) **`details.existingSessionId`가 비어 있는 응답 경로가 없는지.** (4) **UI에 `activeSessions` 폴백 잔재가 없는지**(grep). (5) **#16·#18에서는 이 코드가 나오지 않는지**(같은 세션의 재예약이므로). (6) 거절 후 **세션이 `configuring`에 남고 설정이 보존되는지** |

| `qa-inspector` (**5차 / D31 검증 요청**) | (1) **`/api/internal/jobs/coach` 파일이 저장소에 남아 있지 않은지** — 경로가 남으면 `JOB_SECRET`만으로 코치를 단독 호출할 수 있는 문이 하나 더 열린 채가 됩니다(4.1절). (2) **I2의 1단계와 2단계가 서로 다른 try/catch이고 한 트랜잭션으로 묶여 있지 않은지** — 묶이면 부분 성공이 사라지고 `improvement`의 nullable이 죽습니다(6.2절). (3) **코치 단계가 `evaluations.attempt_count`를 UPDATE하지 않는지**(6.4절). (4) **소프트 데드라인 210s 검사가 코치 진입 직전에 있는지**(11.2.1절). (5) **`maxDuration`이 라우트 파일과 `vercel.json` 양쪽에서 같은 값인지** — 한쪽만 두면 조용히 기본값으로 떨어집니다. (6) **#18이 `stage: 'coach_only'`로 I2를 부르는지**, 그리고 그 경로에서 1단계가 실행되지 않는지 |
| `shadcn-ui-engineer` (**5차 / D31 — 프론트 변화 없음**) | **응답 shape·훅·타입이 하나도 바뀌지 않았습니다.** #18의 응답은 그대로 `202 { sessionId, evaluationId, coachStatus: 'running' }`이고, 리포트 대기 화면의 Realtime 재조회 흐름도 그대로입니다. 바뀐 것은 서버 내부의 함수 호출 구조뿐입니다. **다만 코치 완료가 평가 완료 직후에 이어지므로 `evaluating → evaluated` 사이의 체감 간격이 짧아집니다** — "점수만 먼저 보이고 코칭이 나중에 채워지는" 중간 화면을 전제한 구현이 있다면, 그 화면은 이전에도 보장된 적이 없습니다(코치 미완료 판정은 여전히 `evaluation.summary === null` 하나입니다) |
| `ai-interview-architect` (**5차 / D31**) | **8.1절 지연 추정치가 이제 한 함수 호출의 예산으로 합산됩니다**(평가자 + 코치 ≤ 210s 소프트 데드라인). 두 추정치 중 하나라도 크게 빗나가면 조정 레버는 4.2절 순서 그대로입니다(11.3절). **요청 1건:** 8.2절이 평가 파이프라인을 "2단계 체이닝"으로 서술하고 있다면 **"한 워커 호출 안의 순차 2단계"** 로 문구를 맞춰 주세요 — 단계의 논리적 분리와 독립 재시도는 그대로이므로 **설계 변경이 아니라 문구 정정**입니다. 이 계약은 `02_*` 문서를 고치지 않습니다 |
| `supabase-engineer` (**5차 / D31**) | **스키마 변경 요청 없음.** `evaluations.status`·`attempt_count`·`started_at`의 용법이 그대로이고, 코치가 별도 함수에서 돌지 않게 됐을 뿐입니다. **확인 요청 1건:** `evaluations`의 선점 UPDATE(`status='running' and id=:evaluationId`)가 이제 **한 호출에서 두 단계 내내 잡혀 있게** 됩니다. `started_at` 갱신을 `locked_at` 대용으로 쓰는 규약(6.2절)이 10분 워치독 기준(`WATCHDOG_EVALUATING_TIMEOUT_MIN`)과 충돌하지 않는지 봐 주세요 — 워커 최악 실행이 240s이므로 10분 안에는 끝납니다만, 두 값의 관계를 명시해 두는 편이 안전합니다 |

### 14.1 데이터 레이어 변경 요청 (`supabase-engineer`)

**스키마(마이그레이션) 변경 요청은 없습니다.** 아래 2건은 `04_data_layer.md`의 **문서 반영** 요청입니다.
스키마는 `supabase-engineer` 소유이므로 이 계약은 값 규약만 정하고 DDL을 건드리지 않습니다.

| # | 요청 | 대상 | 내용 |
|---|---|---|---|
| **R-A** | `session_events.to_status` 값 규약 명문화 (**QA F6 · G6 — 아직 `04`에 미반영**) | `04_data_layer.md` 3.6절 | **아직 반영되지 않았습니다. 3.6절에 다음 세 가지를 넣어 주세요.** ① **값 규약**: 비전이 이벤트는 `from_status = to_status = 그 시점 세션의 `status``로 채웁니다(4.5절). 채우는 주체는 **#22 라우트**이며 **클라이언트는 상태를 보내지 않습니다**. `to_status`를 **nullable로 완화하지 않습니다** — `from_status = to_status`는 `in_progress` 자기 전이로 이미 정상인 모양이고, nullable은 지표 1·2 쿼리에 `is not null` 누락 위험을 새로 만듭니다. ② **적용 범위에 D27 신규 이벤트 3종을 포함**: 기존 5종(`score_card_viewed` · `report_viewed` · `modality_switched` · `voice_precheck` · `rate_limit_fallback`)에 더해 **`quota_reserved` · `quota_released` · `quota_overflow`**(3.6절에 이미 값으로 등재됨)도 **전부 비전이 이벤트**이므로 같은 규약을 따릅니다. 특히 `quota_reserved`는 `configuring`에서, `quota_released`는 어느 종료 상태에서든 기록될 수 있으니 **고정 상태값을 하드코딩하지 마세요** — 그 시점 행의 `status`를 그대로 씁니다. ③ **지표 쿼리 규약**: 전이를 셀 때는 반드시 `event_name`으로 먼저 필터합니다(`to_status`만으로 세면 비전이 8종이 섞여 지표 1·2가 부풀어 오릅니다). **스키마(DDL) 변경은 없습니다** |
| **R-B** | `canceled` 세션의 존속을 9.1절/인덱스 서술에 반영 (**QA F2 / D19**) | `04_data_layer.md` 9.1절 · 인덱스 절 | D19로 `canceled`는 **행이 남는 종료 상태**가 됐습니다. 세션 목록의 기본 쿼리가 `status <> 'canceled'`를 항상 달고 다니므로(4.3절), 목록 인덱스(`idx_sessions_user_created` 계열)로 이 조건이 커버되는지 확인해 주세요. MVP 규모에서는 필터링으로 충분하다고 보지만, **부분 인덱스가 `canceled`를 제외하도록 잡혀 있으면 토글(`includeCanceled=true`) 조회가 인덱스를 못 타게 됩니다** — 그 경우 알려 주세요 |

> 참고: `linkedSessionCount`(#34)는 `interview_sessions`를 `resume_document_id` / `jd_document_id`로
> 세는 집계 2회입니다. 두 컬럼 모두 FK이므로 인덱스가 있으면 그대로 쓰고, 없으면 MVP 규모에서는
> 순차 스캔으로 충분합니다. **새 컬럼이나 카운터 캐시를 만들지 않습니다** — D9(삭제된 세션의 집계
> 테이블을 두지 않는다)와 같은 이유로, 실시간으로 세는 편이 틀릴 여지가 없습니다.

---

## 15. 다른 문서와의 불일치 (**고치지 않고 나열** — 리더 조정 대상)

| # | 지점 | 내용 | 제안 |
|---|---|---|---|
| **1** | `02_ai_contracts.md` 3.2절 **M8** vs `03_voice_pipeline.md` **7.2절 표 2행** | **정면으로 반대입니다.** M8(D17): 보류분이 센티널의 진부분 문자열이면 **발화로 flush**한다. 7.2절: 접두사이면 **버린다**. 둘 다 구현할 수 없습니다 | **M8을 채택했습니다**(D17이 확정 결정이고, 근거—"스트림이 끝난 이상 완성될 가능성이 0"—가 더 정확합니다). `03_voice_pipeline.md` 7.2절 표를 M8에 맞춰 갱신해야 합니다 |
| 2 | `01_state_machine.md` 2절 104행 (하트비트 90초 유실 → `paused(connection_lost)`) | 무료 플랜에는 **상시 워커도 분 단위 크론도 없어** 90초 단위 서버 판정이 불가능합니다. 하트비트를 받으려면 `session_events`에 분당 1행을 쌓아야 하는데, 그 테이블은 지표 1·2의 원천이라 오염됩니다 | 근사안을 채택했습니다: (a) 클라이언트 `visibilitychange`/`beforeunload`에서 `sendBeacon`으로 #13 호출(최선 노력), (b) 일 1회 크론이 `in_progress`이면서 `updated_at`이 `max_duration_min + 30분`보다 오래된 세션을 `paused(connection_lost)`로 내림. **"90초"는 클라이언트 UI의 재개 패널 표시 기준으로 남기고, DB 상태 전이 기준에서는 빼기를 제안합니다** |
| 3 | `01_state_machine.md` 2절 82행 (`evaluating` 10분 워치독) | 위와 같은 이유로 10분 주기 크론을 둘 수 없습니다 | **게으른 워치독**(6.5절)으로 근사했습니다. 사용자가 보고 있는 세션은 정확히 10분에 판정되고, 아무도 안 보는 세션만 최대 하루 늦어집니다 |
| 4 | `01_state_machine.md` 2절 116행 (`evaluating`→`completed` 재시도) | 재시도 중 상태가 `completed`로 돌아가면 Realtime 구독 화면에서 `evaluating`→`completed`→`evaluating` **깜빡임**이 생기고, `completed`의 사용자 표시는 "평가 대기"라 진행이 뒤로 간 것처럼 보입니다 | UI가 `evaluations.status='running'`을 함께 보고 "재시도 중"으로 표시하도록 `Evaluation.status`를 응답에 노출했습니다. **상태 값 변경은 제안하지 않습니다** — 전이 표를 바꾸는 비용이 표시 분기보다 큽니다 |
| 5 | `01_product_spec.md` 5절 (정정 창 종료 시점) | "다음 질문이 나온 뒤"의 시점이 여전히 불명확합니다(`03_voice_pipeline.md` 15절 #6이 이미 지적, 미해소) | 이 계약은 **`utterance_done` 도착**으로 구현합니다(#11이 그 이후 요청을 409로 거부). `01_product_spec.md` 5절에 이 문장을 명문화해 주세요 |
| 6 | `04_data_layer.md` 3.8절 4항 (사용자가 리포트에서 코치 재시도) | `01_state_machine.md` 전이 표에 이 동작이 없습니다. 상태는 `evaluated` 그대로인데 백그라운드 작업이 도는 유일한 경우입니다 | #18로 구현하고 "**전이 없음**"으로 명시했습니다. 전이 표에 "상태 변화 없는 재작업" 행을 추가할지는 `product-architect` 판단입니다 |
| 7 | `01_state_machine.md` 4절 1·2단계 ("TTS/STT 레이트 리밋") | `03_voice_pipeline.md` 15절 #1이 이미 지적한 대로, 브라우저 내장 API는 우리 쿼터를 쓰지 않아 레이트 리밋이 발생하지 않습니다. 서버 관점에서도 1·2단계에 **서버가 할 일이 사실상 없습니다**(10절 표) | 문구를 "TTS 불가 / STT 불가"로 넓히기를 제안합니다. 상태 값·`pause_reason` 변경은 필요 없습니다 |
| 8 | `02_ai_architecture.md` 8.2절 ("플래너: 작업 큐 + 폴링/Realtime") | "작업 큐"라는 단어가 관리형 큐 인프라를 전제하는 것처럼 읽히지만, 무료 플랜에는 그런 것이 없습니다 | 6.2절의 **단계 체이닝 + DB를 큐로**가 이 요구를 만족한다고 판단했습니다. 인프라 추가 없음 |
| **9** | **`02_ai_architecture.md` 13.6.2절 `/api/capacity` 응답 모양** | 평탄한 오브젝트(`{ canStartSession, availableAtIso }`)로 적혀 있는데, 이 문서 1절 래핑 규칙은 **단건 응답을 리소스 이름 키로 감싸라**고 못 박고 있습니다 | **`{ capacity: Capacity }`로 감쌌습니다**(4.7.5절). 필드 이름·의미는 13.6.2절 그대로이고 래핑만 다릅니다. 1절이 이 문서의 법이고 훅이 언랩을 전제하므로 이쪽을 따랐습니다 |
| **10** | **`02_ai_architecture.md` 13.6.1절 vs `04_data_layer.md` 3.14.1절 — `reserve_session_quota` 시그니처** | `p_limits jsonb` 인자의 유무가 다릅니다(**R8**) | **`04`를 따릅니다.** DB가 환경변수를 읽을 수 없으므로 `limit_calls`는 라우트가 계산해 넘겨야 하고, 이는 13.6.1절 마지막 문단의 지시를 시그니처로 옮긴 것입니다(4.7.1절) |
| **11** | **`01_state_machine.md` 2절 #3 가드 — 키가 `invalid`인 사용자** | "**유효한** 사용자 키가 연결돼 있으면 `byok`"이므로, `keyStatus='invalid'` + 체험 소진인 사용자는 **체험 경로로 떨어져 503 `capacity_unavailable`** 을 받습니다. 그런데 **진짜 원인은 여력이 아니라 무효한 키**입니다 | 오류 코드는 그대로 두고(재원을 정할 수 없다는 사실은 같습니다) **프론트가 `useCapacity`의 `keyStatus='invalid'`로 분기**해 여력 부족 화면이 아니라 **"키를 다시 확인해 주세요"** 를 띄우도록 14절에 전달했습니다. 여력 부족 문구를 띄우면 사용자가 고칠 수 있는 문제를 고치지 못합니다 |
| **13** | **`02_ai_architecture.md` 8.3.1·8.3.4절 본문 "평가·코치 몫 **8**" vs 같은 8.3.1절 역할별 내역 표 "평가자 4 + 코치 2 = **6**"** | 면접 종료 시 남겨 두는 hold 양이 같은 문서 안에서 어긋납니다. 합계 34는 **6일 때만** 맞습니다("8"은 버킷 3개 시절 `pro 3 + flash 4 = 7` 계열 숫자가 D34 재유도에서 함께 갱신되지 않고 남은 것으로 보입니다). `01_state_machine.md` 각주 ※도 같은 지적을 하고 6을 채택했습니다 | **이 계약도 `6`을 채택했습니다**(4.7.3절 1번). 내역 표에서 유도되는 값이고 전이 표 원본과 일치하기 때문입니다. **확정은 `02_ai_architecture.md` 소유자(`ai-interview-architect`)의 몫이며, 8로 확정되면 4.7.3절 1번의 `− 6`과 "남는 held = 6"을 함께 고쳐야 합니다** |
| ~~12~~ | ~~체험 1회(D28) vs 예약이 세션에 붙는다(`02_ai_architecture.md` 8.3.3절)~~ | **✅ 해소(D30).** 체험 사용자는 **동시에 `held` 예약을 하나만** 가지며, 두 번째 `prepare` 예약은 **409 `trial_reservation_exists`**로 거절합니다. 완화책 후보 (a)가 채택됐고, 예약이 세션에 붙는다는 8.3.3절 결정은 **뒤집히지 않았습니다** — 사용자당 동시 개수만 제한합니다 | **4.7.6절 + 13절 오류 표에 반영 완료.** 강제 지점은 `reserve_session_quota`(DB 함수)이고 라우트는 예외를 409로 번역합니다. `details.existingSessionId`로 기존 세션 id를 실어 보내므로 프론트의 소거법·`activeSessions` 폴백은 폐기됩니다 |

---

## 16. 남은 결정

```
[결정 완료 D25] 옵션 A. 하트비트 90초 서버 판정 규칙을 폐기한다.
  무료 플랜에는 분 단위 크론이 없어 90초를 판정할 수단이 존재하지 않는다.
  관측할 수 없는 규칙을 계약에 남기면 구현 불가이거나 아무도 지키지 않는 거짓 문장이 된다.
  확정 동작: 클라이언트가 이탈을 감지하면 sendBeacon으로 즉시 paused(connection_lost) 최선 노력 호출,
            감지하지 못한 경우는 일 1회 워치독 + 사용자가 다시 열었을 때의 지연 판정으로 회수.
  옵션 B는 지표 1·2 원천 테이블을 분당 1행씩 오염시켜 기각.
  옵션 C는 스키마를 늘려도 판정 주체가 여전히 일 1회 크론이라 이득이 없어 기각.
  → 01_state_machine.md 2절 104행의 "90초" 문구는 위 서술로 대체한다 (스키마 변경 없음)
```

```
[결정 완료 D26] #26 문서 추출은 동기 라우트를 유지한다 (maxDuration 120 — D31로 재조정, 구 60).
  근거: AI 호출이 아니라 지연이 예측 가능하고(1~8s), 비동기로 바꾸면 상태·폴링·워커가 통째로
        늘어나는데 그 복잡도를 정당화할 만큼 오래 걸리는 작업이 아니다.
        실패 경로는 이미 정의돼 있다(extraction_status='failed' → 텍스트 직접 입력).
  뒤집는 조건(유지): 실측에서 10MB PDF가 30초를 넘으면 6.2절과 같은 체이닝으로 옮긴다.
                    업로드 단계의 파일 크기 제한이 1차 방어선이다.
```

```
[해소 2026-09-10 / D31] Vercel Hobby의 함수 실행 상한 = 300초(기본 300 / 최대 300),
  크론 최소 주기 = 하루 1회(정밀도 ±59분). 출처와 확인일은 05_deploy.md 3절 표.
  → 60초 가정이 틀렸으므로 평가·코치 체이닝을 워커 1회 호출로 단순화했다(6.2절).
  → 내부 워커 라우트 3종 → 2종. maxDuration 표를 11.2절에서 재조정했다.
  → "일 1회 워치독 + 게으른 워치독"(6.5절) 판단은 크론 제약이 실제로 확인되면서 검증됐다. 그대로 둔다.
  남은 것: 대역폭·함수 호출 수, 배포 보호 사용 가능 여부 — 05_deploy.md 3절에 여전히 [확인 필요]
```

```
[해소 2026-09-11 / D34] 선택 모델(Gemini)의 무료 티어 RPM · RPD · TPM — AI Studio 대시보드 실측 완료.
  pro 계열 RPD 0, flash 계열 RPD 20, gemini-3.1-flash-lite 15 RPM / 250K TPM / RPD 500.
  → 5개 역할 전부 gemini-3.1-flash-lite로 통일, 활성 버킷은 flash_lite 하나(세션당 34), 하루 체험 정원 12세션.
  → 이 계약에서 갱신한 곳: 4.7.1(p_limits 3키 유지·요청량 0 건너뜀) · 4.7.3(→ completed는 6을 남기는 부분 반납) ·
    4.7.4(재시도 예약 버킷) · 4.7.6(정원을 잠그는 버킷) · 11.3(모델 강등 레버 삭제) · 엔드포인트 표 #16·#18.
  잔여: 수치는 여전히 환경변수로 주입한다(05_deploy.md 3.1절). 주입 전까지 D27 예약 게이트는 fail-open이다.
  → 이 계약이 이 값에 의존하는 지점은 4.7절(예약량)과 10.1절(429 정규화)이며,
    둘 다 값이 없어도 동작하도록 이미 설계돼 있다
```

> 전체 결정 기록: [`00_input/decisions.md`](00_input/decisions.md)
