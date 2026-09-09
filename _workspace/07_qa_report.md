# QA 리포트 — 설계 문서 경계면 정합성 검증

> 소유: `qa-inspector` · 대상: `_workspace/` 전 산출물 (2026-09-09 시점) · 기준: `00_input/decisions.md`(확정 결정 21건)
> **코드가 아직 없으므로 문서 ↔ 문서 경계면만 검증했습니다.** 런타임 검증은 전부 "미검증" 절에 있습니다.
> 이 리포트는 어떤 문서도 수정하지 않았습니다. 각 항목의 "고칠 쪽"이 소유자입니다.

## 요약

| 심각도 | 건수 |
|---|---|
| critical | 2 |
| high | 6 |
| medium | 4 |
| low | 4 |

기계적 대조 9개 항목 중 **5개 통과 / 4개 실패**. 보안 4개 항목 **전부 통과**. 언어 정책 위반 **없음**.

가장 큰 문제는 **확정 결정 D18~D21이 `05_api_contract.md`와 `06_ui_plan.md`에 전혀 반영되지 않은 것**입니다.
두 문서 모두 리더가 D18~D21을 확정하기 전에 작성됐고(`06_ui_plan.md:8`이 "확정 결정 **17건**"을 가리킴),
그 결과 두 문서는 이미 결론이 난 문제를 여전히 `[결정 필요]`로 열어 두고 있습니다.

---

## 1. 발견 항목

### critical

| # | 심각도 | 경계 | 위치 | 현재 상태 | 기대 상태 | 고칠 쪽 |
|---|---|---|---|---|---|---|
| **F1** | **critical** | 결정 D18 ↔ API/UI | `05_api_contract.md:127`, `:297-306`, `:346`, `:350`, `:152` / `06_ui_plan.md:924`, `:1168-1176`, `:1209` | 평가 시작 주체가 **클라이언트**로 서술됨. 계약 #16의 상태 전이 열에 `completed`→`evaluating`이 있고, 6.2절 체이닝의 t=0이 "**사용자 요청**"인 `POST .../evaluate`이며, 6.3절은 `completed`→`evaluating`의 수행 주체를 "#16 라우트"로 못박음. UI는 리포트 화면 진입 시 `useStartEvaluation`을 자동 호출 | **D18: 평가 등록은 `completed`로 가는 모든 경로의 서버 부작용**. `POST .../evaluate`는 `failed` 재시도 전용이며 `completed`·`evaluating`에 호출하면 **409**. #15 `complete`와 #9 종료 조건, C1 크론의 `paused`→`completed`가 각각 워커 체인을 등록해야 함 | `vercel-platform-engineer`(05), `shadcn-ui-engineer`(06) |
| **F2** | **critical** | 결정 D19 ↔ API/UI | `05_api_contract.md:112-143`(엔드포인트 32개), `06_ui_plan.md:346`, `:1194-1198`, `:1210` | **`→ canceled` 전이를 일으키는 엔드포인트가 하나도 없습니다.** 계약 전체에서 `canceled`는 `:652`의 `SessionStatus` 유니온에만 등장. UI는 설정 화면의 "폐기"를 `useDeleteSession`(=#23 실제 삭제)에 연결하고 "(전이 표의 `created → canceled`는 **실제 삭제**입니다)"라고 명시 | **D19: `canceled`는 행을 남기는 종료 상태이고 취소 ≠ 삭제.** `created`/`configuring`/`ready`/`in_progress`/`paused`/`failed`/`abandoned` → `canceled` **7개 전이**를 담당하는 엔드포인트(예: `POST /api/sessions/[sessionId]/cancel`)와 대응 훅이 필요. `GET /api/sessions`는 기본 필터에서 `canceled`를 숨기고 "취소된 세션 보기" 토글로만 노출 | `vercel-platform-engineer` + `shadcn-ui-engineer` (경계 이슈 — 한쪽만 고치면 깨짐) |

**F1의 실제 피해:** `paused` 7일 자동 종료(D7)로 크론이 `completed`로 보낸 세션과, 사용자가 마지막 답변 직후 탭을 닫은 세션은 **클라이언트가 존재하지 않으므로 평가가 영원히 시작되지 않습니다.** `01_state_machine.md:80-82`가 명시적으로 금지한 "리포트를 영원히 기다리는" 상태입니다. 동시에 UI의 자동 호출은 D18 하에서 항상 409를 받으므로 `06_ui_plan.md:925`의 잠정 동작("실패하거나 409면 [평가 시작하기] 버튼 노출")이 **항상 죽은 버튼을 그립니다.**

**F2의 실제 피해:** 면접 도중 "이 세션 버리기"를 누른 사용자가 확인 절차 없이 대화 기록을 영구 파괴당합니다(D19가 명시적으로 막으려 한 시나리오). 반대로 `interview_sessions.status`의 CHECK에는 `canceled`가 있는데(`04_data_layer.md:294`) 그 값을 쓰는 경로가 없어 **관측 불가능한 유령 상태**가 그대로 남습니다.

### high

| # | 심각도 | 경계 | 위치 | 현재 상태 | 기대 상태 | 고칠 쪽 |
|---|---|---|---|---|---|---|
| **F3** | high | 결정 D20 ↔ API/UI | `05_api_contract.md:128`(#17), `:759-777`(`Evaluation` 타입) / `06_ui_plan.md:905`, `:1157`(14절 §1), `:1207`(16절 #1) | `Evaluation` 타입에 기존 피드백·이의 필드가 없음. UI는 "재조회 엔드포인트가 없어 새로고침하면 이 배지가 사라집니다"를 **미해결 문제로** 적어 둠 | **D20: `GET .../evaluation` 응답에 사용자의 기존 피드백·이의 목록을 포함.** `Evaluation`(또는 응답 봉투)에 `myFeedback: ReportFeedback \| null` / `myDisputes: ScoreDispute[]` 추가. `01_product_spec.md:175`가 리포트 화면의 필요 데이터로 "기존 피드백·이의 여부"를 이미 요구함 | `vercel-platform-engineer`(원본) + `shadcn-ui-engineer` |
| **F4** | high | 결정 D21 ↔ API/UI | `05_api_contract.md:135-143`(문서 엔드포인트 6개) / `06_ui_plan.md:1041`, `:1157`(14절 §2), `:1208` | **`GET /api/documents/[documentId]` 엔드포인트 자체가 존재하지 않고**, `linkedSessionCount`는 `_workspace/` 전체에서 `decisions.md` 외에 한 번도 나오지 않음. 건수는 여전히 `DELETE` 응답(`affectedSessionCount`/`configuringSessionCount`)에만 있어 **누르기 전에 경고할 수 없음** | **D21: `GET /api/documents/[id]` 응답의 `linkedSessionCount`로 제공.** 단건 조회 엔드포인트 + 대응 훅 신설, 삭제 확인 다이얼로그가 이 값을 읽음 | `vercel-platform-engineer`(원본) + `shadcn-ui-engineer` |
| **F5** | high | AI 계약 ↔ DB 스키마 | `02_ai_contracts.md:797`, `:807-820`(5.6절), `:1036`, `:1050` ↔ `04_data_layer.md:569`, `:580-600`, `:1262` | 계약은 `evaluation_scores.improvement`가 **not null**이라고 보고 "평가자 성공 시 **플레이스홀더 문자열**을 넣는다"를 계약으로 확정. DB는 리더 조정 1로 **옵션 B(NULL 허용)** 를 채택하고 "플레이스홀더 문자열을 넣는 방식은 **채택하지 않습니다**"라고 정반대로 명시. 계약 `:1050`의 `[결정 필요]`도 열린 채 남아 있음 | DB(옵션 B)가 확정본. `02_ai_contracts.md` 5.5·5.6·9절 #3·10절을 NULL 허용에 맞춰 갱신 | `ai-interview-architect` |
| **F6** | high | DB 스키마 ↔ API 요청 | `04_data_layer.md:476` ↔ `05_api_contract.md:133`(#22) | `session_events.to_status`가 **not null + 11개 값 CHECK**인데, 이 테이블에는 전이가 아닌 이벤트(`score_card_viewed`·`modality_switched`·`rate_limit_fallback`·`prompt_injection_suspected`·`planner_started/failed`·`interviewer_meta_missing`·`interviewer_stream_aborted`·`voice_precheck`·`report_viewed`)도 쌓임. **비전이 이벤트에서 `to_status`에 무엇을 넣는지 어느 문서에도 없음.** #22의 요청 body는 `{ eventName, detail? }`뿐 | 비전이 이벤트는 `from_status = to_status = 현재 세션 status`(라우트가 조회해 채움)를 규약으로 명문화하거나, `to_status`를 nullable로 완화. 명시하지 않으면 **첫 `score_card_viewed` INSERT에서 not-null 위반** → 지표 5의 분모가 통째로 빔 | `supabase-engineer` + `vercel-platform-engineer` (경계 이슈) |
| **F7** | high | AI 계약 ↔ API/UI (SSE) | `02_ai_contracts.md:481` ↔ `05_api_contract.md:191`, `06_ui_plan.md:211` | 계약 원본(`02_ai_contracts.md` 3.5절)의 `utterance_done` 페이로드에 **`sessionStatus`가 없음**. `05`와 `06`은 둘 다 `sessionStatus: SessionStatus`를 포함하고, UI는 이 값으로 종료 조건 충족(`completed`)을 감지 | `05_api_contract.md:179`가 "3.5절이 원본"이라고 선언했으므로 원본에 `sessionStatus`를 추가해야 함. 계약대로 구현하면 UI가 `undefined`를 읽어 **면접 종료를 감지하지 못함** | `ai-interview-architect` |
| **F8** | high | 상태 전이 ↔ 엔드포인트 | `01_state_machine.md:95` ↔ `05_api_contract.md:137`(#26), `:864` | `configuring → failed`(문서 추출 실패 후 사용자가 재시도 포기, `failure_reason='document_extraction_failed'`) 전이를 **일으키는 엔드포인트가 없습니다.** #26 extract는 상태 전이 "없음"으로 명시되고, 12.2절도 "`configuring → failed`는 문서 추출 실패 경로에만 존재한다"고만 적음 | 이 전이를 담당하는 라우트(예: `POST .../abandon-preparation` 또는 #5 config의 특수 경로)를 계약에 추가하거나, 전이 표에서 삭제. 지금은 **죽은 전이**이고 사용자는 `configuring`에 갇힘 | `vercel-platform-engineer` + `product-architect` |

### medium

| # | 심각도 | 경계 | 위치 | 현재 상태 | 기대 상태 | 고칠 쪽 |
|---|---|---|---|---|---|---|
| **F9** | medium | 결정 D14/D15/D16 ↔ 음성 문서 | `03_voice_pipeline.md:534-559`(8.2절), `:870`(15절 #2), `:880`, `:884`, `:888`(16절) | 이미 확정된 D14(t=0 = 엔드포인트 확정 시점)·D15(자동 barge-in MVP off)·D16(안내 문구 고지)이 여전히 **`[결정 필요]` 3건**과 "반드시 보고해야 할 것"으로 열려 있음 | 8.2절을 "정의 A로 확정(D14)"으로, 16절의 3건을 확정 서술로 교체. `02_ai_architecture.md:252-269`(6.3절 예산 표)에도 **t=0 정의 문장이 없으므로** 함께 추가 | `voice-pipeline-engineer` + `ai-interview-architect` |
| **F10** | medium | 문서 간 불일치 기록의 노후화 | `05_api_contract.md:231-233`, `:914`(15절 #1) | "M8은 `03_voice_pipeline.md` 7.2절과 정면으로 반대이며 7.2절을 갱신해야 한다"고 미해결로 기록. 그러나 `03_voice_pipeline.md:478`은 이미 "초안의 '접두사이면 버린다'는 철회합니다"로 갱신 완료(`:871` 15절 #4도 "해소됨") | 05의 15절 #1을 해소 처리. 남겨 두면 구현자가 이미 없는 충돌을 다시 조정하려 함 | `vercel-platform-engineer` |
| **F11** | medium | 결정 D18/D19 ↔ UI 미결 목록 | `06_ui_plan.md:1168-1176`, `:1194-1198`, `:1209`, `:1210`, `:1221` | 15절의 `[결정 필요]` 2건(평가 시작 주체 / `canceled` 목록 표시)과 16절 불일치 #3·#4, 17절의 `vercel-platform-engineer`·`product-architect` 요청이 **D18·D19로 이미 답이 나온 사안** | 확정 서술로 교체하고 8.1절을 D18에 맞춰 단순화 | `shadcn-ui-engineer` |
| **F12** | medium | 결정 D19 ↔ 도메인/제품 문서 | `01_domain_model.md`, `01_product_spec.md` 전역 | 두 문서 어디에도 `canceled`·"취소"라는 단어가 없음(grep 0건). 세션 이력 목록(`01_product_spec.md:177`)의 기능 목록에 "세션 삭제"만 있고 취소된 세션의 표시·필터 요구가 없음 | D19에 따라 "취소된 세션 보기" 토글을 제품 스펙의 `/sessions` 화면 요구에 추가 | `product-architect` |

### low

| # | 심각도 | 경계 | 위치 | 현재 상태 | 기대 상태 | 고칠 쪽 |
|---|---|---|---|---|---|---|
| **F13** | low | 문서 메타데이터 | `06_ui_plan.md:8` | "`00_input/decisions.md`(확정 결정 **17건**)" | 21건. 이 숫자가 F1~F4의 원인 표지입니다 | `shadcn-ui-engineer` |
| **F14** | low | 루브릭 축 ↔ UI | `06_ui_plan.md` 전역 | 5개 축 식별자(`job_knowledge` 등)가 UI 플랜에 **한 번도 문자로 등장하지 않음**(`axis` 변수로만 다룸). 코드 작성 시 대조할 기준선이 UI 쪽에 없음 | 7.2절 축 카드 절에 5개 식별자와 표시명 매핑 표를 명시 | `shadcn-ui-engineer` |
| **F15** | low | 총점 자릿수 서술 | `01_rubric.md:72` vs `00_input/decisions.md:11`(D1) | 루브릭은 "소수 **둘째** 자리까지 기록", D1은 "소수 **1자리** 노출" | 실질 충돌 아님(`06_ui_plan.md:792`가 "저장은 `numeric(3,2)`, 표시에서만 반올림"으로 정리). 루브릭에 "기록 2자리 / 표시 1자리" 한 줄 추가 권장 | `product-architect` |
| **F16** | low | D11 ↔ 예시 값 | `04_data_layer.md` 3.7절 `provider` 설명 | 예시가 `anthropic` / `openai`인데 D11은 **Google 단독** | 예시를 `google`로 교체(계약 위반은 아니며 오해 소지만 있음) | `supabase-engineer` |

---

## 2. 기계적 대조 9개 항목 — 통과/실패

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | **상태 값 11개** 문자 단위 일치 | **통과** | `01_state_machine.md:15-25` ↔ `04_data_layer.md:283-296`(CHECK) ↔ `05_api_contract.md:650-652`(`SessionStatus`) ↔ `06_ui_plan.md:78-82`(`route-for-status`). 11개 전부 문자 단위 일치, `cancelled`(l 두 개) 오타 0건, 한국어 번역 0건. `session_events.from_status/to_status`도 같은 11개 CHECK(`04:475-483`) |
| 2 | **부속 enum** | **통과** | `pause_reason`(3), `modality`(2), `persona`(2), `job_role`(5), `question_kind`(2), `role`(2), `reason_code`(4), `extraction_status`(5), `doc_type`(2), `source_type`(2), `evaluations.status`(3), `trigger`(5) — `01_state_machine.md` 1절 · `04_data_layer.md` 3.2~3.12 · `05_api_contract.md:650-665` 전부 일치 |
| 3 | **루브릭 축 5개** | **통과(단서 있음)** | `01_rubric.md:15-19` ↔ `02_ai_contracts.md`(`$defs/axis`) ↔ `04_data_layer.md:563`(CHECK 5개 값) ↔ `05_api_contract.md:657`(`Axis`) 전부 일치. **단, `06_ui_plan.md`에는 식별자가 없음 → F14** |
| 4 | **음성 UI 4상태** | **통과** | `03_voice_pipeline.md` 11절 ↔ `06_ui_plan.md:24`, `:671`, `:676`, `:701`. `listening`/`transcribing`/`thinking`/`speaking` 문자 단위 일치. 보조 4상태(`idle`/`requesting_permission`/`error`/`text_fallback`)도 일치하고, `06:1210`(16절 #6)이 "이름 변경 없이 채택" 회신 완료 |
| 5 | **라우트 경로** | **통과** | `01_product_spec.md:169-180`의 화면 11개 + `[later]` 1개 ↔ `06_ui_plan.md:32-68`. URL 11개 전부 1:1 대응, 라우트 그룹 `(marketing)`/`(auth)`/`(app)`은 URL에서 제거된 채 표기됨. `route-for-status`의 목적지 5종이 전부 실재 라우트 |
| 6 | **API 응답 shape ↔ 훅 반환 타입(언랩 여부)** | **실패 → F3·F4** | 엔드포인트 32개 ↔ 훅 34개의 이름·봉투·**언랩 여부는 32건 전부 일치**(가장 흔한 실전 버그는 없음). `useSessions`/`useDashboard`/`useTurnsResync`/`useTranscript`/`useDocuments`/`useAccount`가 모두 "언랩 아니오"로 양쪽 일치하고, 단건은 "언랩 예"로 일치. `EvaluationJobAccepted` ↔ `Evaluation` 타입 분리도 양쪽에 명시(`05:82-95`, `06:927`). **실패 사유는 shape 불일치가 아니라 D20·D21이 요구한 필드/엔드포인트가 양쪽 모두에 없다는 것** |
| 7 | **DB 컬럼 ↔ API 응답 필드** | **통과** | `documents`(14) ↔ `Document`, `turns`(13) ↔ `Turn`, `questions` ↔ `Question`, `evaluations`(15) ↔ `Evaluation`, `evaluation_scores`(9) ↔ `EvaluationAxis`, `evaluation_citations`(9) ↔ `Citation`, `report_feedback` ↔ `ReportFeedback`, `score_disputes` ↔ `ScoreDispute`, `interview_sessions`(28) ↔ `Session` — 이름 누락·변형 0건. `resume_text_snapshot`/`jd_text_snapshot`은 의도적으로 `hasResumeSnapshot`/`hasJdSnapshot` 불리언으로 축약됨(`05:677-678`에 근거 명시). E3 예외(`coachPayload`/`improvements` 내부 키 snake_case 유지)도 양쪽 일치 |
| 8 | **AI 출력 스키마 ↔ DB 저장 구조** | **실패 → F5·F7** | 5.5절 저장 매핑 표는 대부분 정합(`score` 1~5 ↔ int CHECK, `quote_text` 20~160 ↔ char_length CHECK, `citation_index` 0~2 ↔ CHECK, `overall_score` nullable ↔ `numeric(3,2)` nullable). 서버 계산값(`weight`·`quote_start/end`·`overall_score`)이 AI 스키마에 자리 없음도 양쪽 일치. **`improvement`의 not null/플레이스홀더 충돌(F5)과 `utterance_done`의 `sessionStatus` 누락(F7)이 실패 사유** |
| 9 | **상태 전이 ↔ 엔드포인트** | **실패 → F1·F2·F8** | 전이 표 33행 중 **24행은 트리거 대응 확인**. 미대응: `→ canceled` 7행(F2), `configuring → failed` 1행(F8), `completed → evaluating`의 주체 오류(F1). **고아 엔드포인트는 없습니다** — 전이를 일으키지 않는 18개 엔드포인트는 전부 조회·부작용 라우트로 "상태 전이 없음"이 명시되어 있고, 대응 훅도 전부 존재 |

---

## 3. 보안 검증

| 항목 | 결과 | 근거 |
|---|---|---|
| **RLS 전 테이블 활성화** | **통과** | `04_data_layer.md:757`("12개 테이블 전부 `enable row level security`. 예외 없음"), 5.2절 정책 표에 12개 테이블 전부 등재. 사용자 데이터를 담되 클라이언트 접근이 필요 없는 `storage_cleanup_queue`는 **RLS 켜고 정책 0개**로 전면 차단(`:820`, `:716-718`) — 올바른 처리. **빠진 테이블 없음.** `anon` 역할에 정책 0건(`:761`), 테이블 생성·RLS 활성화·정책 생성을 같은 마이그레이션에 넣어 "정책 없는 창"을 없앤 것도 확인 |
| **키 노출(`NEXT_PUBLIC_`)** | **통과** | `NEXT_PUBLIC_` 접두사가 붙은 변수는 `SUPABASE_URL`·`SUPABASE_ANON_KEY`·`SITE_URL` **3개뿐**이며 전부 공개해도 되는 값. AI 키(`GOOGLE_AI_API_KEY`)·`SUPABASE_SERVICE_ROLE_KEY`·`JOB_SECRET`·`CRON_SECRET`에 접두사 제안 **0건**. `05_deploy.md:57-58`이 CI 검사 2종(소스 grep + 클라이언트 번들 값 검사)을 명시. `admin.ts` 첫 줄 `import 'server-only'`가 `04:991`·`05:398` 두 곳에서 규약화됨 |
| **프롬프트 인젝션 방어** | **통과** | 프롬프트 **4종 전부** 신뢰 경계 절을 가짐 — interviewer(`:68-75`, `<untrusted_candidate_answer>`/`<untrusted_derived_summary>`), evaluator(`:103-104`), coach(`:82-86`), planner(`:101-113`, `<untrusted_resume>`/`<untrusted_jd>`). 이력서·JD·사용자 답변이 전부 태그 블록 안의 **데이터**로 취급되고, `<`→`＜` 1:1 치환 정화(interviewer `:225`, coach `:140`)와 `flags.injection_attempt_detected` → `session_events(prompt_injection_suspected)` 관측 경로가 4종 모두에 있음. 사용자를 차단하지 않는 방침(`02_ai_architecture.md:381`)도 명시 |
| **오디오 미저장** | **통과** | Storage 버킷은 비공개 `documents` **1개뿐**(`04:1008-1016`, `public = false`). "오디오 버킷은 만들지 않습니다"(`04:1012`), `turns`에 `audio_path` 계열 컬럼 없음(`04:465`), 오디오를 저장하자는 서술 **0건**. 서버 쪽 이중 방어로 #9가 `multipart/form-data`·`audio/*`를 **415로 거부**(`05:172-173`). `storage.objects` 정책 4개가 `(storage.foldername(name))[1] = auth.uid()`로 소유자만 허용 |

**추가 확인(전부 양호):** 소유권 검사를 `admin.ts`가 아니라 `server.ts`(anon+쿠키)로 읽어서 한다는 규약(`05:444`), 남의 리소스와 없는 리소스를 똑같이 404로 답해 존재 여부 누출을 막는 규약(`05:446`), API 라우트를 302 리다이렉트하지 않고 항상 JSON 401을 주는 규약(`05:427`), Preview 환경이 운영 DB를 가리키지 않게 스테이징 프로젝트를 분리한 것(`05_deploy.md:106`).

---

## 4. 언어 정책 검증

| 항목 | 결과 |
|---|---|
| `_workspace/` 산출물이 한국어 | **통과.** 17개 파일 전부 한국어 서술. 영어는 코드 식별자·SQL·JSON 스키마·경로에 한정 |
| 런타임 프롬프트 4종이 한국어 | **통과.** `02_prompts/{interviewer,evaluator,coach,planner}.md` 전부 한국어. 시스템 프롬프트 본문·오류 문구·`messageKo` 계열 모두 한국어 |
| 사용자 노출 카피가 한국어 | **통과.** `06_ui_plan.md`의 화면 문구, `05_api_contract.md:872`의 오류 `message`, `failureReason`의 한국어 매핑 규약(`05:848`) |
| **코드 식별자가 한국어로 번역된 곳** | **위반 0건 (통과).** status 11개·부속 enum 12종·축 5개·4상태·라우트 경로·훅 이름 34개·컬럼명 전부 영어. `05:19-21`·`05:63`·`01_rubric.md:5`·`01_state_machine.md:5`가 "번역 금지"를 각각 명문화 |
| status 문자열 ↔ DB CHECK 문자 단위 일치 | **통과** (기계 대조 #1) |

**언어 정책 위반 없음.**

---

## 5. 미검증 항목 (통과가 **아닙니다**)

코드가 존재하지 않아 검증 자체가 불가능한 항목입니다. 구현 착수 후 재검증 대상입니다.

- [ ] 훅의 **실제 언랩 코드**가 3절 표의 "언랩" 열과 일치하는지 — 지금은 문서 ↔ 문서만 대조했습니다
- [ ] `src/lib/session/transitions.ts`가 전이 표와 문자 단위로 같은지
- [ ] `admin.ts`가 클라이언트 번들에 들어가지 않는지(import 그래프 추적)
- [ ] `package.json`에 shadcn 외 UI 라이브러리가 없는지 — **`sonner` 채택 여부가 `06_ui_plan.md:1140`에서 미결이므로 현재 판정 불가** `[확인 필요]`
- [ ] 하드코딩 색(`#`, `rgb(`, `bg-[`) 부재 전역 grep
- [ ] `quote_start`를 Postgres 문자 함수에 넣는 쿼리 부재(`05:542` R3 함정)
- [ ] `utterance_chunk.text`에 `<<<`가 새지 않는지(M1~M8 구현 검증)
- [ ] `score_card_viewed`가 축당 정확히 1회 전송되는지(지표 5 분모)
- [ ] `persona-meta.ts` 상수가 `01_state_machine.md` 3절 표(4·4 / 6·2)와 같은지
- [ ] Realtime 페이로드(snake_case)를 렌더링하는 코드가 없는지(E1 위반)
- [ ] RLS 정책의 **실제 동작** — 정책 SQL은 문서상 정합하나 실행 검증은 불가
- [ ] Vercel 무료 플랜 실행 시간 상한·크론 최소 주기 `[확인 필요]`(`05_api_contract.md:947`, `05_deploy.md` 3절) — I2 `maxDuration 60`이 성립하는지가 여기 걸림
- [ ] 선택 모델의 실제 무료 티어 RPM/RPD/TPM `[확인 필요]`(`00_input/decisions.md:181`)
- [ ] 선택 모델이 JSON Schema의 `minLength`/`minItems`를 어디까지 강제하는지 `[확인 필요]`
- [ ] 브라우저별 STT/TTS 실측 V1~V5(`03_voice_pipeline.md:892`)

---

## 6. 소유자별 조치 요약

| 소유자 | 조치 |
|---|---|
| `vercel-platform-engineer` | **F1**(D18: #16을 `failed` 재시도 전용으로 좁히고 서버 자동 등록 경로 3곳 명시), **F2**(cancel 엔드포인트 신설 + `GET /api/sessions` 기본 필터), **F3**(#17 응답에 `myFeedback`/`myDisputes`), **F4**(`GET /api/documents/[documentId]` + `linkedSessionCount` 신설), F6, F8, F10 |
| `shadcn-ui-engineer` | **F1**(8.1절 자동 호출 제거), **F2**(폐기 = 취소, 삭제와 분리), **F3**·**F4**(14절 §1·§2를 확정 결정으로 교체), F11, F13, F14 |
| `ai-interview-architect` | **F5**(`improvement` NULL 허용으로 5.5·5.6·9·10절 갱신), **F7**(`utterance_done`에 `sessionStatus` 추가), F9(6.3절에 t=0 정의) |
| `supabase-engineer` | **F6**(`to_status` 규약 명문화 또는 nullable 완화), F16 |
| `voice-pipeline-engineer` | **F9**(D14·D15·D16 확정 반영, 8.2절·16절 정리) |
| `product-architect` | **F2**·**F12**(취소된 세션의 목록 노출을 제품 스펙에 반영), F8, F15 |

> 전체 결정 기록: [`00_input/decisions.md`](00_input/decisions.md)
