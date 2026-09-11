# QA 리포트 — 설계 문서 경계면 정합성 검증 (2차 · **3차 재검증 반영 2026-09-11**)

> 소유: `qa-inspector` · 대상: `_workspace/` 전 산출물 (2026-09-10 18:46 시점) · 기준: `00_input/decisions.md`(확정 결정 **30건**)
> **코드가 아직 없으므로 문서 ↔ 문서 경계면만 검증했습니다.** 런타임 검증은 전부 6절 "미검증"에 있습니다.
> 이 리포트는 **어떤 문서도 수정하지 않았습니다.** 각 항목의 "고칠 쪽"이 소유자입니다.
> 1차 리포트(2026-09-09, critical 2·high 6)를 **갱신**한 문서입니다. 1차 항목의 해소 여부는 5절.
>
> **2026-09-11 3차 재검증 반영.** 타 에이전트들이 보고한 G1~G4 해소 주장을 **QA가 파일 현재 상태를 직접 다시 읽어**
> 독립 확인했습니다(보고 전달이 아니라 재검증입니다). **네 건 모두 확인 — 종결.** 같은 기회에 medium·low도 훑어
> **G5·G6·G10·G11 종결**을 확인했고, 그 시점엔 **G7·G8·G9가 2차 시점 그대로 열려 있음**을 확인했습니다.
> G4의 라이브 SQL 대조는 **이 리포트에서 처음으로 코드를 읽은 항목**입니다
> (`supabase/migrations/20260910000100_ai_quota.sql` — 그 밖의 런타임 항목은 여전히 6절 "미검증").
>
> **[2026-09-11 후속 갱신] G7·G8·G9도 전부 종결.** `product-architect`(G7, `01_rubric.md` 총점 자릿수
> 명시), `ai-interview-architect`(G8, `utterance_done.sessionStatus`를 `StreamSessionStatus`로 좁힘),
> `supabase-engineer`(G9, `evaluations.provider`와 `user_api_keys.provider` 혼동 정정)가 각각 조치했고,
> QA가 다시 직접 대조해 확인했습니다. **2차 미결 항목 11건이 이제 전부 종결됐습니다.**

## 요약

> **2026-09-11 최종 — 2차 QA의 미결 11건(high 4 · medium 3 · low 4) 전부 종결.**
> high는 G1~G4, medium은 G5~G7, low는 G8~G11 — 아래 종결 현황 표와 4·7절에 소유자별 근거가 있습니다.
> 전부 문서 정합성 항목이었고 런타임 위험이 있는 항목은 아니었습니다(런타임 검증은 여전히 6절 "미검증").

| 심각도 | 2차 건수 | 1차 대비 | **3차 재검증(2026-09-11) 종결 현황** |
|---|---|---|---|
| critical | **0** | 2 → 0 (**둘 다 해소**) | — |
| high | **4** | 6 → 4 (1차 6건 전부 해소, **신규 4건**) | **4 / 4 종결** ✅ G1·G2·G3·G4 |
| medium | 3 | | **3 / 3 종결** — G5·G6 ✅ / **G7 ✅종결(2026-09-11 `product-architect` 조치)** |
| low | 4 | | **4 / 4 종결** — G8·G10·G11 ✅ / **G9 ✅종결(2026-09-11 `supabase-engineer` 조치)** |

**3차 재검증의 성격.** 이번 라운드는 새 대조가 아니라 **타 에이전트 보고의 독립 확인**입니다.
네 건의 high 주장(G1~G4)은 **전부 파일 현재 상태와 일치**했습니다. 다만 함께 확인한 medium·low에서
**G7·G8·G9가 2차 리포트 작성 시점 그대로**임을 확인했으므로, "2차 미결 항목 전부 종결"이라는
요약은 **쓰지 않았습니다.** 남은 3건은 전부 런타임 위험이 없는 문서 정합성 항목이며 소유자는 7절에 있습니다.

기계적 대조 **10개 항목 중 6개 통과 / 1개 부분 실패 / 3개 실패** (2차 시점).
→ **2026-09-11 3차 재검증 기준 10개 전부 통과** — #2는 G5 종결로, #8은 G4 종결로, #9는 G1·G2 종결로,
#10은 G3 종결로 각각 실패 사유가 사라졌습니다. 각 항목의 "결과" 칸에 재검증 표시를 달았습니다.
보안 검증 **전 항목 통과**(RLS 17개 테이블, 키 원문 노출 경로 0, 공용 키 폴백 경로 0).
언어 정책 **위반 0건** — 코드 식별자 한국어 번역 **0건**.

**이번 라운드의 성격이 1차와 다릅니다.** 1차의 결함은 "확정 결정이 하위 문서에 아예 도달하지 않은 것"이었고,
2차의 결함은 전부 **같은 날 갱신 순서에서 뒤처진 문서**입니다 — `04`·`05`·`06`은 18:42~18:46에 갱신됐고
`02_ai_architecture.md`(D30 미반영)·`02_ai_contracts.md`(D28 미반영)·`01_domain_model.md`(09-09 이후 무갱신)가
그 파도를 타지 못했습니다. **critical이 없는 이유**는 D27~D30의 핵심 경로(재원 분기·예약 게이트·키 취급·동의 가드)가
`04`·`05`·`06` 세 문서에서 문자 단위로 일치하기 때문입니다.

---

## 1. 발견 항목

### critical

**없습니다.** 1차의 F1(평가 시작 주체)·F2(`canceled` 전이 부재)는 모두 해소됐고, D27~D30 도입으로
새로 생긴 critical은 없습니다. 근거는 5절·2절.

### high

> **✅ G1~G4 전부 종결 (2026-09-11 3차 재검증).** 아래 표는 **2차 시점의 기록을 그대로 보존**한 것이고,
> 각 항목의 종결 근거는 바로 아래 "high 종결 확인" 표에 있습니다. 두 표를 함께 읽으세요.

#### high 종결 확인 (2026-09-11 · QA 독립 재검증)

| # | 종결 | 실제로 어떻게 해소됐는가 | QA가 확인한 현재 상태 |
|---|---|---|---|
| **G1** | ✅ **종결** | **이 세션 이전에 이미 해소** — PR #4(`3e03382`, 2026-09-11 머지)에 포함돼 커밋돼 있었습니다. 2차 리포트가 커밋 전 작업본을 봤던 항목입니다 | `02_ai_contracts.md` 3.5절 SSE 이벤트 표의 `stream_error.code`가 **5종**(`llm_timeout`·`llm_rate_limited`·`llm_failed`·`byok_key_invalid`·`byok_quota_exhausted`)이고, 바로 아래에 **코드 5종 전용 표**(발생 조건 / `retryable` / 세션 결과)가 신설돼 있습니다. `byok_*` 2종은 `retryable: false` 고정, `byok_quota_exhausted`는 재개 가능 시각 없음까지 명문화. **소비 측도 일치** — `05_api_contract.md` 5.2절과 `06_ui_plan.md` 3.3절(`ErrorCode` 유니온)이 **같은 5종**이고, UI가 4.14.2·4.14.3을 이 두 코드로 분기합니다. `git blame` 확인 결과 해당 줄의 커밋은 `3e03382` |
| **G2** | ✅ **종결** | **분기 로직 자체는 이 세션 이전에 해소**(`06_ui_plan.md` 변경 로그 "2026-09-10 QA 2차 G2 대응"). **2026-09-11 오늘의 편집은 인용 복구뿐** — D34로 `05_api_contract.md`의 줄이 밀려 `:1512`·`:1530` 인용이 엉뚱한 타입 정의를 가리키고 있던 것을 **절 번호 인용으로 교체**했습니다(분기 로직은 손대지 않음) | `06_ui_plan.md` 4.4절이 **`error.code` 직접 `switch`** 이고 머리에 **"소거법 금지"** 를 명문으로 박았습니다. 오류 표에 **409 `trial_reservation_exists`** 행이 실재하고, 목적지는 **`details.existingSessionId` 하나뿐**. **`activeSessions` 폴백은 실제로 사라졌습니다** — 문서 전역 grep 결과 남은 `activeSessions`는 `useDashboard`의 자기 응답 필드(3.2절)와 4.9절 분류 서술 **2곳뿐**이고 D30 경로에는 없습니다. `existingSessionId`가 비면 링크를 만들지 않고 일반 오류로 떨어뜨린다는 규칙까지 명시. 14절 §5·16절 #10 **둘 다 `~~취소선~~` + ✅해소**로 닫혀 있음. **복구된 인용도 전부 실재 확인** — `05_api_contract.md` 4.7.6절(D30 전용 절)·13절 오류 표·13절 응답 예시(`existingSessionId`는 항상 채워짐, `null` 아님)가 모두 존재 |
| **G3** | ✅ **종결** | **이 세션 이전, 계약 문서의 앞선 변경 로그 라운드에서 해소**(`05_api_contract.md` 변경 로그가 "**G3** — 4.6절 전수 대응 표를 33행 → 35행으로 확장"으로 자체 기록) | 4.6절 제목이 **"전이 표 35행 ↔ 엔드포인트 전수 대응"** 이고, 표를 실제로 세어 **1~35행 전부 존재**함을 확인했습니다(기계 카운트). `in_progress → paused`가 **5행**(13 사용자 · 14 레이트 리밋 · **15 `byok_key_invalid`** · **16 `byok_quota_exhausted`** · 17 연결 유실)이고 **신규 2행의 담당이 둘 다 `#9`** 로 채워져 있습니다 — 담당 열이 비어 있지 않습니다. 두 행 모두 **`normalizeProviderError` → 10.2절**을 교차 참조. **원본 쪽도 일치** — `01_state_machine.md` 2절 전이 표에 `in_progress → paused` 5행이 전부 실재. ※ 교차 참조된 `normalizeProviderError`의 10.2절은 `01_state_machine.md`가 아니라 **`05_api_contract.md` 10.2절**(사용자 키 오류 3분류)입니다 — 문서 인용은 정확하고, 보고 요약 쪽의 문서명이 어긋났을 뿐입니다 |
| **G4** | ✅ **종결** | **대부분 D34 이전에 이미 해소**(4인자 시그니처·가드 순서·예외 3종). **2026-09-11 오늘 메운 실제 공백은 1건** — 13.6.1절 요약 표에만 **휴면 버킷 0-스킵 로직**이 빠져 있던 것 | 8.3.5절 SQL이 **4인자**(`p_session_id, p_quota_date, p_request, p_limits`)이고 진입부 주석이 **① 재원 가드(D28) → ② 동시 예약 가드(D30, `pg_advisory_xact_lock` + `trial_reservation_exists:<session_id>`) → ③ 버킷 루프** 순서를 그대로 적으며 "**순서를 바꾸지 말 것**"까지 못박았습니다. **예외 3종 매핑 표**(`quota_exhausted`→503 / `quota_not_applicable`→내부 오류 / `trial_reservation_exists`→409)도 실재. **오늘의 보강 확인** — 13.6.1절 시그니처 표에 "**버킷마다 맨 먼저 요청량을 보고 `<= 0`이면 `continue`로 건너뜁니다**"가 D34 근거(휴면 버킷에 `limit_calls = 0` 원장 행이 생겨 매번 `quota_exhausted:pro`로 전체 롤백)와 함께 추가됐습니다. **라이브 SQL도 직접 확인** — `supabase/migrations/20260910000100_ai_quota.sql:136`에 `continue when v_target <= 0;` 실재하고, `04_data_layer.md` 3.14.1절(및 :60·:62)도 같은 불변식을 기술 |

> **커밋 상태 주의.** G2·G4의 오늘 편집분은 **아직 커밋되지 않은 작업본**입니다
> (`_workspace/06_ui_plan.md`, `_workspace/02_ai_architecture.md`가 `git status`에 modified).
> **PR로 머지되기 전까지는 `main`에 없습니다** — 소유자는 `git-github-workflow`에 따라 올려 주세요.

#### 2차 시점 기록 (보존)

| # | 심각도 | 경계 | 위치 | 현재 상태 | 기대 상태 | 고칠 쪽 |
|---|---|---|---|---|---|---|
| ~~**G1**~~ ✅종결 | **high** | AI 계약(원본) ↔ API/UI (SSE) | `02_ai_contracts.md:490` (3.5절 `stream_error` 행) ↔ `05_api_contract.md:626`, `06_ui_plan.md:39`·`:357`·`:1053-1054` | 원본의 `stream_error.code` 유니온이 **`llm_timeout`·`llm_rate_limited`·`llm_failed` 3종뿐**입니다. `05`·`06`은 **5종**(`byok_key_invalid`·`byok_quota_exhausted` 추가)을 전제하고, UI는 그 두 코드로 4.14.2·4.14.3 화면을 분기합니다. `02_ai_contracts.md`는 D27~D30 반영이 **전혀 없습니다**(`byok` 문자열 grep **0건**, 최종 갱신 09-09) | `05_api_contract.md:179`가 "3.5절이 원본"이라고 선언했으므로 **원본에 2종을 추가**해야 합니다. 지금 원본대로 구현하면 `byok` 세션이 키 실패로 `paused`가 됐는데 **SSE로 아무 코드도 나가지 않아** UI가 4.14.2·4.14.3을 그릴 수 없고, 사용자는 이유 없이 멈춘 면접만 봅니다 | `ai-interview-architect` |
| ~~**G2**~~ ✅종결 | **high** | 결정 D30 ↔ UI 분기 | `06_ui_plan.md:588-592`(오류 4종 표), `:606-608`(폴백), `:1926`(14절 §5), `:1985`(16절 #10), `:2003` ↔ `05_api_contract.md:1512`, `:1530-1533`, `:1583` | **UI가 아직 소거법을 씁니다.** `usePrepareSession`의 오류 표에 `trial_reservation_exists`가 없고, "그 밖의 409를 D30으로 간주" + `useDashboard.activeSessions`에서 세션을 **추측**해 링크를 만듭니다. 14절 §5·16절 #10이 "계약에 코드가 아직 없다"를 **미해결로** 기록. 그러나 계약은 이미 **409 `trial_reservation_exists` + `details.existingSessionId`(항상 채워짐)** 를 확정했습니다 | `code === 'trial_reservation_exists'`로 **직접 분기**하고 목적지를 `details.existingSessionId`로만 만듭니다. `activeSessions` 폴백을 폐기하세요 — `06:608`이 스스로 적었듯 **폴백이 틀리면 사용자를 엉뚱한 세션으로 보냅니다.** 14절 §5·16절 #10은 "해소"로 닫습니다 | `shadcn-ui-engineer` |
| ~~**G3**~~ ✅종결 | **high** | 상태 전이 ↔ 엔드포인트 | `05_api_contract.md:289`(제목 "전이 표 **33행**"), `:302-307`(11~15행) ↔ `01_state_machine.md:139-140` | 전이 표에 **`in_progress → paused` 행이 5개**(사용자·`rate_limited`·**`byok_key_invalid`**·**`byok_quota_exhausted`**·`connection_lost`)인데, 4.6절 전수 대응 표는 **3개만** 담고(13·14·15번) 총계도 33행에 멈춰 있습니다. 신규 2행에 **담당 열이 비어 있습니다** | 4.6절을 **35행**으로 갱신하고 신규 2행의 담당을 **#9 (10.2절 `normalizeProviderError` → `key_invalid` / `key_quota_exhausted`)** 로 명시. 지금은 `transitions.ts`를 4.6절에서 옮겨 적는 구현자가 두 전이를 빠뜨려, 키 실패 세션이 **409 `invalid_transition`으로 `paused`가 되지 못하고 `in_progress`에 갇힙니다** | `vercel-platform-engineer` |
| ~~**G4**~~ ✅종결 | **high** | DB 함수 시그니처 ↔ 명세 원본 | `02_ai_architecture.md:762-766`(SQL), `:1296`(13.6.1절 시그니처 표), `:670`(호출 예시) ↔ `04_data_layer.md:971`, `05_api_contract.md:369` | `reserve_session_quota`가 원본에서는 **3인자**(`p_session_id, p_quota_date, p_request`)이고 `04`·`05`는 **4인자**(`+ p_limits jsonb`)입니다. 더 큰 문제는 **D30이 `02_ai_architecture.md`에 전혀 없다는 것**입니다 — `D30` 문자열 grep **0건**, 동시 예약 가드·advisory lock·`trial_reservation_exists` 예외가 8.3.5절·13.6.1절 어디에도 없습니다. `decisions.md:40`은 D30의 전파 대상으로 이 문서를 명시합니다 | 8.3.5절 SQL과 13.6.1절 표를 **`p_limits` 포함 4인자**로, 그리고 **재원 가드(D28)·동시 예약 가드(D30)** 를 진입부 순서(`04_data_layer.md:1000-1024`)대로 반영. `04`의 R8 회신(`04:2206`)과 `05`의 불일치 #10(`05:1616`)이 이미 "04를 따른다"로 정리했으므로 **판단이 아니라 옮겨 적기**입니다 | `ai-interview-architect` |

**G1~G4의 공통 성질.** 넷 다 **"하위 문서가 앞서고 원본이 뒤처진" 방향**입니다. 1차와 반대 방향이며,
그래서 실제 사용자 피해는 1차보다 작습니다(`05`·`06`을 보고 구현하면 대부분 맞습니다). 다만
`05_api_contract.md:179`가 SSE의 원본을 `02_ai_contracts.md` 3.5절로, `04_data_layer.md:2206`이 함수 명세의
원본을 `02_ai_architecture.md` 13.6.1절로 각각 지목하고 있어, **원본을 먼저 여는 구현자가 틀린 것을 봅니다.**

### medium

> **2026-09-11 3차 재검증.** G5 ✅종결 · G6 ✅종결 · G7 미해소.
> **2026-09-11 갱신 — G7도 `product-architect` 조치로 ✅종결. medium 3건 전부 종결입니다.** 근거는 표 아래.

| # | 심각도 | 경계 | 위치 | 현재 상태 | 기대 상태 | 고칠 쪽 |
|---|---|---|---|---|---|---|
| ~~**G5**~~ ✅종결 | medium | 도메인 모델 ↔ 전 문서 | `01_domain_model.md:98`, `:54-220`(3절 엔티티 11개), 문서 전역 | 09-09 이후 **무갱신**입니다. `pause_reason`이 **3개**(`user_requested`/`rate_limited`/`connection_lost`)로 남아 있고, `funding_source` 컬럼과 신규 테이블 5개(`ai_quota_ledger`·`ai_quota_reservations`·`user_api_keys`·`trial_consents`·`account_events`)가 **하나도 없습니다.** `:48`은 "모든 테이블이 사용자 데이터를 담으므로 예외 없이 RLS"라고 적는데, 신규 5개 중 4개는 **정책 0개(서버 전용)** 라 이 서술이 오도합니다 | CLAUDE.md 라우팅 표가 "DB 스키마 설계 전 `01_domain_model.md`를 읽으라"고 지시하므로 스키마 작업자가 **3개짜리 `pause_reason`을 먼저 봅니다.** 최소한 1절에 "D27~D30 이후 원본은 `01_state_machine.md`·`04_data_layer.md`"를 명시하고 `:98`의 3개 목록에 갱신 표시를 다세요. **완화 요인**: `:5`가 이미 "충돌하면 상태 머신 문서가 우선"을 선언 | `product-architect` |
| ~~**G6**~~ ✅종결 | medium | 비전이 이벤트 규약 (1차 F6 잔여) | `04_data_layer.md:650`, `:656`, `:666-672` ↔ `05_api_contract.md:263-287`(4.5절), `:1593`(R-A) | `05`는 **"비전이 이벤트는 `from_status = to_status = 그 시점 세션의 status`"** 로 규약을 확정하고, `:1593` R-A로 `supabase-engineer`에게 **`04` 3.6절에 명문화**를 요청했습니다. `04`는 09-10에 갱신됐지만 3.6절에 이 규약이 **여전히 없고**, 오히려 D27로 비전이 `event_name` **3종**(`quota_reserved`·`quota_released`·`quota_overflow`)이 **추가되어 적용 범위만 넓어졌습니다** | `04` 3.6절에 규약 한 문단 추가. 없으면 #6 `prepare`의 **첫 `quota_reserved` INSERT가 `to_status` not-null 위반**으로 실패하고, 예약 성공 트랜잭션이 통째로 롤백됩니다 | `supabase-engineer` |
| ~~**G7**~~ ✅**종결** | medium | 총점 자릿수 (1차 F15 잔여) | `01_rubric.md` 3절(총점 서술) vs `00_input/decisions.md` D1 / `06_ui_plan.md` | **2026-09-11 `product-architect` 조치 완료** — 3절에 "**자릿수 — 기록 2자리 / 표시 1자리 (D1)**" 블록이 추가돼 저장(`numeric(3,2)`)·표시(소수 1자리 반올림, 재계산 금지)·`NULL` 표기가 명시됐습니다 | — (`06_ui_plan.md:1385`와 문자 단위 정합) | `product-architect` |

**G5·G6 종결 근거 (2026-09-11 재확인).**
- **G5 ✅** — `01_domain_model.md`가 갱신됐습니다. `pause_reason`이 **5종**(`user_requested`·`rate_limited`·`connection_lost`·`byok_key_invalid`·`byok_quota_exhausted`, D28 표기)으로 확장됐고, `funding_source`(`trial_shared`\|`byok`, D28) 행이 추가됐으며, **신규 테이블 5개가 전부 엔티티 표에 등재**됐습니다(`user_api_keys`·`trial_consents`·`ai_quota_ledger`·`ai_quota_reservations`·`account_events`). `resumable_after`에 "`byok_quota_exhausted`에는 채우지 않는다"까지 반영. **잔여 흠 1건(결함 아님)**: 이 문서의 변경 로그에는 아직 `2026-09-09 최초 작성` 한 줄뿐이라 **갱신 이력이 기록되지 않았습니다** — 다음 편집 때 한 줄 추가를 권합니다(`product-architect`).
- **G6 ✅** — `04_data_layer.md` 3.6절에 규약이 명문화됐습니다: **"비전이 이벤트는 `from_status = to_status = 그 시점 세션의 `status`"**. `05_api_contract.md` R-A 요청이 회신된 것으로 확인. 이로써 **1차 F6도 "부분 해소" → 완전 해소**입니다(5절 참조).
- **G7 ✅** *(2026-09-11 `product-architect` 조치 후 갱신)* — `01_rubric.md` 3절에 **"자릿수 — 기록 2자리 / 표시 1자리 (D1)"** 블록이 추가됐습니다: 기록은 `numeric(3,2)`로 계산 직후 1회 반올림, 표시는 소수 1자리로 반올림하되 **재계산 금지**, `overall_score = NULL`은 "—". `06_ui_plan.md:1385`·D1과 정합하며 **1차 F15도 이로써 완전 해소**입니다.

### low

> **2026-09-11 3차 재검증.** G10 ✅종결 · G11 ✅종결 · **G8·G9 미해소(그대로 열려 있습니다)**. 근거는 표 아래.
> **2026-09-11 후속 조치.** **G8 ✅종결**(`ai-interview-architect` — 2값 부분집합 `StreamSessionStatus` 신설로 좁힘).
> **G9 ✅종결**(`supabase-engineer` — 3.7절 `evaluations.provider` 설명을 D11 기준으로 정정). **low 4건 전부 종결입니다.**

| # | 심각도 | 경계 | 위치 | 현재 상태 | 기대 상태 | 고칠 쪽 |
|---|---|---|---|---|---|---|
| **G8** ✅ **종결** | low | SSE 타입 폭 | `02_ai_contracts.md` 3.5절 vs `05_api_contract.md` 5.2절 | `utterance_done.sessionStatus`가 원본은 **`"in_progress"\|"completed"` 2값**, 계약은 **`SessionStatus` 11값**. UI(`06:363`)는 `=== 'completed'`로만 분기 | **좁히는 쪽으로 종결(2026-09-11).** `05`에 `StreamSessionStatus = Extract<SessionStatus, 'in_progress' \| 'completed'>`를 신설해 5.2절 필드 타입으로 쓰고, `02` 3.5절에 "의도된 부분집합" 근거를 명시 | `ai-interview-architect` + `vercel-platform-engineer` |
| ~~**G9**~~ ✅종결 | low | D11 ↔ 예시 값 (1차 F16 잔여) | `04_data_layer.md` 3.7절 **`evaluations.provider`** 컬럼 설명 | `provider` 설명 예시가 `anthropic` / `openai`였고 D11은 **Google 단독** | 예시를 `google`로 교체 | `supabase-engineer` |
| ~~**G10**~~ ✅종결 | low | 해소된 항목이 열린 채 | `06_ui_plan.md` 16절 #11 | "13.6.3절 금칙어에 '한도'가 있어 확정 문안과 충돌 — `ai-interview-architect`가 예외를 명시해 달라"가 미해결로 기록. 그러나 `02_ai_architecture.md:1417-1424`가 **이미 예외 2건("API 키" 허용 / "한도"는 사용자 본인 키 문맥만)을 명문화**했습니다 | 16절 #11을 "해소"로 닫기 | `shadcn-ui-engineer` |
| ~~**G11**~~ ✅종결 | low | 전이 표 총계 표기 | `05_api_contract.md` 4.6절 | "전이 표 33행"이 세 곳에 남아 있음 | G3과 함께 35행으로. 숫자 자체가 G3의 원인 표지입니다 | `vercel-platform-engineer` |

**G8~G11 종결/미해소 근거 (2026-09-11 재확인).**
- **G8 ✅종결 (2026-09-11, `ai-interview-architect`)** — **넓히지 않고 좁혀서** 해소했습니다. `01_state_machine.md` 2절로 확인한 결과 스트림은 `in_progress`에서만 시작하고, `paused`(3사유)·`failed`는 `stream_error`로 끝나 `utterance_done`이 아예 나가지 않으며, `canceled`·`abandoned`는 스트림 밖 경로, `evaluating` 이후는 `completed` 전이의 서버 부작용이라 **2값은 상태 머신이 강제하는 결과**입니다. 조치: `05_api_contract.md` 12절에 `StreamSessionStatus = Extract<SessionStatus, 'in_progress' | 'completed'>`를 신설하고 5.2절 `utterance_done` 필드 타입을 `SessionStatus` → `StreamSessionStatus`로 교체(세션 객체의 `status`는 11값 그대로), `02_ai_contracts.md` 3.5절에는 "의도된 부분집합이며 폭을 맞추려 넓히지 말 것"이라는 근거를 명시했습니다.
- **G9 ✅종결 (2026-09-11 `supabase-engineer` 조치)** — `04_data_layer.md` 3.7절 `evaluations.provider` 설명에서 `anthropic` / `openai` 예시를 걷어내고 **"D11에 따라 현재 기록되는 값은 `google` 하나뿐"** 으로 정정했습니다. 스키마·마이그레이션 변경은 없습니다.
  - **G9 지적의 근거 부분에 컬럼 혼동이 있었습니다(조치하며 바로잡음).** 지적된 설명문은 3.7절 **`evaluations.provider`** 의 것이고, 근거로 인용된 `check (provider in ('google'))`는 3.15절 **`user_api_keys.provider`** 의 제약입니다. **서로 다른 컬럼입니다.** `evaluations.provider`의 실제 제약은 `char_length(provider) <= 40` 뿐이라 "예시와 CHECK가 어긋난다"는 관계는 애초에 없었고, 어긋난 것은 **예시와 D11**이었습니다. 이 구분을 문서에 명문화해 재발을 막았습니다.
  - **BYOK 다중 프로바이더 공백은 없습니다(확인함).** `user_api_keys.provider in ('google')`은 의도된 좁힘입니다 — 3.15절 제목이 "사용자 **Gemini** API 키"이고, `02_ai_architecture.md` 4.4절의 역할별 모델 매핑(`roles.ts`)이 전부 Gemini 모델이라 Anthropic·OpenAI 키를 받아도 **부를 모델이 없습니다.** D28은 "본인 Gemini 키로 정원 제한을 벗어난다"이지 "아무 프로바이더나 가져온다"가 아닙니다. 넓힐 필요가 생기는 시점은 `roles.ts`에 비-Gemini 모델이 들어올 때이며, 그때는 **새 ALTER 마이그레이션** 한 줄입니다.
  - **라이브 마이그레이션 대조.** `supabase/migrations/20260909000700_evaluations.sql:33-34`(`evaluations_provider_len` = 길이 제한만), `20260910000300_user_api_keys_and_account_events.sql:12·23`(`default 'google'` + `check (provider in ('google'))`) — **둘 다 문서와 일치**하며 손댈 것이 없습니다.
- **G10 ✅** — `06_ui_plan.md` 16절 #11이 `~~11~~` + **✅해소**로 닫혔습니다. `02_ai_architecture.md` 13.6.3절의 금칙어 예외 2건("API 키" 허용 / "한도"는 사용자 본인 키 문맥만)이 명문화됐다는 근거까지 기재.
- **G11 ✅** — 4.6절 제목이 **"전이 표 35행"** 이고 본문이 "33행 → 35행이 되었고 이 표도 35행으로 맞췄습니다"로 정정됐습니다. 문서에 남은 `33행` 문자열 2건은 **날짜가 박힌 과거 변경 로그 항목과 2차 QA 회신 기록**이라 이력으로 남는 것이 정상입니다(살아 있는 주장이 아님).

---

## 2. 기계적 대조 10개 항목 — 통과/실패

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | **상태 값 11개** 문자 단위 | **통과** | `01_state_machine.md:15-25` ↔ `04_data_layer.md:390-402`(CHECK) ↔ `05_api_contract.md:1188-1190`(`SessionStatus`) ↔ `06_ui_plan.md:113-118`(`route-for-status`). 11개 전부 문자·순서 동일. `cancelled` 오타 0건. `session_events.from_status/to_status`도 같은 11개(`04:648-656`). **D27~D30으로 상태 값은 하나도 바뀌지 않았습니다**(`01_state_machine.md:361`) |
| 2 | **`pause_reason` 5개** 네 문서 전부 | ~~부분 실패 → G5~~ → **통과 (2026-09-11 재검증 — `01_domain_model.md`가 5종으로 갱신됨)** | `01_state_machine.md:38-44` ↔ `04_data_layer.md:96-104` ↔ `04:418-426`(CHECK SQL) ↔ `05_api_contract.md:1192-1193`(`PauseReason`) ↔ `06_ui_plan.md:703`·`:707-717`(재개 패널 5분기) — **다섯 곳이 문자 단위로 일치하고 순서까지 같습니다.** 신규 2종 `byok_key_invalid`·`byok_quota_exhausted` 포함. **실패 사유는 `01_domain_model.md:98`이 3개에 멈춘 것 하나뿐**(G5) |
| 3 | **`funding_source` 2개** | **통과** | `01_state_machine.md:84-88` ↔ `04_data_layer.md:110-114`, `:378`(not null, 기본값 없음), `:430`(CHECK) ↔ `05_api_contract.md:1194`(`FundingSource`), `:1214`(`Session.fundingSource`, nullable 아님) ↔ `06_ui_plan.md:36`·`:1649`. `trial_shared`/`byok` 문자 단위 일치. **불변성이 DB 트리거로 강제**됨(`04:456-458`) |
| 4 | **루브릭 축 5개 / 음성 UI 4상태** | **통과** | 축: `01_rubric.md:15-19` ↔ `02_ai_contracts.md`(`$defs/axis`) ↔ `04_data_layer.md:754`(CHECK) ↔ `05_api_contract.md:1200`(`Axis`) ↔ **`06_ui_plan.md:1373-1377`(신설 `axis-meta.ts` 표) — 1차 F14 해소.** 4상태: `03_voice_pipeline.md:719` ↔ `06_ui_plan.md`. `listening`/`transcribing`/`thinking`/`speaking` 일치 |
| 5 | **라우트** | **통과** | `01_product_spec.md:349-361`(12개 + `[later]` 1개) ↔ `06_ui_plan.md:63-90`(파일 트리) ↔ `:92-104`(URL 표 12행). **`/settings/api-key` 양쪽 신설 확인.** 라우트 그룹 `(marketing)`/`(auth)`/`(app)`은 URL에서 제거된 채 표기. `route-for-status`(`06:113-118`)의 목적지 6종이 전부 실재 라우트이고 `canceled → /sessions?includeCanceled=true`가 계약 4.3절 쿼리와 일치 |
| 6 | **API 응답 shape ↔ 훅 반환 타입 (언랩)** | **통과** | `05_api_contract.md:137-180`의 엔드포인트 **41개**를 `06_ui_plan.md:212-281`의 훅과 이름 diff — **누락 0건**(스크립트 대조). 훅 총계 43개 = 41 + `useSessionRealtime`·`useVoiceSession`. **언랩 열 41건 전부 일치**: 단일 키 봉투(`{ session }`/`{ apiKey }`/`{ capacity }`/`{ consent }`/`{ document }`)는 전부 "예", 다중 키·`nextCursor` 봉투는 전부 "아니오". 신규 6개(#36~#41) 전원 단일 키 → 언랩 예. **가장 위험한 지점을 UI가 스스로 못박았습니다** — `06:283-285`가 **#39 `DELETE`만 `{ ok: true }`가 아니라 `{ apiKey }`** 라고 경고. `Capacity`·`ApiKeyStatus`·`TrialConsent` 필드도 `05:1387-1415` ↔ `06:222-224` 문자 단위 일치. 고아 엔드포인트·고아 훅 **0건** |
| 7 | **DB 컬럼 ↔ API 응답 필드 (snake↔camel)** | **통과** | 신규 5개 테이블 전수: `user_api_keys`(`04:1091-1099`) → `ApiKeyStatus`(`05:1399-1406`) — `status→keyStatus`·`key_last4→keyLast4`·`last_verified_at→lastVerifiedAt`·`last_failure_code→lastFailureCode`·`last_failure_at→lastFailureAt`. **`vault_secret_id`·`user_id`는 응답에 자리가 없음(의도)**. `trial_consents`(`04:1199-1204`) → `TrialConsent`(`05:1411-1415`) — `consent_version→consentVersion`·`granted_at→grantedAt`·`session_id→sessionId`, **`consent_text_sha256`·`user_id` 제외(의도)**. `ai_quota_*`는 응답에 나가지 않음(D27 — 잔여량 노출 금지). `interview_sessions.funding_source → Session.fundingSource`. **UI 문서에 snake_case 필드 누출 0건**(`consent_version`은 오류 코드 `consent_version_stale`의 일부일 뿐) |
| 8 | **DB 함수 시그니처 ↔ 라우트 호출** | ~~실패 → G4~~ → **통과 (2026-09-11 재검증 — 원본이 4인자·D30 반영으로 정정됨. 라이브 SQL까지 대조)** | `04_data_layer.md:971-973` ↔ `05_api_contract.md:369`: `reserve_session_quota(sessionId, quotaDate, p_request, p_limits)` **4인자 일치**, `release_session_quota(p_session_id, p_buckets, p_reason)` / `consume_session_quota(p_session_id, p_bucket, p_n)` **일치**. 예외 형식도 **`이름:값` 3종으로 통일**(`quota_exhausted:<bucket>`·`quota_not_applicable:<funding_source>`·`trial_reservation_exists:<session_id>`) → `05`가 각각 503·(내부 오류)·409로 매핑. `05:352-356`의 TS 래퍼는 **다른 계층**이라 인자가 달라도 정상. **실패 사유는 원본 `02_ai_architecture.md:762`·`:1296`이 3인자에 멈춘 것과 D30 미반영(G4)** |
| 9 | **오류 코드** | ~~실패 → G2·G1~~ → **통과 (2026-09-11 재검증 — SSE 원본 5종 반영, UI가 `trial_reservation_exists` 직접 분기)** | `05_api_contract.md:1500-1521` 13절 표에 신규 5종 전부 존재 — **503 `capacity_unavailable`**, **409 `trial_consent_required`·`consent_version_stale`·`trial_reservation_exists`·`byok_key_invalid`·`byok_quota_exhausted`**. `06_ui_plan.md:588-592`가 4종을 분기하고 `:1052-1054`가 3화면(4.14.1/2/3)을 코드로 조회. **누락은 `trial_reservation_exists` 1종(G2)** 이고, SSE 쪽은 원본 미반영(G1). 503↔429 구분(`05:1538-1541`), 503↔`keyStatus==='invalid'` 재분기(`06:1056-1063`)는 양쪽 모두 정확 |
| 10 | **상태 전이 ↔ 엔드포인트** | ~~실패 → G3~~ → **통과 (2026-09-11 재검증 — 4.6절 35행, BYOK 2행 담당 #9)** | `01_state_machine.md` 2절 전이 표(전이 33행 + `(없음)→created` + `모든 상태→행 삭제` = 35) ↔ `05_api_contract.md:289-333`(33행). **`→ canceled` 7행 전부 #33에 대응**(1차 F2 해소), **`configuring→failed` #35 대응**(1차 F8 해소), **`completed→evaluating` 주체가 서버 부작용으로 정정**(1차 F1 해소). **누락은 신규 BYOK 전이 2행**(G3). 미대응 1행(`evaluated→evaluating`)은 전이 표 자신이 `[later]`로 표시한 범위 밖 |

---

## 3. BYOK 특화 검증 (이번 라운드의 핵심)

| 검증 항목 | 결과 | 근거 |
|---|---|---|
| **키 원문 누출 경로 0** | **통과** | **4중 강제가 문서로 일관**합니다. ① 타입에 자리 없음 — `ApiKeyStatus`(`05:1399-1406`)에 키 필드 부재, DB에도 원문 컬럼 부재(`04:1091-1099`, 암호문은 `vault.secrets`). ② 방향이 한쪽뿐 — 원문은 **#38 요청 body에만** 존재하고 `PUT`이 "조회 후 편집"이 아닌 **전체 교체**인 이유가 이것(`05:485`). ③ 복호화 지점 1곳 — `resolveCallCredentials()`만 `get_user_api_key()`(service_role 전용, `04:1145-1148`에서 `anon`/`authenticated` `revoke`) 호출(`05:486`). ④ 로깅 화이트리스트 — `{ sessionId, role, bucket, fundingSource, keyFingerprint }`뿐, `keyFingerprint`는 끝 4자리(`05:487`). **URL·`localStorage`·`sessionStorage`·IndexedDB·쿠키 전부 금지가 `06:294-299`·`:987`에 명문화**되고 `?next=`에는 경로만 들어감(`06:296`). 쿼터 파라미터에 키가 없음(`p_session_id`/`p_quota_date`/`p_request`/`p_limits`). **body 로깅 미들웨어 금지**와 **400 `details.fields`에 입력값 되비침 금지**까지 명시(`05:489-491`) |
| **공용 키 폴백 금지 — 전 문서** | **통과** | 폴백을 허용하는 서술이 **어느 문서에도 없습니다**(`공용 키` 전수 grep 25건 확인 — 전부 금지·경고 문맥). 구조적 강제: `ctx`는 **선택 인자 아님**(`02:202`·`05:516`), **재시도 루프 밖에서 1회 생성**(`05:517-527` — 루프 안 생성이 "폴백 구멍"이라고 코드 주석까지), `byok`인데 `apiKey`가 비면 **호출하지 않고 즉시 실패**(`05:531`), **키가 박힌 싱글턴 금지**(`05:532`), **반대 방향(체험→사용자 키)도 금지**(`05:534`), **"체험이 남았으니 공용으로"가 정확히 금지된 동작**(`05:533`) |
| **폴백 사다리 1~4단계의 금지 위반 여부** | **통과** | 1·2단계(TTS/STT 텍스트화)는 **브라우저 내장 API라 사용자 키와 무관**하므로 `byok`에서도 그대로 동작(`01_state_machine.md:255`(규칙 4)·`05:1579`). 3단계 백오프는 **같은 `ctx`로만** 재호출(`05:529`). **4단계(`rate_limited`)는 `trial_shared` 전용**이며(`05:1111` 표), 사용자 키 실패는 4단계가 아니라 **4.5절 분기**로 갑니다(`01_state_machine.md:246-252`). 판정 순서도 안전한 방향으로 기울어져 있음(`05:1096-1102` — 애매하면 `key_invalid`가 아니라 `key_quota_exhausted`) |
| **`funding_source='byok'` 행에 `rate_limited`가 찍힐 경로** | **통과 (경로 없음 + 관측 장치 있음)** | `pause_reason='rate_limited'`를 쓰는 지점은 폴백 사다리 4단계 하나이고, 그 행은 `trial_shared` 전용으로 못박혀 있습니다(`05:1111`). 나아가 **찍히면 보안 사고로 다룬다**가 3중으로 기록됨 — `05:542-544`("이 금지가 깨졌다는 뜻"), `02_ai_architecture.md:894-896`, `05_deploy.md:413`(운영 알람). `02_ai_architecture.md:886-914`가 `rate_limited` 자체를 **정상 경로에서 나오면 안 되는 값**으로 강등 |
| **BYOK 세션의 예약 행 부재** | **통과 (3중 방어)** | ① 애플리케이션 — 원장을 만지는 **네 함수 진입부 한 곳**에만 분기(`05:349-356`, `if (fundingSource !== 'trial_shared') return NO_OP`). ② DB 함수 — `reserve_session_quota` 진입부 재원 가드가 `byok`이면 **`quota_not_applicable:byok` 예외로 행을 만들지 않음**(`04:978-982`), `consume_session_quota`는 **조용히 0 반환**(`04:989` — AI 호출 직전 경로라 예외를 던지면 분기 실수가 곧 면접 중단). ③ 관측 — `04:955`("BYOK 세션에서 이 테이블에 행이 생기면"). `05:361-364`가 "DB 함수는 **마지막 방어선이지 유일한 방어선이 아니다**"라고 명시 |
| **동의 없는 `prepare` 통과 차단 (D29)** | **통과** | 서버 가드가 `05:566-575` 순서도로 확정 — **① 동의 행(현재 버전) → ② 중복 예약 → ③ 확정 예약**. DB 트리거 `enforce_session_funding_rules`(`04:451-470`)가 마지막 방어선으로 `trial_shared` 세션이 **`created`·`configuring`·`canceled`·`failed` 외의 상태로 가는 것**을 동의 행 없이 막습니다 |
| **"현재 문구 버전"까지 확인 (R9)** | **통과** | **책임 분리가 세 문서에서 동일**합니다 — DB 트리거는 **동의 행의 존재만** 검사하고(현재 버전이 애플리케이션 상수라 DB가 알 수 없음), "**현재** 버전에 동의했는가"는 **서버 가드의 책임**(`04:479-481`, `04:2207` R9, `05:575-577`). `Capacity.requiresTrialConsent`가 "**과거 버전 동의만 있으면 `true`**"로 정의(`05:440`), UI는 `consentVersion` 하드코딩 금지(`06:240-242`). 문구 원본은 `src/lib/consent/trial-consent.ts` **한 파일**이고 라우트와 다이얼로그가 **같은 상수를 import**(`05:558-560`, `05_deploy.md:123`) |
| **D30 — 동시 예약 가드의 3계층 일관성** | ~~부분 실패 → G2·G4~~ → **통과 (2026-09-11 재검증 — UI·원본 둘 다 반영 완료)** | **DB(`04:995-1024`)**: 재원 가드 직후·버킷 루프 이전에 `pg_advisory_xact_lock(user_id 해시)` → `held` 조회 → `trial_reservation_exists:<session_id>` 예외. **같은 세션의 멱등 top-up은 통과**(`r.session_id <> p_session_id`). 부분 unique 인덱스를 기각한 근거까지 기록. **API(`05:451-465`, `:1512`, `:1530-1533`)**: 409 + `details.existingSessionId`(**항상 채워짐, null 아님**), 라우트에 사전 조회를 두지 않음(동시 요청에서 샘). **UI**: **미반영(G2)**. **원본 `02_ai_architecture.md`**: **미반영(G4)** |
| **여력 부족 화면의 키 CTA 실재** | **통과** | `06_ui_plan.md:1052`(표) — 4.14.1의 **1순위 버튼이 `[키 연결하기]`**. 4.14.1 문안(`06:1069-1076`)이 "**본인 API 키를 연결하면 지금 바로 시작할 수 있어요**"를 본문에 두고 `[키 연결하기]` `[지난 리포트 보기]` 순서. `02_ai_architecture.md:1405-1407`("D28의 유일한 이득")·`13.7.3절` 지시와 일치. 세 화면이 **원인 주체별로 분리**되고 문안은 `blocked-copy.ts` 한 곳에서 `code`로 조회(`06:1045-1047`) |
| **금칙어** | **통과** | `06_ui_plan.md`에서 "무료 티어"·"쿼터"·"티어"·"RPD"가 **사용자 노출 문안에 0건**(`:244`·`:654`·`:1120-1121`·`:1865`·`:1953`은 전부 설계 서술·금칙어 목록 자체·폰트 대역폭 메모). 예외 2건이 **양쪽 문서에서 확정**됨 — `02_ai_architecture.md:1417-1424`가 **"API 키" 허용 / "한도"는 사용자 본인 키 문맥만** 허용을 명문화하고, `06:1127`이 "**4.14.3절 한 곳에서만**"으로 좁힘. 실제로 "한도"는 `06:713`·`:1103` 두 곳(같은 문안)뿐 |
| **체험 잔여 카운터 노출 금지** | **통과** | `Capacity` 타입(`05:1387-1394`)에 **잔여량·한도·버킷 필드가 없고**, `05:1545`가 오류 `details`에도 금지. `06:244`("그 값을 요구하는 UI를 설계하지 마세요")·`06:1129`("`1/1`·`남은 횟수`·`무료 체험 잔여` 어느 것도 만들지 않습니다")·`01_product_spec.md:468` |
| **사용자 키 실패에 "내일 다시 오세요" 부재** | **통과** | `06:721`·`:1095`·`:1110`이 각각 명시적으로 금지하고 근거를 적음("우리는 사용자 계정의 리셋 시각을 모릅니다"). `01_state_machine.md:249-251`(4.5절 규칙 2), `01_product_spec.md:313`. **`availableAtIso === null`을 "내일 오세요"로 렌더 금지**(`06:238-239`)까지 별도로 못박음. `byok_quota_exhausted`에는 `resumableAfter`가 `null`이므로 **카운트다운을 렌더하지 말라**는 지시가 `06:2005`에 있음 |

---

## 4. 보안·정책 검증

| 항목 | 결과 | 근거 |
|---|---|---|
| **RLS — 17개 테이블 전부** | **통과** | `04_data_layer.md:1317`("**17개 테이블 전부** `enable row level security`. 예외 없음"), 5.2절 정책 표(`:1338-1372`)에 17개 전원 등재, 5.3절 SQL(`:1380-1460`)에 `alter table … enable row level security` 실재. 세션 하위 5개(`questions`·`session_events`·`evaluations`·`evaluation_scores`·`evaluation_citations`)는 `turns`를 대표로 한 **공통 패턴**으로 기술(`:1401-1412`) — 5.2절 표에 개별 등재되어 있어 누락 아님. **테이블 생성·RLS 활성화·정책 생성을 같은 마이그레이션에** 넣어 "정책 없는 창" 제거(`:1317`) |
| **`ai_quota_*`·`user_api_keys` 정책 0개** | **통과** | `04:1367-1370` — `ai_quota_ledger`·`ai_quota_reservations`·`user_api_keys`·`account_events` **전부 "정책 없음 — 전면 차단"**. `:1453-1456` SQL이 `enable row level security`만 걸고 `create policy`가 없음. 근거도 정확 — 원장이 읽히면 **서비스 전체 여력이 노출**(`:930`), `user_api_keys`는 **핸들(`vault_secret_id`)조차** 클라이언트에 닿지 않음(`:1114`). `trial_consents`는 **본인 행 select만** 허용하고 쓰기는 서버 전용(`:1372`, `:1458-1460`) — 클라이언트 INSERT를 허용하면 동의 화면을 거치지 않고 게이트를 우회하기 때문. **신규 검사 1개 추가**: `security definer` 함수 5종의 실행 권한 검사 쿼리(`:1500-1512`) |
| **`NEXT_PUBLIC_` 오염** | **통과** | 전 문서 grep 결과 `NEXT_PUBLIC_` 접두사가 붙은 변수는 **`SUPABASE_URL`·`SUPABASE_ANON_KEY`·`SITE_URL` 3개뿐**이며 전부 공개 가능 값. **AI 키·`service_role`·Vault 관련에 접두사 제안 0건.** `GOOGLE_AI_API_KEY`(`05_deploy.md:41`)·`SUPABASE_SERVICE_ROLE_KEY`(`:40`)·`AI_RPD_LIMIT_*`·`AI_RESERVE_*` 전부 서버 전용. **사용자 키는 환경변수에 아예 들어가지 않고 Vault에만**(`05_deploy.md:107`). CI 검사 2종(소스 grep + 클라이언트 번들 값 검사, `:96`) 유지 |
| **계정 삭제 — 키·Vault·예약 전량 정리** | **통과** | `04:1814-1832` 9.3절 CASCADE 사슬에 **신규 5개 전부** 포함 — `ai_quota_reservations`(트리거가 원장 반납) · `user_api_keys`(트리거가 `vault.secrets` 파기) · `trial_consents` · `account_events`. **Storage를 DB 삭제보다 먼저** 지우는 순서 근거도 유지 |
| **`before delete` 트리거 2종** | **통과** | ① `04:1073` — `before delete on public.ai_quota_reservations`, 행만 지우면 **원장 `held_calls`가 남아 그 여력이 그날 안에 돌아오지 않음**(`:1050-1053`). ② `04:1167-1168` — `trg_user_api_keys_purge_secret`, `before delete on public.user_api_keys`, **CASCADE가 `vault.secrets`에 닿지 않으므로** 없으면 핸들 잃은 암호문이 영구 잔존(`:1840-1843`). **큐를 쓰지 않고 같은 트랜잭션에서 즉시 삭제** — Vault가 같은 DB라 실패 시 전체 롤백. **키 해제·키 교체도 같은 경로**(소프트 삭제를 두지 않은 이유가 명시) |
| **프롬프트 인젝션 방어** | **통과 (유지)** | `02_prompts/{interviewer,evaluator,coach,planner}.md` 4종 전부 신뢰 경계 절 유지. `<untrusted_*>` 태그 블록·`<`→`＜` 정화·`flags.injection_attempt_detected` → `session_events(prompt_injection_suspected)` 관측 경로 변화 없음. **D27~D30은 프롬프트를 건드리지 않았습니다**(`02_prompts/` 4개 파일 전부 `byok`/`funding_source` grep 0건 — 올바릅니다. 키는 전송 계층 관심사이지 프롬프트 관심사가 아닙니다) |
| **오디오 미저장** | **통과 (유지)** | Storage 버킷은 비공개 `documents` 1개뿐(`04:1008-1016`, `public = false`). `turns`에 `audio_path` 계열 컬럼 없음. #9가 `multipart/form-data`·`audio/*`를 **415로 거부**(`05:172-173`). 신규 5개 테이블에 오디오 관련 컬럼 0개 |

### 언어 정책

| 항목 | 결과 |
|---|---|
| `_workspace/` 산출물이 한국어 | **통과.** 12개 문서 + `02_prompts/` 4개 전부 한국어 서술. 영어는 코드 식별자·SQL·JSON 스키마·경로에 한정 |
| 런타임 프롬프트 4종이 한국어 | **통과 (유지).** 변경 없음 |
| 사용자 노출 카피가 한국어 | **통과.** 신규 화면 전부 — 4.13절 동의 다이얼로그, 4.14.1/2/3 차단 화면, D30 안내(`06:600-604`), 재개 패널 5종(`06:707-717`), `05:1524`·`:1531`의 오류 `message` |
| **코드 식별자 한국어 번역** | **위반 0건 (통과).** status 11개 · `pause_reason` 5개 · `funding_source` 2개 · `KeyStatus` 3개 · `TrialStatus` 2개 · `last_failure_code` 3개 · 축 5개 · 음성 4상태 · 라우트 12개 · 훅 43개 · 신규 테이블 5개의 전 컬럼 — 전부 영어. **오류 `code` 신규 5종도 전부 영어**이고 한국어는 `message`·`messageKo`에만. `06:1370`이 "**영어 그대로. 번역·camelCase 변환 금지**"를 축 표 머리에 못박음 |
| status 문자열 ↔ DB CHECK 문자 단위 | **통과** (기계 대조 #1·#2·#3) |

---

## 5. 1차 QA 항목의 해소 여부

| 1차 # | 심각도 | 내용 | 상태 | 근거 |
|---|---|---|---|---|
| **F1** | critical | D18 — 평가 시작 주체가 클라이언트 | ✅ **해소** | `05:151`(#15가 이어서 `completed→evaluating`), `:152`(#16은 `failed` 재시도 전용, 그 외 409), `:177-182`(⚠️ 박스), `:322`(4.6절 24번 "서버 부작용 ✅주체 정정"). UI: `06:1562`("리포트 진입 시 자동 호출 = 항상 409"), 훅 이름이 `useRetryEvaluation`으로 개명 |
| **F2** | critical | D19 — `→ canceled` 전이 엔드포인트 부재 | ✅ **해소** | **#33 `POST .../cancel`** 신설(`05:169`), 7개 전이 전부 담당. `useCancelSession`(`06:273`)이 `useDeleteSession`과 **다른 경로**임을 명시. `GET /api/sessions`에 `includeCanceled` 쿼리(`05:138`), `route-for-status`의 `canceled → /sessions?includeCanceled=true`(`06:118`) |
| **F3** | high | D20 — `Evaluation`에 기존 피드백·이의 부재 | ✅ **해소** | `05:153`(#17 응답에 `myFeedback`·`myDisputes` 포함), `06:216`(전용 훅을 만들지 말 것 + `myDisputes`는 `[]`이지 `null`이 아니므로 `?? []` 금지) |
| **F4** | high | D21 — `GET /api/documents/[id]` 부재 | ✅ **해소** | **#34** 신설(`05:170`), `DocumentDetail = Document & { linkedSessionCount, configuringSessionCount }`, `useDocument`(`06:219`)를 삭제 다이얼로그에서만 실행 |
| **F5** | high | `improvement` not null vs NULL 허용 충돌 | ✅ **해소** | `02_ai_contracts.md:832`·`:842-859` — NULL 허용 확정, **플레이스홀더 문자열 채택 안 함** |
| **F6** | high | `session_events.to_status` 비전이 이벤트 규약 부재 | ✅ **완전 해소 (2026-09-11 갱신)** | `05` 4.5절이 규약 확정(`from_status = to_status = 현재 status`, 스키마 변경 없음)에 더해, **`04` 3.6절에도 같은 규약이 명문화**됐음을 3차 재검증에서 확인했습니다(G6 종결). 2차 시점의 "부분 해소"는 더 이상 유효하지 않습니다 |
| **F7** | high | `utterance_done`에 `sessionStatus` 누락 | ✅ **해소** | `02_ai_contracts.md:487`·`:491`에 추가. 단 타입 폭 차이는 G8 |
| **F8** | high | `configuring → failed` 전이 엔드포인트 부재 | ✅ **해소** | **#35 `POST .../abandon-preparation`** 신설(`05:171`), `01_state_machine.md:130`의 트리거 문구에 **진입점까지 반영**, `useAbandonPreparation`(`06:274`) |
| **F9** | medium | D14/D15/D16이 음성 문서에 `[결정 필요]`로 남음 | ✅ **해소** | `03_voice_pipeline.md:885`("`[결정 필요]` **3건이 전부 확정됐습니다**") |
| **F10** | medium | 05 15절 #1(M8 충돌)이 노후 | ✅ **해소** | `05:662`(M8)와 `03_voice_pipeline.md:479`가 같은 규약을 말함 |
| **F11** | medium | 06 15·16·17절이 D18·D19를 미결로 둠 | ✅ **해소** | `06:1562`·`:314`가 확정 서술로 교체 |
| **F12** | medium | `canceled`가 제품 스펙·도메인 모델에 없음 | ✅ **완전 해소 (2026-09-11 갱신)** | `01_product_spec.md`에 **"취소된 세션 보기" 토글** 추가 ✅. **`01_domain_model.md`도 갱신됐음을 3차 재검증에서 확인**(G5 종결 — `pause_reason` 5종·`funding_source`·신규 테이블 5개 반영) |
| **F13** | low | 06이 "확정 결정 17건"을 가리킴 | ✅ **해소** | `06:10` — "**확정 결정 30건**" |
| **F14** | low | 축 식별자 5개가 UI 플랜에 부재 | ✅ **해소** | `06:1368-1381` — `axis-meta.ts` 표 신설, 카드 순서까지 고정 |
| **F15** | low | 총점 자릿수(기록 2 / 표시 1) 미기재 | ✅ **해소** (2026-09-11, G7 종결과 함께) | `01_rubric.md` 3절에 "자릿수 — 기록 2자리 / 표시 1자리 (D1)" 블록 추가 |
| ~~**F16**~~ | low | `provider` 예시가 `anthropic`/`openai` | ✅ **해소 (2026-09-11, G9 종결과 함께)** | `04_data_layer.md` 3.7절 `evaluations.provider` 설명이 D11 기준(`google` 단독)으로 정정됨 |

**1차 critical 2건·high 6건 — 2026-09-11 기준 8건 전부 완전 해소**(F6이 G6 종결로 "부분 해소"에서 올라섰습니다).
**F12도 G5 종결로 완전 해소.** 1차 잔여는 F15·F16 2건이었고, **F15는 2026-09-11 G7 종결과 함께 해소**됐습니다.
**F16(→ G9)도 2026-09-11 종결**되어 **1차 잔여는 전부 해소됐습니다.**

---

## 6. 미검증 항목 (통과가 **아닙니다**)

코드가 존재하지 않아 검증 자체가 불가능한 항목입니다. 구현 착수 후 재검증 대상입니다.

> **2026-09-12 갱신 — 쿼터/자격증명 레이어가 구현되어 BYOK·예약 13개 항목을 실제로 검증했습니다**
> (`vercel-platform-engineer`, 브랜치 `worktree-agent-a366b391e51695e79`).
> **12건 통과 / 1건 부분 통과**이며, 검증 과정에서 **결함 4건**을 찾아 고쳤습니다(7.3절).
> 라이브 검증은 `replai-service`(`xzeudnlklftfdlkpegtb`) 프로젝트에 픽스처를 넣어 돌린 뒤
> **전부 지웠습니다**(검증 종료 시점 `profiles` 0행 · `ai_quota_ledger` 0행 · `vault.secrets` 0행 확인).
> **라우트(`src/app/api/**`)는 아직 없으므로 라우트에 걸리는 항목은 여전히 열려 있습니다.**

**BYOK·예약 관련 (이번 라운드 신규)**
- [x] `src/lib/quota/gate.ts` 네 함수의 **진입부 첫 줄**이 실제로 `if (fundingSource !== 'trial_shared') return NO_OP`인지
  → **통과.** `peekCapacity`·`reserveSessionQuota`·`consumeSessionQuota`·`releaseSessionQuota` 네 함수 모두 본문 첫 문장이 `if (fundingSource !== "trial_shared") return NO_OP_*;`입니다. 원장을 만지는 코드는 이 파일 하나뿐이며(`grep -rn "ai_quota_" src/` → `gate.ts`만), 라우트에 분기가 흩어질 자리가 없습니다.
  **시그니처 변경 1건:** `peekCapacity(userId)` → `peekCapacity(userId, fundingSource)`. 재원 값이 인자에 없으면 이 가드를 함수 안에 둘 수 없어 분기가 다시 #3으로 흩어집니다(`05_api_contract.md` 4.7.0절에 근거 기록).
- [x] `resolveCallCredentials()` **외에** `get_user_api_key()`를 부르는 코드가 없는지(호출 그래프 추적)
  → **통과.** `grep -rn "get_user_api_key\|decrypted_secret" src/ --exclude=database.types.ts` 결과가 `src/lib/ai/credentials.ts` 한 파일(호출 1곳 + 주석 2줄)입니다. 라이브 권한 확인에서도 이 함수의 실행 권한은 `postgres`·`service_role`뿐이라 라우트의 anon 클라이언트로는 부를 수조차 없습니다.
- [x] `ctx`가 재시도 루프 **밖**에서 생성되는지 — 루프 안이면 폴백 구멍(`05:517-527`)
  → **통과.** `src/lib/ai/provider.ts`의 `runCompletion()`에서 `resolveCallCredentials`는 `for` 루프 **앞**에서 1회 호출되고, 루프는 같은 `ctx`만 재사용합니다. `runStream()`은 아예 재시도하지 않습니다(첫 토큰이 이미 나간 뒤의 재시도는 회복이 아니라 다른 사고입니다).
- [x] 프로바이더 클라이언트가 **키가 박힌 싱글턴**이 아닌지
  → **통과.** `createGoogleProvider()`는 **인자를 받지 않고** 키를 클로저에도 두지 않습니다. 키는 `complete`/`stream` 안에서 `ctx.apiKey`로 그때 헤더에 들어갑니다(`x-goog-api-key`). 모듈 스코프에 프로바이더 인스턴스 캐시가 없습니다(`createProvider()`가 호출마다 새로 만듭니다).
- [x] 어떤 API 응답 본문에도 키 원문이 없는지 — **응답 스키마 전수 grep** (`04:2060` 회귀 항목 5)
  → **부분 통과(현 시점 기준 통과, 라우트가 없어 전수가 아님).** 키 라우트 4종(#37~#40)이 아직 없습니다. 지금 검증할 수 있는 것은 **레이어 아래쪽**이며 전부 통과했습니다 — `LlmCallContext.apiKey`가 **열거 불가 속성**(`Object.defineProperty`, `enumerable: false`, `configurable: false`)이라 `JSON.stringify(ctx)`·`{...ctx}`·`Object.entries(ctx)` 어디에도 따라가지 않고, 로깅용 값은 `redactCtx()`가 뽑는 5개 화이트리스트(`sessionId`·`role`·`bucket`·`fundingSource`·`keyFingerprint`)뿐입니다. **#38이 생기면 이 항목을 다시 열어 주세요.**
- [x] 오류 리포터·`sonner` 토스트가 뮤테이션 `variables`를 직렬화하지 않는지(`06:299`)
  → **부분 통과(구조적 방어 완료, UI 미구현).** 키를 다루는 클라이언트 코드가 아직 없습니다. 서버 쪽은 위와 같은 열거 불가 속성으로 막혀 있고, `normalizeProviderError()`가 원시 오류를 `kind` 3종으로 접어 **상위 계층이 프로바이더 예외 객체를 보지 못하게** 합니다(SDK 예외에 요청 헤더가 붙어 오는 경로 차단). **#38 화면이 생길 때 `shadcn-ui-engineer`가 다시 확인해야 합니다.**
- [x] `funding_source='byok'` 세션에 `ai_quota_reservations` 행이 생기지 않는지(DB 통합 테스트)
  → **통과(라이브).** BYOK 세션으로 `reserve_session_quota` 호출 → `quota_not_applicable:byok` 예외, 예약 행 **0건**. `consume_session_quota`는 예외 없이 **0 반환**(AI 호출 직전 경로라 의도된 동작). 애플리케이션 게이트에서도 NO_OP이라 **호출 자체가 나가지 않습니다** — 2중 방어가 둘 다 실측으로 확인됐습니다.
- [x] 동의 없이 체험 세션이 `ready`로 가지 않는지(트리거 동작 확인)
  → **통과(라이브).** 동의 행 없는 `trial_shared` 세션을 `ready`로 UPDATE → `trial consent required before ready (session …)` 예외. 같은 조건의 `byok` 세션은 이 가드를 타지 않습니다(별개 제약인 `sessions_snapshot_required_after_ready`에만 걸림 — 설계대로입니다).
  **단, "현재 문구 버전"까지는 트리거가 보지 않습니다**(R9 — 서버 가드 책임). 그 가드는 #6 라우트가 생길 때 검증 대상입니다.
- [x] 세션·계정 삭제 후 `ai_quota_ledger.held_calls`가 **정확히** 되돌아오는지(이중 반납 없이)
  → **통과(라이브, 산수까지 대조).** 예약 34 → 소비 5 → `completed` 부분 반납(`p_keep=6`) 23 → 원장 34→**11**, 행은 `held` 유지·`reserved=11` → `settled` 전량 반납 **6** → 원장 **5**(= 소비분, 되돌아오지 않는 것이 정상) → **같은 반납 재호출은 0건 반환**(멱등) → **세션 삭제 후에도 원장 5 그대로**(released 행이라 트리거가 손대지 않음 = 이중 반납 없음). 별도로 `held` 상태 세션을 삭제하니 원장이 39→5로 **정확히 34** 되돌아왔습니다.
- [x] 계정 삭제 후 `vault.secrets`에 해당 시크릿이 남지 않는지
  → **통과(라이브).** `set_user_api_key()`로 키를 넣고(`vault.secrets` 1행, `get_user_api_key()`가 원문으로 복호화됨을 확인) `auth.users` 행을 삭제 → `user_api_keys` 0행, **해당 `vault_secret_id`의 암호문 0행**. CASCADE가 `before delete` 트리거를 통과해 Vault까지 지운다는 것이 실측으로 확인됐습니다.
- [~] `pg_advisory_xact_lock` 동시성 — 같은 사용자의 두 `prepare`가 실제로 직렬화되는지(부하 테스트 필요)
  → **부분 검증.** 함수 정의를 라이브에서 직접 읽어 `pg_advisory_xact_lock(hashtextextended('trial_quota_reservation:' || user_id …))`이 **`held` 조회보다 앞**에 있음을 확인했고, 순차 시나리오에서 두 번째 `prepare`가 `trial_reservation_exists:<첫 세션 id>`로 거절되는 것도 확인했습니다(게이트가 이 문자열에서 `details.existingSessionId`를 파싱합니다). **진짜 동시 트랜잭션 2개를 띄운 부하 테스트는 하지 못했습니다** — 사용한 SQL 실행 경로가 문장마다 자동 커밋이라 트랜잭션 경계를 잡을 수 없습니다. **열어 둡니다.**
- [x] `quota_date`가 `AI_QUOTA_RESET_TIMEZONE` 기준인지(UTC로 계산하면 리셋 경계에서 어긋남)
  → **통과.** 애플리케이션 쪽은 `src/lib/quota/quota-date.ts`가 `Intl.DateTimeFormat('en-CA', { timeZone })`으로 계산합니다(`toISOString().slice(0,10)` 금지). 서머타임 전환일 2곳을 포함한 4개 시점으로 확인 — 다음 리셋이 전부 **현지 자정 정각**으로 떨어졌고(`2026-11-01`·`2026-03-09` 포함), 경계 시점(UTC 06:30)에서 UTC 계산은 `2026-09-12`, 타임존 계산은 `2026-09-11`로 **실제로 하루가 어긋납니다.** DB 쪽 회귀도 없습니다 — 라이브 `consume_session_quota` 정의에 `current_date`가 더 이상 남아 있지 않습니다(직전 픽스 유지).

**1차에서 이월**
- [ ] 훅의 **실제 언랩 코드**가 3절 표의 "언랩" 열과 일치하는지 — 지금은 문서 ↔ 문서만 대조
- [ ] `src/lib/session/transitions.ts`가 전이 표와 문자 단위로 같은지(**G3 때문에 어느 표를 옮기느냐가 갈림**)
- [x] `admin.ts`가 클라이언트 번들에 들어가지 않는지(import 그래프)
  → **통과(2026-09-12).** `@/lib/supabase/admin`을 import하는 파일은 `src/lib/quota/gate.ts`·`src/lib/ai/credentials.ts` **둘뿐**이고 둘 다 첫 줄이 `import 'server-only'`입니다. `src/lib/ai/**`·`src/lib/quota/**` 9개 파일 전부 `server-only`를 갖고 있으며, 이들을 import하는 클라이언트 컴포넌트는 0개입니다(`grep`으로 확인). `next build`가 통과한다는 것 자체가 `'use client'` 그래프에 이 모듈들이 없다는 증거입니다 — 들어갔다면 빌드가 실패합니다.
- [ ] `package.json`에 shadcn 외 UI 라이브러리가 없는지 — **`sonner` 채택 여부가 미결이므로 판정 불가** `[확인 필요]`
- [ ] 하드코딩 색(`#`, `rgb(`, `bg-[`) 부재 전역 grep
- [ ] `score_card_viewed`가 축당 정확히 1회 전송되는지(지표 5 분모)
- [ ] Realtime 페이로드(snake_case)를 렌더링하는 코드가 없는지(E1 위반)
- [ ] RLS 정책의 **실제 동작** — 정책 SQL은 문서상 정합하나 실행 검증 불가

**측정 대기 (`[확인 필요]`)**
- [x] ~~`AI_RPD_LIMIT_*` 3종의 **실측값**~~ → **측정 완료 (2026-09-11 D34).** 운영상 의미 있는 버킷은 **1종뿐**입니다. `AI_RPD_LIMIT_FLASH_LITE = 500`이 실계정 대시보드 실측으로 확정됐고(`02_ai_architecture.md:132`·`:1068`), `flash`·`pro`는 **휴면 버킷(세션당 예약 0)** 이라 게이트가 아예 요청하지 않으므로 RPD 값이 무의미합니다 — **비워 두는 것이 정상**(`02_ai_architecture.md:1069-1070`·`:1616`). 남은 일은 측정이 아니라 **주입**입니다:
  - [ ] `AI_RPD_LIMIT_FLASH_LITE = 500`이 운영 환경변수에 실제로 들어갔는지 — 미주입이면 게이트는 여전히 fail-open (`05_deploy.md:482` P1)
  - [ ] `[확인 필요]` `05_deploy.md`의 `AI_RPD_LIMIT_*` 서술(`:65-67`·`:210`·`:315`·`:330`·`:482`)이 아직 **"3종 실측" + `gemini-2.5-*` 모델명 + "`pro`가 체험 정원을 결정한다"** 프레임 — D34 미반영. 소유자 `vercel-platform-engineer` 작업 진행 중 (본 보고서 작성 시점 기준)
- [ ] Vercel 무료 플랜 실행 시간 상한·크론 최소 주기 — I2 `maxDuration 60`이 성립하는지
- [ ] 선택 모델이 JSON Schema의 `minLength`/`minItems`를 어디까지 강제하는지
- [ ] 브라우저별 STT/TTS 실측 V1~V5(`03_voice_pipeline.md:892`)
- [ ] 사용자 키 검증 호출 1회(#38·#40)가 **사용자 키의 한도를 얼마나 먹는지** — `last_verified_at` 유예 창의 길이가 여기 걸림

**D34 빠른 스캔 — `02_ai_architecture.md` 신규 미결 항목 (2026-09-11 최초 작성 → 같은 날 후속 커밋으로 전부 종결)**

최초 스캔 당시 열려 있던 3개 항목은 이후 `ai-interview-architect`의 자체 스윕 커밋("D34 후속 정합성 정리", 이 문서 변경 로그 최상단)에서 전부 닫혔습니다 — `pro 3 × N`·`floor(pro 유효한도 / 3)`·"평가(`pro` 3)와 코치(`flash` 4 중 2)" 서술이 `flash_lite 34 × N` / `floor(425/34)` 기준으로 재기술됐고, "아직 측정되지 않았다" 마커도 4.2.0절 실측표를 가리키도록 정정됐습니다. grep으로 재확인 완료 — 잔존 없음.

- [x] **신규 추적 항목 (계속 열려 있음, 결함 아님).** `[확인 필요]` 아직 측정 안 한 최신 Flash 계열(`gemini-3.5-flash`·`3.5-flash-lite`·`3.6-flash`·`3.7-flash`·`3.8-flash`)의 무료 티어 RPD — `02_ai_architecture.md:249-254`. **하나라도 RPD > 500이면 하루 체험 정원 12가 즉시 올라갑니다.** 측정 전까지 추정 금지가 문서에 명시돼 있어 설계상 결함이 아니라 "측정 대기" 항목입니다. 소유자: 계정 보유자(측정) → `ai-interview-architect`(반영)

---

## 7. 소유자별 조치 요약

### 7.1 남은 조치 (2026-09-11 3차 재검증 기준 — **여기만 보면 됩니다**)

| 소유자 | 남은 조치 | 심각도 |
|---|---|---|
| `product-architect` | ~~**G7**~~ ✅**종결(2026-09-11)** — `01_rubric.md` 3절에 "기록 2자리 / 표시 1자리 (D1)" 블록 추가. `01_domain_model.md` 변경 로그(G5) 갱신도 완료 | — |
| `supabase-engineer` | ~~**G9**~~ ✅**종결(2026-09-11)** — `04_data_layer.md` 3.7절 `evaluations.provider` 설명을 D11 기준(`google` 단독)으로 정정하고, **`user_api_keys.provider`와 다른 컬럼임**을 명시. 스키마·마이그레이션 변경 없음 | — |
| ~~`ai-interview-architect` + `vercel-platform-engineer`~~ ✅ | ~~**G8** — `utterance_done.sessionStatus` 폭 정렬~~ **종결(2026-09-11)**: `05` 12절에 `StreamSessionStatus`(2값 부분집합) 신설 + 5.2절 필드 타입 교체, `02` 3.5절에 의도 명시. `vercel-platform-engineer`가 검토 완료(별도 수정 불필요) | — |
| `ai-interview-architect` | ~~**D34 잔여**~~ ✅**종결(2026-09-11)** — 같은 날 자체 스윕 커밋으로 `pro` 기준 노후 서술 3곳과 노후 `[확인 필요]` 마커 전부 정정 (이 문서 6절 "D34 빠른 스캔" 참고) | — |
| 없음 | **모든 항목 종결 — 남은 것은 커밋뿐입니다.** 오늘 편집분 전부(G1~G11, D34 잔여)가 작업본 상태이니 PR로 올려 주세요 | — |

### 7.3 구현 착수로 드러난 결함 4건 (2026-09-12, `vercel-platform-engineer` — **전부 조치 완료**)

문서 ↔ 문서 대조로는 나올 수 없고 **코드를 쓰는 순간 드러나는** 종류입니다. 넷 다 이번 작업에서 고쳤습니다.

| # | 심각도 | 결함 | 조치 |
|---|---|---|---|
| **Q1** | **high** | **`release_session_quota()`가 부분 반납을 표현할 수 없었습니다.** 계약(`05:4.7.3` 1번)은 `→ completed`에서 `reserved − consumed − 6`만 반납하고 6을 남기라고 정했는데, 함수에는 **남길 양을 받는 인자가 없었습니다.** 그대로 불렀다면 면접이 끝나는 순간 평가자 4 + 코치 2의 여력까지 반납돼 **완주한 세션이 리포트를 못 받고**, 안 불렀다면 세션당 34가 하루 종일 묶입니다. **설계가 요구한 동작을 DB가 수행할 수 없는 상태**였습니다 | 마이그레이션 `20260911000300_release_session_quota_keep.sql` — `p_keep int default 0` 추가. 기본값 0이라 반납 6지점 중 2~6번의 동작은 **그대로**입니다. `p_keep > 0`이면 행을 `held`로 남기고 `reserved_calls`만 `consumed + keep`으로 줄입니다(여기서 `status`를 바꾸면 뒤이은 전량 반납이 대상을 못 찾아 세션당 6이 영구히 샙니다). 라이브 적용 후 34 → 11 → 5의 전 경로를 실측 대조 |
| **Q2** | **high** | **`env.server.ts`의 세션당 예약 기본값이 D34 이전 값(26/4/3)이었습니다.** D34는 `flash_lite 34` 단일 버킷 + `flash`·`pro` **휴면(0)** 으로 재유도했는데 코드가 초안 값에 머물러 있었습니다. 게다가 `positive()`라 **0을 넣으면 부팅이 실패**해 D34의 값 자체를 주입할 수 없었고, 26으로 예약하면 **세션이 필요량(34)보다 적게 잡아** 면접 도중 원장이 바닥납니다 | 기본값을 `34/0/0`으로, 검증을 `nonnegative()`로 고쳤습니다. 아울러 fail-open 경고가 **휴면 버킷까지 매번 울리던 것**을 고쳤습니다 — 정상 배포에서 울리는 경고에 익숙해지면 그 경고는 아무 일도 하지 않습니다. 이제 **요청량이 0보다 큰 버킷의 한도가 없을 때만** 경고합니다 |
| **Q3** | medium | **CI 검사 3이 정상 상태에서 실패합니다.** `grep -rn "get_user_api_key\|decrypted_secret" src/`는 **생성 파일** `src/lib/supabase/database.types.ts`를 항상 잡습니다 — 스키마의 모든 함수 시그니처가 거기 들어가기 때문입니다. 복호화 지점이 하나여도 CI가 빨갛고, 그 실패에 익숙해지는 순간 이 검사는 **복호화 지점이 늘어나도 아무도 보지 않습니다** | `05_deploy.md` 1.3절의 검사식에 `--exclude=database.types.ts` 추가. 타입 선언에는 **호출이 없으므로** 검사의 뜻(복호화 **호출** 지점이 하나인가)은 그대로입니다 |
| **Q4** | low | **`peekCapacity(userId)` 시그니처로는 "네 함수 진입부 첫 줄이 같다"를 만족시킬 수 없었습니다.** 판정할 재원 값이 함수 안에 없으니 분기가 다시 #3 라우트로 흩어집니다 — 이 문서가 3절에서 "통과"의 근거로 든 **단일 분기 지점**이 깨집니다 | `peekCapacity(userId, fundingSource)`로 인자 1개 추가. #3은 사용자 키 유무로 재원을 이미 정한 뒤 부르므로 호출 측에 없는 값을 요구하지 않습니다. 근거를 `05_api_contract.md` 4.7.0절에 기록 |

> **Q1·Q2가 같은 성질입니다 — 문서가 재유도된 뒤 코드/DB가 따라오지 않은 자리.** 둘 다 D34 재설계에서
> 생겼고, 문서끼리는 정합했기 때문에 3차까지의 QA로는 보이지 않았습니다. **D35급 재유도가 또 일어나면
> `env.server.ts`의 기본값과 `supabase/migrations/`의 함수 시그니처를 명시적으로 훑어야 합니다.**

### 7.2 2차 시점 조치 목록 (보존 — 취소선은 3차 재검증에서 종결 확인)

| 소유자 | 조치 |
|---|---|
| `ai-interview-architect` | ~~**G1**(`02_ai_contracts.md` 3.5절 `stream_error.code`에 `byok_key_invalid`·`byok_quota_exhausted` 추가)~~ ✅, ~~**G4**(`02_ai_architecture.md` 8.3.5절 SQL·13.6.1절 표를 `p_limits` 포함 4인자로 + **D30 동시 예약 가드 전체를 반영**)~~ ✅, ~~**G8**~~ ✅, **D34 잔여**(6절 "D34 빠른 스캔" — `pro` 기준 서술과 노후 `[확인 필요]` 마커 정리) |
| `shadcn-ui-engineer` | ~~**G2**(`usePrepareSession` 오류 표에 409 `trial_reservation_exists` 추가, `details.existingSessionId`로만 링크 생성, **`activeSessions` 폴백 폐기**, 14절 §5·16절 #10 닫기)~~ ✅, ~~G10~~ ✅ |
| `vercel-platform-engineer` | ~~**G3**(4.6절 전이 표를 35행으로 확장, 신규 BYOK 전이 2행의 담당을 #9로 명시)~~ ✅, ~~G11~~ ✅, ~~**G8**~~ ✅ (`ai-interview-architect`가 `05`를 직접 수정 — **검토 요청**) |
| `supabase-engineer` | ~~**G6**(3.6절에 비전이 이벤트 `to_status` 규약 명문화 — R-A 회신)~~ ✅, ~~**G9**~~ ✅ |
| `product-architect` | ~~**G5**(`01_domain_model.md`에 D27~D30 반영 또는 원본 위임 명시)~~ ✅, ~~**G7**(`01_rubric.md` 3절 자릿수 명시)~~ ✅ |

> 전체 결정 기록: [`00_input/decisions.md`](00_input/decisions.md) (확정 30건)
