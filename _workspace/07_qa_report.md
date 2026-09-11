# QA 리포트 — 설계 문서 경계면 정합성 검증 (2차 · **3차 재검증 반영 2026-09-11**)

> 소유: `qa-inspector` · 대상: `_workspace/` 전 산출물 (2026-09-10 18:46 시점) · 기준: `00_input/decisions.md`(확정 결정 **30건**)
> **코드가 아직 없으므로 문서 ↔ 문서 경계면만 검증했습니다.** 런타임 검증은 전부 6절 "미검증"에 있습니다.
> 이 리포트는 **어떤 문서도 수정하지 않았습니다.** 각 항목의 "고칠 쪽"이 소유자입니다.
> 1차 리포트(2026-09-09, critical 2·high 6)를 **갱신**한 문서입니다. 1차 항목의 해소 여부는 5절.
>
> **2026-09-11 3차 재검증 반영.** 타 에이전트들이 보고한 G1~G4 해소 주장을 **QA가 파일 현재 상태를 직접 다시 읽어**
> 독립 확인했습니다(보고 전달이 아니라 재검증입니다). **네 건 모두 확인 — 종결.** 같은 기회에 medium·low도 훑어
> **G5·G6·G10·G11 종결**을 확인했고, **G7·G8·G9는 2차 시점 그대로 열려 있음**을 확인했습니다.
> G4의 라이브 SQL 대조는 **이 리포트에서 처음으로 코드를 읽은 항목**입니다
> (`supabase/migrations/20260910000100_ai_quota.sql` — 그 밖의 런타임 항목은 여전히 6절 "미검증").

## 요약

> **2026-09-11 3차 재검증 — high 4건 전부 종결(G1~G4). medium·low 3건은 아직 열려 있습니다(G7·G8·G9).**
> 다른 에이전트의 "해소" 보고를 받아 **QA가 파일 현재 상태를 직접 다시 읽어** 확인한 결과입니다.
> **"2차 미결 항목 11건 전부 종결"은 아직 사실이 아닙니다** — 아래 종결 현황 표를 보세요.

| 심각도 | 2차 건수 | 1차 대비 | **3차 재검증(2026-09-11) 종결 현황** |
|---|---|---|---|
| critical | **0** | 2 → 0 (**둘 다 해소**) | — |
| high | **4** | 6 → 4 (1차 6건 전부 해소, **신규 4건**) | **4 / 4 종결** ✅ G1·G2·G3·G4 |
| medium | 3 | | **2 / 3 종결** — G5·G6 ✅ / **G7 미해소** |
| low | 4 | | **2 / 4 종결** — G10·G11 ✅ / **G8·G9 미해소** |

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

> **2026-09-11 3차 재검증.** G5 ✅종결 · G6 ✅종결 · **G7 미해소(그대로 열려 있습니다)**. 근거는 표 아래.

| # | 심각도 | 경계 | 위치 | 현재 상태 | 기대 상태 | 고칠 쪽 |
|---|---|---|---|---|---|---|
| ~~**G5**~~ ✅종결 | medium | 도메인 모델 ↔ 전 문서 | `01_domain_model.md:98`, `:54-220`(3절 엔티티 11개), 문서 전역 | 09-09 이후 **무갱신**입니다. `pause_reason`이 **3개**(`user_requested`/`rate_limited`/`connection_lost`)로 남아 있고, `funding_source` 컬럼과 신규 테이블 5개(`ai_quota_ledger`·`ai_quota_reservations`·`user_api_keys`·`trial_consents`·`account_events`)가 **하나도 없습니다.** `:48`은 "모든 테이블이 사용자 데이터를 담으므로 예외 없이 RLS"라고 적는데, 신규 5개 중 4개는 **정책 0개(서버 전용)** 라 이 서술이 오도합니다 | CLAUDE.md 라우팅 표가 "DB 스키마 설계 전 `01_domain_model.md`를 읽으라"고 지시하므로 스키마 작업자가 **3개짜리 `pause_reason`을 먼저 봅니다.** 최소한 1절에 "D27~D30 이후 원본은 `01_state_machine.md`·`04_data_layer.md`"를 명시하고 `:98`의 3개 목록에 갱신 표시를 다세요. **완화 요인**: `:5`가 이미 "충돌하면 상태 머신 문서가 우선"을 선언 | `product-architect` |
| ~~**G6**~~ ✅종결 | medium | 비전이 이벤트 규약 (1차 F6 잔여) | `04_data_layer.md:650`, `:656`, `:666-672` ↔ `05_api_contract.md:263-287`(4.5절), `:1593`(R-A) | `05`는 **"비전이 이벤트는 `from_status = to_status = 그 시점 세션의 status`"** 로 규약을 확정하고, `:1593` R-A로 `supabase-engineer`에게 **`04` 3.6절에 명문화**를 요청했습니다. `04`는 09-10에 갱신됐지만 3.6절에 이 규약이 **여전히 없고**, 오히려 D27로 비전이 `event_name` **3종**(`quota_reserved`·`quota_released`·`quota_overflow`)이 **추가되어 적용 범위만 넓어졌습니다** | `04` 3.6절에 규약 한 문단 추가. 없으면 #6 `prepare`의 **첫 `quota_reserved` INSERT가 `to_status` not-null 위반**으로 실패하고, 예약 성공 트랜잭션이 통째로 롤백됩니다 | `supabase-engineer` |
| **G7** ❗**미해소** | medium | 총점 자릿수 (1차 F15 잔여) | `01_rubric.md` 3절(총점 서술) vs `00_input/decisions.md` D1 / `06_ui_plan.md` | 루브릭은 여전히 "소수 **둘째** 자리까지 기록"만 적고 표시 자릿수 언급이 없습니다. D1은 "소수 1자리 노출" | 실질 충돌은 아닙니다(`06`이 "저장 `numeric(3,2)` / 표시에서만 반올림"으로 정리). 루브릭에 "기록 2자리 / 표시 1자리" 한 줄 | `product-architect` |

**G5·G6 종결 근거 (2026-09-11 재확인).**
- **G5 ✅** — `01_domain_model.md`가 갱신됐습니다. `pause_reason`이 **5종**(`user_requested`·`rate_limited`·`connection_lost`·`byok_key_invalid`·`byok_quota_exhausted`, D28 표기)으로 확장됐고, `funding_source`(`trial_shared`\|`byok`, D28) 행이 추가됐으며, **신규 테이블 5개가 전부 엔티티 표에 등재**됐습니다(`user_api_keys`·`trial_consents`·`ai_quota_ledger`·`ai_quota_reservations`·`account_events`). `resumable_after`에 "`byok_quota_exhausted`에는 채우지 않는다"까지 반영. **잔여 흠 1건(결함 아님)**: 이 문서의 변경 로그에는 아직 `2026-09-09 최초 작성` 한 줄뿐이라 **갱신 이력이 기록되지 않았습니다** — 다음 편집 때 한 줄 추가를 권합니다(`product-architect`).
- **G6 ✅** — `04_data_layer.md` 3.6절에 규약이 명문화됐습니다: **"비전이 이벤트는 `from_status = to_status = 그 시점 세션의 `status`"**. `05_api_contract.md` R-A 요청이 회신된 것으로 확인. 이로써 **1차 F6도 "부분 해소" → 완전 해소**입니다(5절 참조).
- **G7 ❗** — `01_rubric.md` 3절이 **2차 리포트 작성 시점 그대로**입니다: "총점 `overall_score`는 축 점수의 가중 평균이며 소수 둘째 자리까지 기록합니다." **표시 자릿수 한 줄이 여전히 없습니다.** 런타임 위험은 없으나(저장·표시 분리는 `06`이 이미 정리) 항목은 **열린 채로 둡니다.**

### low

> **2026-09-11 3차 재검증.** G10 ✅종결 · G11 ✅종결 · **G8·G9 미해소(그대로 열려 있습니다)**. 근거는 표 아래.

| # | 심각도 | 경계 | 위치 | 현재 상태 | 기대 상태 | 고칠 쪽 |
|---|---|---|---|---|---|---|
| **G8** ❗**미해소** | low | SSE 타입 폭 | `02_ai_contracts.md` 3.5절 vs `05_api_contract.md` 5.2절 | `utterance_done.sessionStatus`가 원본은 **`"in_progress"\|"completed"` 2값**, 계약은 **`SessionStatus` 11값**. UI(`06:363`)는 `=== 'completed'`로만 분기 | 실제 방출 집합은 2값이 맞습니다. `05`를 2값으로 좁히거나 원본에 "확장 가능"을 명시. 어느 쪽이든 런타임 위험은 없음 | `ai-interview-architect` + `vercel-platform-engineer` |
| **G9** ❗**미해소** | low | D11 ↔ 예시 값 (1차 F16 잔여) | `04_data_layer.md` 3절 `provider` 컬럼 설명 | `provider` 설명 예시가 여전히 `anthropic` / `openai`. D11은 **Google 단독**이고 `user_api_keys.provider`는 `check (provider in ('google'))` | 예시를 `google`로 교체 | `supabase-engineer` |
| ~~**G10**~~ ✅종결 | low | 해소된 항목이 열린 채 | `06_ui_plan.md` 16절 #11 | "13.6.3절 금칙어에 '한도'가 있어 확정 문안과 충돌 — `ai-interview-architect`가 예외를 명시해 달라"가 미해결로 기록. 그러나 `02_ai_architecture.md:1417-1424`가 **이미 예외 2건("API 키" 허용 / "한도"는 사용자 본인 키 문맥만)을 명문화**했습니다 | 16절 #11을 "해소"로 닫기 | `shadcn-ui-engineer` |
| ~~**G11**~~ ✅종결 | low | 전이 표 총계 표기 | `05_api_contract.md` 4.6절 | "전이 표 33행"이 세 곳에 남아 있음 | G3과 함께 35행으로. 숫자 자체가 G3의 원인 표지입니다 | `vercel-platform-engineer` |

**G8~G11 종결/미해소 근거 (2026-09-11 재확인).**
- **G8 ❗미해소** — 폭 차이가 **그대로**입니다. `02_ai_contracts.md` 3.5절의 `utterance_done.sessionStatus`는 여전히 **`"in_progress"\|"completed"` 2값**이고, `05_api_contract.md` 5.2절은 여전히 **`SessionStatus`(11값)** 입니다. 어느 쪽도 좁히거나 "확장 가능"을 명시하지 않았습니다. **런타임 위험은 여전히 없습니다**(실제 방출 집합은 2값이고 UI는 `=== 'completed'`로만 분기) — 그래서 low 그대로 두되 **열린 항목**입니다.
- **G9 ❗미해소** — `04_data_layer.md`의 `provider` 컬럼 설명이 **여전히 "(`anthropic` / `openai` 등)"** 입니다. D11은 Google 단독이고 `user_api_keys.provider`는 `check (provider in ('google'))` 이므로 **예시와 CHECK가 서로 다른 말을 합니다.** 오독 위험만 있고 코드 경로에는 영향 없음(설명문 예시).
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
| **F15** | low | 총점 자릿수(기록 2 / 표시 1) 미기재 | ❌ **미해소 → G7** (2026-09-11 재확인, 여전히 미해소) | `01_rubric.md` 3절 변화 없음 |
| **F16** | low | `provider` 예시가 `anthropic`/`openai` | ❌ **미해소 → G9** (2026-09-11 재확인, 여전히 미해소) | `04_data_layer.md` `provider` 설명 변화 없음 |

**1차 critical 2건·high 6건 — 2026-09-11 기준 8건 전부 완전 해소**(F6이 G6 종결로 "부분 해소"에서 올라섰습니다).
**F12도 G5 종결로 완전 해소.** 남은 1차 잔여는 **F15·F16 2건뿐**이며 각각 G7·G9로 이어져 **아직 열려 있습니다.**

---

## 6. 미검증 항목 (통과가 **아닙니다**)

코드가 존재하지 않아 검증 자체가 불가능한 항목입니다. 구현 착수 후 재검증 대상입니다.

**BYOK·예약 관련 (이번 라운드 신규)**
- [ ] `src/lib/quota/gate.ts` 네 함수의 **진입부 첫 줄**이 실제로 `if (fundingSource !== 'trial_shared') return NO_OP`인지
- [ ] `resolveCallCredentials()` **외에** `get_user_api_key()`를 부르는 코드가 없는지(호출 그래프 추적)
- [ ] `ctx`가 재시도 루프 **밖**에서 생성되는지 — 루프 안이면 폴백 구멍(`05:517-527`)
- [ ] 프로바이더 클라이언트가 **키가 박힌 싱글턴**이 아닌지
- [ ] 어떤 API 응답 본문에도 키 원문이 없는지 — **응답 스키마 전수 grep** (`04:2060` 회귀 항목 5)
- [ ] 오류 리포터·`sonner` 토스트가 뮤테이션 `variables`를 직렬화하지 않는지(`06:299`)
- [ ] `funding_source='byok'` 세션에 `ai_quota_reservations` 행이 생기지 않는지(DB 통합 테스트)
- [ ] 동의 없이 체험 세션이 `ready`로 가지 않는지(트리거 동작 확인)
- [ ] 세션·계정 삭제 후 `ai_quota_ledger.held_calls`가 **정확히** 되돌아오는지(이중 반납 없이)
- [ ] 계정 삭제 후 `vault.secrets`에 해당 시크릿이 남지 않는지
- [ ] `pg_advisory_xact_lock` 동시성 — 같은 사용자의 두 `prepare`가 실제로 직렬화되는지(부하 테스트 필요)
- [ ] `quota_date`가 `AI_QUOTA_RESET_TIMEZONE` 기준인지(UTC로 계산하면 리셋 경계에서 어긋남)

**1차에서 이월**
- [ ] 훅의 **실제 언랩 코드**가 3절 표의 "언랩" 열과 일치하는지 — 지금은 문서 ↔ 문서만 대조
- [ ] `src/lib/session/transitions.ts`가 전이 표와 문자 단위로 같은지(**G3 때문에 어느 표를 옮기느냐가 갈림**)
- [ ] `admin.ts`가 클라이언트 번들에 들어가지 않는지(import 그래프)
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

**D34 빠른 스캔 — `02_ai_architecture.md` 신규 미결 항목 (2026-09-11, 전수 재검증 아님)**

D34 재설계가 **새로 연** 항목과, D34가 **닫았어야 하는데 남은** 노후 서술입니다. 다른 문서(`.env.example`, `05_deploy.md`, `04_data_layer.md`, `01_state_machine.md`, `02_prompts/evaluator.md`)는 동시 편집 중이라 스캔 대상에서 제외했고, 다음 라운드 대조 대상입니다.

- [ ] **신규 추적 항목 ✅ 편입.** `[확인 필요]` 이번에 재지 않은 최신 Flash 계열(`gemini-3.5-flash`·`3.5-flash-lite`·`3.6-flash`·`3.7-flash`·`3.8-flash`)의 무료 티어 RPD — `02_ai_architecture.md:249-254`. **하나라도 RPD > 500이면 하루 체험 정원 12가 즉시 올라갑니다.** 측정 전까지 추정 금지가 문서에 명시돼 있어 설계상 결함은 아니고, **"측정 대기" 성격이라 이 절이 맞는 자리**입니다. 소유자: 계정 보유자(측정) → `ai-interview-architect`(반영)
- [ ] **노후 서술 (D34 미반영, 신규 결함 성격) — 소유자 `ai-interview-architect`.** 단일 버킷 전환 후에도 `pro`가 정원을 결정한다는 D27 시절 문장이 3곳 남아 있습니다. 지금은 `pro` 예약이 0이라 **본문과 서로 모순**입니다:
  - `02_ai_architecture.md:862` — "`pro` 3 × N을 동시에 점유", "`pro`가 체험 정원을 결정하므로(8.3.1절)" → D30 가드의 **근거 자체가 무효한 서술**로 읽힘 (가드의 필요성은 유효하므로 `flash_lite 34 × N` 기준으로 고쳐 써야 함)
  - `02_ai_architecture.md:1002` — "8.3.1절의 `floor(pro 유효한도 / 3)`" → 실제 공식은 `floor(425 / 34)` (4.2.3절)
  - `02_ai_architecture.md:1006`·`:1009` — "평가(`pro` 3)와 코치(`flash` 4 중 2)" → 단일 버킷 `flash_lite` 기준으로 재기술 필요
- [ ] **노후 `[확인 필요]` 마커 — 소유자 `ai-interview-architect`.** `02_ai_architecture.md:1062` "무료 티어의 실제 RPM/RPD/TPM은 아직 측정되지 않았다(4.2절, 14절)" → **4.2절이 이미 실측표로 대체**했으므로 이 마커는 제거 대상. 남겨 두면 본 보고서의 "측정 완료" 판정과 문서가 어긋납니다

---

## 7. 소유자별 조치 요약

### 7.1 남은 조치 (2026-09-11 3차 재검증 기준 — **여기만 보면 됩니다**)

| 소유자 | 남은 조치 | 심각도 |
|---|---|---|
| `product-architect` | **G7** — `01_rubric.md` 3절에 "**기록 2자리 / 표시 1자리**" 한 줄 추가(D1 정합). 덤으로 `01_domain_model.md` 변경 로그에 갱신 이력 한 줄(G5 잔여 흠) | medium |
| `supabase-engineer` | **G9** — `04_data_layer.md` `provider` 컬럼 설명 예시를 `anthropic`/`openai` → **`google`** 로 교체(CHECK 제약과 일치시키기) | low |
| `ai-interview-architect` + `vercel-platform-engineer` | **G8** — `utterance_done.sessionStatus` 폭 정렬: `05` 5.2절을 **2값으로 좁히거나** `02_ai_contracts.md` 3.5절에 "**확장 가능**"을 명시. 어느 쪽이든 런타임 위험 없음 | low |
| `ai-interview-architect` | **D34 잔여** — 6절 "D34 빠른 스캔"의 `pro` 기준 노후 서술 3곳과 노후 `[확인 필요]` 마커. **G4와 별개 항목이며 아직 열려 있습니다** | — |
| `shadcn-ui-engineer` · `vercel-platform-engineer` | **커밋만 남음** — G2(`06_ui_plan.md`)·G4(`02_ai_architecture.md`) 오늘 편집분이 **작업본 상태**입니다. PR로 올려 주세요 | — |

### 7.2 2차 시점 조치 목록 (보존 — 취소선은 3차 재검증에서 종결 확인)

| 소유자 | 조치 |
|---|---|
| `ai-interview-architect` | ~~**G1**(`02_ai_contracts.md` 3.5절 `stream_error.code`에 `byok_key_invalid`·`byok_quota_exhausted` 추가)~~ ✅, ~~**G4**(`02_ai_architecture.md` 8.3.5절 SQL·13.6.1절 표를 `p_limits` 포함 4인자로 + **D30 동시 예약 가드 전체를 반영**)~~ ✅, **G8 (미해소)**, **D34 잔여**(6절 "D34 빠른 스캔" — `pro` 기준 서술과 노후 `[확인 필요]` 마커 정리) |
| `shadcn-ui-engineer` | ~~**G2**(`usePrepareSession` 오류 표에 409 `trial_reservation_exists` 추가, `details.existingSessionId`로만 링크 생성, **`activeSessions` 폴백 폐기**, 14절 §5·16절 #10 닫기)~~ ✅, ~~G10~~ ✅ |
| `vercel-platform-engineer` | ~~**G3**(4.6절 전이 표를 35행으로 확장, 신규 BYOK 전이 2행의 담당을 #9로 명시)~~ ✅, ~~G11~~ ✅, **G8 (미해소)** |
| `supabase-engineer` | ~~**G6**(3.6절에 비전이 이벤트 `to_status` 규약 명문화 — R-A 회신)~~ ✅, **G9 (미해소)** |
| `product-architect` | ~~**G5**(`01_domain_model.md`에 D27~D30 반영 또는 원본 위임 명시)~~ ✅, **G7 (미해소)** |

> 전체 결정 기록: [`00_input/decisions.md`](00_input/decisions.md) (확정 30건)
