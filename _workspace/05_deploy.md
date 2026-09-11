# 배포 구성 (Vercel + Supabase)

> 소유: `vercel-platform-engineer` · 상태: **초안(draft)**
> 짝 문서: `05_api_contract.md`(엔드포인트·런타임·`maxDuration` 근거)
> 입력: `04_data_layer.md` 6·7·8·12절, `02_ai_architecture.md` 4·8절, `00_input/constraints.md`

## 변경 로그
- 2026-09-09 최초 작성. 환경변수 16종, 공개/비공개 구분, 크론 1종, 무료 플랜 `[확인 필요]` 자리 확보.
- 2026-09-10 (2차) **D27·D28·D29 반영.** 기존 절만 고쳤습니다.
  - **D27** — 예약 게이트 환경변수 **9종 추가**(1.2절, 전부 서버 전용). **한도 3종 미설정 시 fail-open**이 확정 동작이며,
    배포 전 체크리스트에 "RPD 3종 측정·주입" 항목을 넣었습니다(3.1절·6절). 크론 워치독 **4종 → 5종**(5절, 만료 예약 스윕).
  - **D28** — Supabase **Vault** 설정 항목(2.4절 S7·S8), 키 유출 방어에 CI 검사 2종 추가(1.3절).
    **사용자 키는 환경변수가 아닙니다** — Vault에 있고 요청 단위로 복호화됩니다(1.4절).
  - **D29** — 동의 문구 버전 상수와 배포 시 주의(1.5절). 환경변수가 아니라 **애플리케이션 상수**입니다.
  - 환경변수 **16종 → 25종**. 공개(`NEXT_PUBLIC_`) 변수는 **여전히 3개** — 이번에 늘어난 것이 하나도 없습니다.
- 2026-09-10 (3차) **측정치 기록 — 3절 표를 실제 값으로 채웠습니다.** 해당 절만 고쳤습니다.
  - **Vercel Hobby 함수 상한 = 300초**(기본 300 / 최대 300). **60초 가정은 틀렸습니다** → D31.
    `vercel.json`의 `maxDuration`을 재조정했고 **코치 워커 라우트가 없어졌습니다**(3종 → 2종).
  - **Hobby 크론 = 하루 1회 · 정밀도 ±59분.** "일 1회 워치독 + 게으른 워치독" 판단이 **검증됐습니다.**
    하루 1회보다 잦은 표현식은 **배포 자체가 실패**하므로 2.2절에 못을 하나 더 박았습니다.
  - **요청·응답 body 4.5MB 상한** 확인 → 3.3절에 이력서 업로드·추출 텍스트와의 관계를 적었습니다.
  - **`AI_QUOTA_RESET_TIMEZONE`의 `[확인 필요]` 해소** → **`America/Los_Angeles`**(Gemini RPD는
    태평양 시간 자정 리셋). 1.2절·3.1절·8절에 반영.
  - **Gemini RPM/RPD/TPM은 `[확인 필요]`로 남습니다** — Google이 문서에 싣지 않고 계정별 대시보드에서
    확인하게 하기 때문입니다. **읽는 절차**를 3.1절에 적었습니다. 환경변수 + fail-open 설계가
    **유일하게 옳은 접근임이 확인**됐습니다.

---

## 1. 환경변수 전체 목록

**철칙 — `NEXT_PUBLIC_` 접두사는 브라우저 번들에 문자열로 박힙니다.**
빌드 시점에 인라인되므로 배포된 JS 파일을 열면 누구나 읽을 수 있고, **한 번 배포되면 되돌릴 수 없습니다.**
AI 프로바이더 키와 Supabase `service_role` 키에 이 접두사를 붙이는 것은 즉시·영구 유출입니다(고정 제약).

### 1.1 공개 (`NEXT_PUBLIC_` — 브라우저에 노출됨)

| 변수 | 값의 성격 | 용도 | 노출되어도 되는 이유 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 프로젝트 URL | 브라우저 Supabase 클라이언트, Realtime, Storage 직업로드 | 공개 엔드포인트입니다 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 키 | 위와 동일 | **RLS가 전제입니다.** **17개** 테이블 전부 RLS가 켜져 있고 정책이 소유자만 허용하므로, 이 키만으로는 남의 데이터에 닿을 수 없습니다. RLS가 하나라도 꺼지면 이 키가 곧 전체 데이터 유출 경로가 됩니다. **2026-09-10 신규 5개 중 `ai_quota_ledger`·`ai_quota_reservations`·`user_api_keys`·`account_events` 4개는 RLS 켜고 정책 0개**(`service_role` 전용)이고, `trial_consents`만 본인 행 `select` 정책을 갖습니다 |
| `NEXT_PUBLIC_SITE_URL` | 배포 URL | 절대 URL 생성(리다이렉트·메타데이터) | 공개 정보 |

**공개 변수는 이 3개가 전부입니다.** 새 `NEXT_PUBLIC_` 변수를 추가할 때는
"이 값이 배포된 JS에 평문으로 박혀도 되는가"를 먼저 답해야 합니다.

### 1.2 서버 전용 (**절대 `NEXT_PUBLIC_` 금지**)

| 변수 | 용도 | 사용 지점 | 유출 시 결과 |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | RLS 우회 쓰기 | `src/lib/supabase/admin.ts` (첫 줄 `import 'server-only'`) | **RLS 전면 무력화. 전 사용자 데이터 읽기·쓰기·삭제 가능** |
| `GOOGLE_AI_API_KEY` | Google AI Studio (플래너·면접관·요약·평가·코치 전부. D11 단독 프로바이더) | `src/lib/ai/providers/google.ts` | 무료 티어 쿼터 도난, 과금 위험 |
| `ANTHROPIC_API_KEY` | 예산이 열릴 때의 전환용. **MVP에서는 설정하지 않습니다** | `src/lib/ai/providers/anthropic.ts`(껍데기) | 종량 과금 도난 |
| `JOB_SECRET` | 내부 워커 라우트(`/api/internal/**`) 인증. **라우트는 2개뿐입니다 — `jobs/plan` · `jobs/evaluate`**(D31) | 워커를 띄우는 `waitUntil(fetch)`의 `Authorization` 헤더, 워커 라우트의 검사 | 누구나 평가 워커를 무한 호출 → 무료 티어 쿼터 소진 |
| `CRON_SECRET` | 크론 라우트(`/api/cron/**`) 인증 | `Authorization: Bearer ${CRON_SECRET}` 검사 | 워치독 임의 실행. 세션이 강제 종료될 수 있음 |
| `AI_MODEL_INTERVIEWER` | 역할별 모델 ID 오버라이드 | `src/lib/ai/roles.ts` | 없음(비밀이 아님). 단 서버 전용으로 둡니다 |
| `AI_MODEL_SUMMARIZER` | 〃 | 〃 | 〃 |
| `AI_MODEL_PLANNER` | 〃 | 〃 | 〃 |
| `AI_MODEL_EVALUATOR` | 〃 | 〃 | 〃 |
| `AI_MODEL_COACH` | 〃 | 〃 | 〃 |
| `AI_PROVIDER` | `google` \| `anthropic`. 기본 `google` | `src/lib/ai/roles.ts` | 없음 |
| `WATCHDOG_EVALUATING_TIMEOUT_MIN` | 기본 `10` | 게으른 워치독·크론 | 없음 |
| `PAUSED_AUTO_CLOSE_DAYS` | 기본 `7` (D7) | 크론 | 없음 |
| **`AI_QUOTA_GATE_ENABLED`** | 게이트 전체 on/off. 기본 `true`. **사고 시 배포 없이 끄기 위한 스위치** | `src/lib/quota/gate.ts` | 없음 |
| **`AI_RPD_LIMIT_FLASH_LITE`** | 측정한 `gemini-2.5-flash-lite`의 RPD **원값**. 기본값 **없음** | 〃 (`limit_calls` 계산) | 없음. 단 **체험 정원이 그대로 드러나므로 서버 전용** |
| **`AI_RPD_LIMIT_FLASH`** | 〃 `gemini-2.5-flash`. 기본값 **없음** | 〃 | 〃 |
| **`AI_RPD_LIMIT_PRO`** | 〃 `gemini-2.5-pro`. 기본값 **없음**. **가장 희소한 자원이라 체험 정원을 결정합니다** | 〃 | 〃 |
| **`AI_QUOTA_SAFETY_MARGIN_PCT`** | 안전 여유. 기본 `15` (`02_ai_architecture.md` 8.3.7절) | 〃 | 없음 |
| **`AI_QUOTA_RESET_TIMEZONE`** | `quota_date` 계산 타임존. **`America/Los_Angeles` — 2026-09-10 확인, 추정 아님.** Gemini의 RPD는 **태평양 시간 자정에 리셋**됩니다(3.1절). **UTC로 두면 최대 8시간 동안 예약과 실제 한도가 어긋납니다** | 〃 | 없음 |
| **`AI_RESERVE_FLASH_LITE_PER_SESSION`** | 세션당 예약량. 기본 `26` (8.3.1절) | 〃 | 없음 |
| **`AI_RESERVE_FLASH_PER_SESSION`** | 〃 기본 `4` | 〃 | 없음 |
| **`AI_RESERVE_PRO_PER_SESSION`** | 〃 기본 `3` | 〃 | 없음 |

**예약 게이트 환경변수 9종은 전부 서버 전용입니다 — `NEXT_PUBLIC_` 금지.**
한도 수치 자체는 비밀이 아니지만, **하루 체험 정원이 그대로 계산되는 값**이고 그 숫자가 브라우저에
있으면 `06_ui_plan.md`의 금칙어 규칙("무료 티어"·"한도"·"쿼터" 노출 금지)이 무의미해집니다.
**클라이언트에 나가는 여력 정보는 `GET /api/capacity`의 불리언과 시각 하나뿐입니다**(`05_api_contract.md` 4.7.5절).

**⚠️ 한도 3종이 하나라도 미설정이면 게이트는 열린 채로 동작합니다 (fail-open — 확정 동작).**

> 근거는 `02_ai_architecture.md` 8.3.8절입니다. fail-closed(수치가 없으면 전면 차단)는
> **환경변수 오타 하나로 서비스가 죽습니다.** fail-open의 대가는 "D27 이전 상태로 되돌아가는 것"인데,
> 그때도 폴백 사다리 1~4단계가 남아 있으므로 **최악이 이전 설계와 같습니다.**
> 설계의 실패 모드가 이전 설계보다 나빠지지 않는 쪽을 택합니다.
>
> **대신 침묵하지 않습니다:** (a) 부팅 시 경고 로그(`env.server.ts`에서 세 값의 존재를 확인),
> (b) 6절 배포 전 체크리스트 항목, (c) 게이트 미동작 상태에서 `pause_reason='rate_limited'`가 뜨면
> `02_ai_architecture.md` 8.3.9절의 관측이 잡습니다. **주입 전까지 D27은 실질적으로 미적용 상태입니다.**

- **`AI_RPD_LIMIT_*`는 원값이고 `limit_calls`는 파생값입니다.**
  `limit_calls = floor(AI_RPD_LIMIT_<BUCKET> × (1 − AI_QUOTA_SAFETY_MARGIN_PCT / 100))`을
  **라우트가 계산해 `reserve_session_quota(..., p_limits)`로 넘깁니다**(R8 — DB는 환경변수를 읽을 수 없습니다).
- **하루 도중에 값을 바꿔도 그날의 판정은 흔들리지 않습니다.** 원장 행 생성 시 `limit_calls`가 박히므로
  새 값은 **다음 날 첫 예약부터** 적용됩니다(`02_ai_architecture.md` 8.3.5절).

**모델 ID를 환경변수로 오버라이드할 수 있어야 하는 이유**(`02_ai_architecture.md` 4.4절):
무료 티어 한도를 소진했을 때 **운영자가 배포 없이 모델을 내릴 수 있어야** 합니다.
`AI_MODEL_EVALUATOR`를 `flash`로 바꾸는 것이 예산 초과 시 첫 번째 조정 레버입니다(Coach보다 먼저 내리지 않음).

### 1.3 키 유출 방어 (코드 레벨)

| 장치 | 내용 |
|---|---|
| `import 'server-only'` | `admin.ts`, `src/lib/ai/**`, `src/lib/env.server.ts` 최상단. 클라이언트 컴포넌트가 import하면 **빌드가 실패**합니다 |
| 환경변수 접근 단일화 | `process.env`를 라우트에서 직접 읽지 않고 `env.server.ts`(zod 검증)를 통해서만 읽습니다. 누락된 변수는 **부팅 시** 터지게 하고 런타임에 `undefined`로 조용히 흐르게 두지 않습니다 |
| CI 검사 | `grep -rn "NEXT_PUBLIC_.*\(SERVICE_ROLE\|API_KEY\|SECRET\)" src/` 가 **0행**이어야 통과 |
| CI 검사 2 | 클라이언트 번들(`.next/static/**`)에 `SUPABASE_SERVICE_ROLE_KEY`·`GOOGLE_AI_API_KEY`의 **값**이 없는지 확인 |
| **AI 프로바이더를 클라이언트에서 직접 부르지 않음** | 고정 제약. 브라우저에서 LLM을 부르는 코드 경로는 하나도 없습니다 |
| **CI 검사 3 (D28)** | `grep -rn "get_user_api_key\|decrypted_secret" src/` 의 결과가 **`src/lib/ai/credentials.ts` 한 파일뿐**이어야 통과. 복호화 지점이 늘어나는 것을 CI가 잡습니다 |
| **CI 검사 4 (D28)** | 응답 직렬화에 키가 섞이는 사고 방지 — `grep -rn "select('\*')\|select(\"\*\")" src/app/api/account/api-key/` 가 **0행**. `user_api_keys`를 `select *`로 읽어 그대로 반환하는 경로를 두지 않습니다 |

### 1.4 사용자 API 키(BYOK)는 **환경변수가 아닙니다** (D28)

혼동하기 쉬운 지점이라 못 박습니다.

| | 서비스 공용 키 | **사용자 키(BYOK)** |
|---|---|---|
| 어디에 있나 | `GOOGLE_AI_API_KEY` 환경변수 | **Supabase Vault**(`vault.secrets` 암호문). 환경변수에 **넣지 않습니다** |
| 언제 읽나 | 프로세스 부팅 시 1회 | **요청마다** `get_user_api_key(userId)`로 복호화 |
| 누가 읽나 | `src/lib/ai/providers/google.ts` | **`src/lib/ai/credentials.ts` 한 곳뿐** (`service_role` 전용 함수) |
| 어디까지 가나 | 서버 | **`LlmCallContext.apiKey` 안까지.** 반환값·예외·로그·스팬 속성 어디에도 나가지 않습니다 |
| 쓰이는 세션 | `funding_source='trial_shared'` | `funding_source='byok'` |

- **사용자마다 키가 다르므로 환경변수라는 그릇 자체가 맞지 않습니다.** 환경변수는 배포 단위 상수입니다.
- **공용 키 폴백은 금지입니다**(`05_api_contract.md` 4.8.2절). 사용자 키가 죽어도 `GOOGLE_AI_API_KEY`로
  넘어가는 코드 경로가 존재하지 않아야 합니다 — 넘어가면 **D29 동의 없는 이력서·답변이 공용 경로로 나갑니다.**
- 로그에 남길 수 있는 유일한 키 관련 값은 **`keyFingerprint`(끝 4자리)** 입니다. `ctx`를 통째로
  직렬화하는 로깅 헬퍼를 두지 않습니다(화이트리스트 방식).
- **요청 body를 통째로 로깅하는 미들웨어·에러 리포터를 `PUT /api/account/api-key`에 붙이지 마세요.**
  이 설계에서 키가 샐 수 있는 **유일하게 남은 경로**입니다.

### 1.5 동의 문구 버전은 **애플리케이션 상수**입니다 (D29)

`src/lib/consent/trial-consent.ts` 한 파일이 문구 원문과 버전(`CURRENT_TRIAL_CONSENT_VERSION`)을 갖습니다.
**환경변수로 빼지 않습니다** — 환경만 바꿔 문구를 바꿀 수 있으면 "무엇에 동의했는가"를 코드에서 답할 수 없습니다.

- 서버 라우트(#41)와 동의 다이얼로그가 **같은 상수를 import**합니다. 사본을 만들면 화면과
  `consent_text_sha256`이 갈라집니다.
- **문구를 고치면 버전을 반드시 함께 올립니다.** 올리지 않으면 과거 동의 기록이 **지금은 존재하지 않는 문장**을
  가리키게 되고, 아무도 그 사실을 알 수 없습니다.
- **문구 버전을 올린 배포는 사용자 재동의를 유발합니다.** 옛 버전 동의만 가진 사용자는
  다음 체험 준비에서 `409 trial_consent_required`를 받고 동의 다이얼로그를 다시 봅니다(의도된 동작).
  DB 트리거는 이를 잡지 못하므로(**동의 행의 존재만 검사**), 배포 후 **서버 가드가 버전을 대조하는지**
  스모크에서 확인합니다(6절 8단계).

---

## 2. Vercel 프로젝트 설정

### 2.1 기본

| 항목 | 값 |
|---|---|
| 프레임워크 | Next.js (App Router) |
| Node 버전 | 프로젝트 설정의 최신 LTS 고정 |
| 런타임 | **전 라우트 `nodejs`** (`05_api_contract.md` 11.1절) |
| 리전 | **Supabase 프로젝트와 같은 리전 1개로 고정** (`icn1` 등). 다르면 DB 왕복이 매 요청 수십~수백 ms 늘고, 그 지연이 5초 예산의 "서버 전처리 150ms"를 통째로 먹습니다 |
| 빌드 명령 | 기본값 |

### 2.2 `vercel.json`

```jsonc
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/daily", "schedule": "0 18 * * *" }   // 매일 03:00 KST (UTC 18:00)
  ],
  "functions": {
    "src/app/api/sessions/[sessionId]/turns/route.ts":  { "maxDuration": 90 },
    "src/app/api/documents/[documentId]/extract/route.ts": { "maxDuration": 120 },
    "src/app/api/internal/jobs/plan/route.ts":          { "maxDuration": 120 },
    "src/app/api/internal/jobs/evaluate/route.ts":      { "maxDuration": 240 },
    "src/app/api/cron/daily/route.ts":                  { "maxDuration": 240 },
    "src/app/api/account/route.ts":                     { "maxDuration": 120 },
    "src/app/api/**":                                   { "maxDuration": 15 }
  }
}
```

- **값의 근거는 `05_api_contract.md` 11.2절이고, 이 파일은 사본입니다.** 둘이 갈라지면 계약이 원본입니다.
- **`src/app/api/internal/jobs/coach/route.ts`는 목록에서 사라졌습니다(D31).** 코치는 `jobs/evaluate`
  안에서 순차 실행되며 별도 라우트가 없습니다. **내부 워커 라우트는 `plan`·`evaluate` 2개뿐입니다.**
- **어떤 라우트도 300을 쓰지 않습니다.** Hobby 상한이 300초라는 것은 확인됐지만(3절), 상한에 걸려 끊긴
  함수는 `catch`도 `finally`도 돌지 못해 **여력 예약이 반납되지 않은 채 남습니다.** 가장 긴 `jobs/evaluate`도
  240에서 멈추고, 그 안에서 **210초 소프트 데드라인**으로 스스로 정리합니다(`05_api_contract.md` 11.2.1절).
- `maxDuration`은 **라우트 파일의 `export const maxDuration`으로도** 선언하고 `vercel.json`과 같은 값으로 둡니다.
  한쪽만 두면 나중에 파일이 옮겨졌을 때 조용히 기본값으로 떨어집니다.
- **크론은 하루 1회만 등록합니다 — 선택이 아니라 플랜 제약입니다.** Hobby의 크론 최소 간격은
  **하루 1회**이고, 그보다 잦은 표현식을 쓰면 **배포 자체가 실패합니다**(3절, 2026-09-10 확인).
  D7이 자동 종료 시한을 7일로 늘려 일 1회로 충분하다는 판단(`04_data_layer.md` 3.3절)이 여기서 맞물립니다.
- **`"0 18 * * *"`는 "03:00 KST 무렵"이지 "정확히 03:00 KST"가 아닙니다.** Hobby 크론은 시간 단위 정밀도라
  **±59분** 안에서 실행됩니다(3절). 5절의 다섯 작업은 전부 **시각에 둔감**하므로 이 오차는 설계에
  영향을 주지 않습니다 — 근거는 3.4절.

### 2.3 환경 분리 (Production / Preview / Development)

| 환경 | Supabase 프로젝트 | 비고 |
|---|---|---|
| **Production** (`main`) | 운영 프로젝트 | 실제 사용자 데이터. 마이그레이션은 PR 머지 후 수동 적용 |
| **Preview** (PR 브랜치) | **별도의 스테이징 프로젝트** | **운영 DB를 절대 가리키지 않습니다.** Preview 배포는 브랜치마다 뜨고 검증되지 않은 코드가 service_role 키로 붙습니다 — 운영 DB를 가리키면 PR 하나가 사용자 데이터를 지울 수 있습니다 |
| **Development** (로컬) | `supabase start` 로컬 스택 | `.env.local`. 커밋하지 않습니다 |

| 변수 | Production | Preview | Development |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | 운영 | **스테이징** | 로컬 |
| `SUPABASE_SERVICE_ROLE_KEY` | 운영 | **스테이징** | 로컬 |
| `GOOGLE_AI_API_KEY` | 운영 키 | **별도 키 권장** — 같은 키를 쓰면 PR 미리보기가 운영 세션의 무료 티어 쿼터를 먹습니다 | 개인 키 |
| `JOB_SECRET` / `CRON_SECRET` | 각각 다른 난수 32B | 각각 다른 난수 | 임의값 |
| `NEXT_PUBLIC_SITE_URL` | 운영 도메인 | Vercel 시스템 변수에서 파생 | `http://localhost:3000` |
| **`AI_RPD_LIMIT_*` 3종** | **실측값**(3.1절) | **Preview 키 기준의 실측값** — 운영값을 그대로 쓰면 원장이 없는 여력을 약속합니다 | 설정 안 함(fail-open) |
| **`AI_QUOTA_GATE_ENABLED`** | `true` | `true` | `false` 권장 — 로컬에서 게이트에 막히면 개발이 멈춥니다 |
| **`AI_QUOTA_RESET_TIMEZONE`** | 실측값 | 운영과 **같은 값** | 〃 |
| **`AI_RESERVE_*` 3종** | 기본값(26/4/3) | 운영과 같은 값 | 〃 |

- **D24(Preview AI 키 분리)가 D27에서 더 중요해졌습니다.** 예약 원장은 **환경이 아니라 키의 여력**을 모사하는
  장부입니다. Preview가 운영 키를 공유하면 PR 검증이 태운 호출은 **원장 밖**에서 한도를 먹고,
  원장은 "아직 여유 있음"이라고 말합니다 — 그 어긋남이 곧 `pause_reason='rate_limited'`(면접 도중의 벽)입니다.
  이것이 `AI_QUOTA_SAFETY_MARGIN_PCT` 15%가 흡수해야 할 1순위 항목입니다(`02_ai_architecture.md` 8.3.7절 1).
- **Preview는 스테이징 Supabase를 가리키므로 Vault도 별개입니다.** 운영 사용자의 키가 Preview에서
  복호화될 경로가 없습니다.

- **크론은 Production 배포에서만 실행됩니다.** Preview에서 워치독이 도는 일은 없습니다.
- **Preview 배포는 배포 보호(Deployment Protection)를 켭니다.** 스테이징이라도 로그인 화면이 공개 인터넷에
  노출될 이유가 없습니다.

### 2.4 Supabase 프로젝트 체크리스트 (마이그레이션 SQL에 **없는** 것들)

| # | 항목 | 값 | 근거 |
|---|---|---|---|
| S1 | Authentication → Providers → Email → **Confirm email** | **OFF** | **D8.** 마이그레이션에 없어서 새 프로젝트를 만들 때 가장 놓치기 쉽습니다 |
| S2 | Email 이외 provider | 전부 OFF | 소셜 로그인은 `[later]` |
| S3 | Storage 버킷 | `documents` **하나뿐** (private, 10 MiB, MIME 4종) | 오디오 버킷을 만들면 안 됩니다(`03_voice_pipeline.md` Q2) |
| S4 | Realtime publication | `interview_sessions` **한 테이블만** | `04_data_layer.md` 8절 |
| S5 | RLS 확인 쿼리 **3종** | 결과 **0행** | `04_data_layer.md` 5.4절. **2종 → 3종**(함수 실행 권한 검사 추가, 12.2절). 배포 직후 반드시 실행. **테이블 17개 전부 RLS 활성화** |
| S6 | Site URL / Redirect URLs | 운영·프리뷰 도메인 등록 | 없으면 로그인 리다이렉트가 깨집니다 |
| **S7** | **Vault 확장** (`supabase_vault`) **활성화** | **ON** | **D28.** `set_user_api_key`/`get_user_api_key`가 `vault.create_secret`·`vault.decrypted_secrets`에 의존합니다. 마이그레이션이 확장을 켜더라도 **새 프로젝트에서 가장 놓치기 쉬운 항목**입니다 |
| **S8** | **PostgREST 노출 스키마 목록에 `vault`를 넣지 않음** | `public`(+`graphql_public`)만 | **D28.** `vault`가 노출되면 `decrypted_secrets` 뷰가 REST로 조회 가능해집니다. **RLS보다 앞선 방어선이고, 켜져 있으면 나머지 4중 강제가 전부 무의미해집니다** |
| **S9** | 함수 실행 권한 | `set_user_api_key`·`get_user_api_key`·예약 함수 3종이 **`service_role`에만 grant** | **D27·D28.** `anon`/`authenticated`에서 `revoke`. S5의 3번째 쿼리가 이것을 검사합니다 |

> **이 서비스에는 이메일 발송 경로가 하나도 없습니다**(D2·D8). SMTP 설정을 하지 않습니다.

---

## 3. 무료 플랜 한도 — **2026-09-10 측정 반영**

이 절의 숫자를 기억으로 채우지 않습니다. 플랜 정책은 바뀌고, 틀린 숫자로 설계를 정당화하는 것이
숫자를 모르는 것보다 나쁩니다. **아래는 2026-09-10에 출처를 직접 확인한 값이며, 확인하지 못한 행은
`[확인 필요]`로 남겨 두었습니다.**

| 항목 | 값 (Hobby) | 출처 | 확인일 | 우리 설계가 요구하는 것 |
|---|---|---|---|---|
| **함수 최대 실행 시간** | **기본 300초 / 최대 300초** (Pro는 기본 300 / 최대 800, 확장 1800 beta) | https://vercel.com/docs/functions/limitations (문서 갱신일 2026-08-24) | **2026-09-10** | 가장 긴 `jobs/evaluate`가 **240**. 그 외 ≤120. **여유를 남기는 근거는 `05_api_contract.md` 11.2.1절** |
| **크론 최소 간격 / 개수** | **하루 1회 / 프로젝트당 100개.** 더 잦은 표현식은 **배포 실패** (Pro는 분 단위) | https://vercel.com/docs/cron-jobs/usage-and-pricing (갱신일 2026-07-15) | **2026-09-10** | **일 1회 × 1개.** 그대로 들어갑니다 |
| **크론 실행 시각 정밀도** | **시간 단위 (±59분)** | 〃 | **2026-09-10** | 워치독 5종은 전부 시각에 둔감합니다 — 3.4절 |
| **Edge 런타임 응답 시작 시한** | **25초 안에 첫 바이트**, 이후 최대 300초까지 스트리밍 | https://vercel.com/docs/functions/limitations | **2026-09-10** | **해당 없음** — 전 라우트 `nodejs`(`05_api_contract.md` 11.1절). Edge를 다시 검토할 때 이 제약이 SSE에 걸립니다 |
| **메모리 / vCPU** | **2GB / 1 vCPU** | 〃 | **2026-09-10** | PDF 파싱이 유일한 메모리 압박 지점(10 MiB 상한) |
| **요청·응답 body 크기** | **4.5MB** | 〃 | **2026-09-10** | **이력서 업로드 경로의 근거 — 3.3절** |
| 대역폭 / 함수 호출 수 | `[확인 필요]` | https://vercel.com/docs/pricing | — | 4절 추정 참조 |
| 배포 보호 사용 가능 여부 | `[확인 필요]` | https://vercel.com/docs/deployment-protection | — | Preview 보호(2.3절) |

**확인 결과가 설계에 미친 영향 — 하나는 틀렸고, 하나는 검증됐습니다.**

| | 초안의 가정 | 확인 결과 | 조치 |
|---|---|---|---|
| 함수 실행 시간 | **60초라고 가정** | **300초** | **틀렸습니다.** 60초를 피하려고 만든 평가→코치 **체이닝을 폐기**하고 워커 1회 호출로 단순화(D31). 내부 워커 라우트 3종 → 2종 |
| 크론 | "분 단위 크론이 없을 것" | **하루 1회가 최소 간격** | **검증됐습니다.** "일 1회 워치독 + 게으른 워치독"(`05_api_contract.md` 6.5절)을 **그대로 유지**합니다 |

**크론이 아예 없어도 정상 경로는 동작합니다** — 평가 진행은 크론이 아니라 `waitUntil`로 띄운 워커가
이끌고, 크론은 아무도 보지 않는 세션을 위한 안전망일 뿐입니다.

### 3.1 선택 모델의 무료 티어 한도 — **수치는 `[확인 필요]`로 남습니다 (해소 불가능한 항목이 아니라, 소유자만 읽을 수 있는 항목입니다)**

`02_ai_architecture.md` 8절의 호출 예산 **전체가 이 값에 매달려 있습니다.**

> **2026-09-10 확인: Google은 무료 티어의 RPM·RPD·TPM 수치를 문서에 싣지 않습니다.**
> 출처: https://ai.google.dev/gemini-api/docs/rate-limits — 한도는 **계정별로 다르고**,
> **AI Studio 대시보드에서 각자 확인**하게 되어 있습니다.
> **즉 이 표는 문서를 더 읽어서 채울 수 있는 표가 아닙니다.** 소유자가 자기 계정에서 읽어 주입해야 합니다.
>
> **이 사실이 설계를 검증합니다.** 한도를 코드에 상수로 박지 않고 **환경변수 3종 + 미설정 시 fail-open**
> (1.2절)으로 간 것이 **유일하게 옳은 접근이었습니다.** 계정마다 다른 값을 문서에서 베껴 박았다면
> 첫 배포부터 틀린 숫자로 체험 정원을 계산하고 있었을 것입니다.
>
> **같은 날 확인된 것 2가지:**
> - **RPD는 태평양 시간 자정에 리셋됩니다** → **`AI_QUOTA_RESET_TIMEZONE = America/Los_Angeles` 확정**(1.2절).
>   **이 항목의 `[확인 필요]`는 해소됐습니다.** 추정이 아니라 확인된 값입니다.
> - **Tier 1로 올라가려면 결제 계정 연결이 필요합니다.** BYOK 사용자의 키가 유료 티어 한도를 받으려면
>   **그 사용자가 자기 계정에 결제를 활성화해 두었어야** 합니다. 우리가 해줄 수 있는 일이 없고,
>   그래서 `byok_quota_exhausted`에 **재개 가능 시각을 표시하지 않습니다**(`05_api_contract.md` 10.2절) —
>   기다린다고 풀린다는 보장이 없습니다.

**아래 표는 소유자가 3.1.1절 절차로 읽어 채웁니다. 비어 있는 동안 D27 예약 게이트는 fail-open입니다.**

| 역할 | 모델 | RPM | RPD | TPM | 확인일 | 출처 |
|---|---|---|---|---|---|---|
| `interviewer` | `gemini-2.5-flash-lite` | `[확인 필요]` | `[확인 필요]` | `[확인 필요]` | | AI Studio 대시보드 |
| `summarizer` | `gemini-2.5-flash-lite` | `[확인 필요]` | `[확인 필요]` | `[확인 필요]` | | AI Studio 대시보드 |
| `planner` | `gemini-2.5-flash` | `[확인 필요]` | `[확인 필요]` | `[확인 필요]` | | AI Studio 대시보드 |
| `evaluator` | `gemini-2.5-pro` | `[확인 필요]` | `[확인 필요]` | `[확인 필요]` | | AI Studio 대시보드 |
| `coach` | `gemini-2.5-flash` | `[확인 필요]` | `[확인 필요]` | `[확인 필요]` | | AI Studio 대시보드 |

**대조할 우리 소비량**(`02_ai_architecture.md` 8.1절, 20턴 세션 1건 기준):

```
호출 26회 = planner 1 + interviewer ≤20 + summarizer ≤3 + evaluator 1 + coach 1
입력 약 61,000 토큰 / 출력 약 8,000 토큰
동시 세션 N개일 때 대략 1.5 × N RPM (면접관 호출은 사용자 발화 간격에 묶임)
```

**기록해야 할 것 (Phase 3):**

| # | 값 | 그 값으로 계산할 것 |
|---|---|---|
| 1 | 모델별 RPM | **동시 세션 상한.** 초과하면 폴백 사다리 3~4단계로 내려갑니다. **RPD와 달리 사전 예약의 대상이 아닙니다**(순간적·자기회복적, `02_ai_architecture.md` 8.3.0-a절) |
| 2 | 모델별 RPD | **`AI_RPD_LIMIT_*` 3종에 그대로 주입할 값**(1.2절). 이 값이 없으면 게이트는 fail-open입니다 |
| 3 | `gemini-2.5-pro`의 RPD | **하루 체험 정원 = `floor(유효한도 / AI_RESERVE_PRO_PER_SESSION)`.** 가장 희소한 자원이라 이 값 하나가 정원을 결정합니다. **BYOK 세션은 이 계산 밖이고 개수 제한이 없습니다**(D28) |
| 4 | TPM | 세션당 입력 61K가 몇 세션까지 동시에 들어가는지 |
| 5 | 429의 `Retry-After` 유무 | `resumable_after` 계산에 씁니다(`05_api_contract.md` 10.1절). 없으면 다음 날 00:00 UTC |
| ~~**6**~~ | ~~리셋이 실제로 일어나는 시각~~ | **✅ 해소(2026-09-10).** RPD는 **태평양 시간 자정** 리셋 → `AI_QUOTA_RESET_TIMEZONE = America/Los_Angeles`. 더 이상 관측할 항목이 아닙니다 |

#### 3.1.1 한도를 **어디서 어떻게** 읽는가 (소유자 작업 — 문서 확인으로 대체 불가)

```
1) https://aistudio.google.com/rate-limit 를 연다
   — 운영에 쓸 키가 속한 Google 계정으로 로그인해야 한다. 계정이 다르면 남의 한도를 적게 된다
2) 모델별 RPM / RPD / TPM을 읽어 위 표에 적는다. 확인일도 함께 적는다
   대상 3종: gemini-2.5-flash-lite · gemini-2.5-flash · gemini-2.5-pro
   (Preview 환경 키를 분리했다면 D24 — 그 키의 계정도 같은 방식으로 확인한다)
3) RPD 3종을 운영 환경변수에 넣는다
   AI_RPD_LIMIT_FLASH_LITE / AI_RPD_LIMIT_FLASH / AI_RPD_LIMIT_PRO  (원값 그대로. 안전 마진은 코드가 뺀다)
4) 대시보드에 값이 보이지 않거나 모호하면 — 스테이징 키로 단일 모델을 반복 호출해
   429가 뜨는 지점을 측정한다 (02_ai_architecture.md 8.3.8절)
5) 주입 전까지 게이트는 열려 있고 D27은 실질적으로 미적용이다 (배포 전 체크리스트 P1)
```

- **AI_QUOTA_RESET_TIMEZONE은 이 절차에 포함되지 않습니다** — 2026-09-10에 확정됐습니다(`America/Los_Angeles`).
- **대시보드 값은 계정 상태에 따라 바뀝니다.** 결제를 연결해 Tier 1로 올라가면 한도가 달라지므로,
  티어를 바꿨다면 이 표와 환경변수를 **함께** 갱신해야 합니다. 갱신은 다음 날 첫 예약부터 반영됩니다(1.2절).

**예산 초과 시 조정 순서 (`02_ai_architecture.md` 4.2절이 지정한 순서 그대로):**

```
1) Evaluator: gemini-2.5-pro → gemini-2.5-flash     ← 첫 번째 레버. AI_MODEL_EVALUATOR 환경변수만 바꾸면 됨
2) Coach: flash 유지 (인용 정확도가 우선이므로 Coach를 Evaluator보다 먼저 내리지 않는다)
3) 그래도 부족하면 동시 세션 상한을 낮춘다 (4단계 폴백 사다리가 자동으로 paused 처리)
```

### 3.2 확인이 필요한 나머지 (`00_input/decisions.md` 말미 항목)

```
[확인 필요] 선택 모델이 JSON Schema 기반 구조화 출력에서 minLength/maxLength/minItems를
            어디까지 강제하는가. 강제되지 않는 제약은 서버 검증이 전부 잡도록 이미 이중화했으나,
            재시도율에 영향을 준다. 평가자 구현 시 실측해 이 문서에 기록한다.
            (원 출처: 02_ai_contracts.md 10절)
```

### 3.3 body 4.5MB 상한과 이력서 업로드

**이 상한이 이력서 파일 자체에는 걸리지 않습니다 — 파일이 Vercel 함수를 지나가지 않기 때문입니다.**
클라이언트가 Supabase Storage에 **직접** 올리고(2.1절 E2 예외, `04_data_layer.md` 7.4절), 버킷 상한은
**10 MiB**입니다(2.4절 S3). 10 MiB > 4.5MB인 것이 모순이 아니라, **직업로드를 택한 결과**입니다.

| 경로 | 4.5MB가 걸리나 | 실제 상한 |
|---|---|---|
| 브라우저 → Storage 직업로드(원본 PDF·DOCX) | **아니오** (함수를 경유하지 않음) | 버킷 정책 **10 MiB** |
| `POST /api/documents` (메타데이터만) | 예 | 수 KB — 여유 큼 |
| `POST /api/documents/[id]/extract` **응답** | **예 — 여기가 유일한 실질 위험** | 추출 텍스트가 응답에 실립니다 |
| `PATCH /api/documents/[id]` (`extractedText` 직접 입력·수정) | **예** | 사용자가 붙여넣는 텍스트 |

- **10 MiB PDF의 추출 텍스트가 4.5MB를 넘는 일은 사실상 없습니다.** 이미지가 대부분인 PDF가 용량을
  만들고 텍스트는 수십~수백 KB입니다. 그래도 **응답을 만들기 전에 텍스트 길이를 검사**하고, 상한 근처면
  `extraction_status='failed'` + "텍스트를 직접 붙여넣어 주세요"라는 **이미 정의된 실패 경로**로 보냅니다.
- **파일 업로드를 API 프록시로 바꾸는 순간 10 MiB 정책은 거짓이 됩니다.** 4.5MB에서 잘립니다.
  직업로드는 대역폭 절약책일 뿐 아니라 **파일 크기 정책의 전제**입니다 — 바꾸려면 두 값을 함께 바꿔야 합니다.

### 3.4 크론 ±59분 정밀도가 설계에 주는 영향 — **없습니다**

`vercel.json`의 `"0 18 * * *"`는 03:00 KST **무렵**이며, 실제 실행은 그 앞뒤 **최대 59분** 안에서 일어납니다.
5절의 다섯 작업이 전부 이 오차를 견디는지 한 줄씩 확인합니다.

| 크론 단계 | 시각에 민감한가 | 이유 |
|---|---|---|
| 1 `paused` 7일 자동 종료 | **아니오** | 기준이 **7일**입니다. ±59분은 0.6%의 오차입니다 |
| 2 `abandoned` 정리 | **아니오** | 같은 이유 |
| 3 `evaluating` 10분 워치독(배치) | **아니오** | 정확한 10분 판정은 **게으른 워치독**이 담당합니다. 크론은 아무도 안 보는 세션의 안전망이고, 이 경로의 지연은 이미 **최대 하루**입니다 |
| 4 Storage 스위퍼 | **아니오** | 삭제 대기 큐를 비우는 작업이며 마감이 없습니다 |
| 5 만료 예약 스윕 (D27) | **주의 — 유일하게 날짜 경계와 얽힙니다** | 대상 조건이 `quota_date < today`라 **"오늘"을 어느 타임존으로 보느냐**가 관건이지, 실행 시각의 ±59분이 아닙니다. `AI_QUOTA_RESET_TIMEZONE = America/Los_Angeles`(3.1절)로 계산하면 18:00 UTC는 태평양 시간 **오전 10~11시**라 자정 리셋에서 충분히 떨어져 있습니다 |

> **정확한 시각을 요구하는 규칙을 크론에 얹지 마세요.** 얹는 순간 ±59분이 곧바로 버그가 됩니다.
> 시각 정확도가 필요한 판정은 전부 **요청 시점의 게으른 판정**으로 옮깁니다(`05_api_contract.md` 6.5절).

---

## 4. 무료 플랜 안에 들어가는가 — 설계 측 근거

| 압박 지점 | 우리 설계 | 판단 |
|---|---|---|
| **함수 실행 시간** | **상한 300초 확인(2026-09-10).** 가장 긴 `jobs/evaluate`가 **240**(평가+코치 순차, 최악 ~200s), 나머지는 ≤120, 대부분 15 | **초안의 60초 가정이 틀렸고, 그 결과 설계가 더 단순해졌습니다**(D31 — 워커 라우트 3종 → 2종). 조정 레버는 `05_api_contract.md` 11.3절 |
| **함수 호출 수** | 세션 1건당 서버 호출 약 **40~50회**(CRUD 15 + 면접관 턴 20 + 워커 **1~4**(D31로 체인 1홉 감소) + 폴링) | Realtime을 쓰므로 폴링이 거의 없습니다(`04_data_layer.md` 8.1절: "무료 티어에서 폴링보다 저렴") |
| **크론** | **일 1회 × 1개** | **확인됨(2026-09-10): Hobby의 최소 간격이 바로 일 1회이고 프로젝트당 100개까지입니다.** 정확히 정책의 경계에 맞춰 설계돼 있었습니다. ±59분 오차의 영향은 3.4절 |
| **대역폭** | 오디오를 저장·전송하지 않습니다. 문서는 클라이언트가 Storage에 **직접** 올려 Vercel 대역폭을 쓰지 않습니다(`04_data_layer.md` 7.4절) | Vercel 쪽 대역폭은 사실상 HTML·JS·JSON뿐 |
| **Supabase DB 용량** | 스냅샷 텍스트가 유일한 증가 요인(세션당 수십 KB 추정, `04_data_layer.md` 14.1절 `[확인 필요]`) | |
| **Supabase Storage 용량** | D3으로 원본 파일을 계속 보관하므로 **단조 증가**합니다. 줄어드는 힘이 없습니다 | 한도에 닿으면 D3을 되돌리는 정책 결정이 필요합니다 |
| **AI 무료 티어** | 3.1절 `[확인 필요]`. **D27 예약 게이트가 체험 세션을 사전 배급하고, D28 BYOK 세션은 사용자 키를 쓰므로 우리 한도를 전혀 쓰지 않습니다** | 실측 전까지 확신할 수 없는 항목이지만, **막힌 사용자에게 "키 연결"이라는 출구가 생겨 이 위험의 크기가 D27 시점보다 작아졌습니다** |
| **함수 호출 수 (D27·D28 증가분)** | 세션당 +2~4회(#36 여력 조회, #41 동의 1회, 키 라우트는 계정당 몇 회). 예약·반납은 **별도 호출이 아니라 기존 라우트 안의 DB 함수 호출**입니다 | 무시할 수준입니다. 새 크론도 없습니다(기존 C1에 5단계를 붙였을 뿐) |

**설계상 $0을 유지하는 핵심 3가지**: (1) 오디오 미저장·미전송, (2) 문서 Storage 직업로드,
(3) Realtime 1테이블 구독으로 폴링 제거. 셋 다 이미 다른 문서에서 확정된 결정입니다.

---

## 5. 크론 라우트 `GET /api/cron/daily`가 하는 일 (**5가지**, 순서 고정, 전부 멱등)

```
0. Authorization: Bearer ${CRON_SECRET} 검사 → 불일치 시 401
1. paused 자동 종료 (D7 — 7일)
   where status='paused' and paused_at < now() - interval '7 days'
   답변한 주질문 ≥ 1 → completed (+ 평가 체인 시작, 리포트에 "중단된 세션" 배지)
   답변한 주질문 = 0 → abandoned
   ※ idx_sessions_status_updated 부분 인덱스를 탑니다
2. evaluating 워치독 (게으른 워치독이 놓친 세션)
   where status='evaluating' and evaluations.started_at < now() - 10분
   attempt_count < 3 → jobs/evaluate 재호출 / 소진 → failed (failure_reason='evaluation_failed')
3. in_progress 유실 세션 (15절 #2 근사)
   where status='in_progress' and updated_at < now() - (max_duration_min + 30분)
   → paused (pause_reason='connection_lost')
   ※ 이 상태는 부분 인덱스에 없어 순차 스캔입니다. MVP 규모에서 허용
4. Storage 스위퍼 (04_data_layer.md 9.4절)
   storage_cleanup_queue의 pending 200건 → storage.remove() → done / attempt_count += 1
   + documents에 대응 행이 없는 24시간 이상 된 고아 객체 제거
   + done 행 중 30일 지난 것 삭제
5. 만료 예약 스윕 (D27 신규 — 01_state_machine.md 7.5절 규칙 5)
   where quota_date < today(AI_QUOTA_RESET_TIMEZONE 기준) and status = 'held'
   → release_session_quota(..., reason='expired')로 정리
   ※ idx_quota_res_held 부분 인덱스를 탑니다. 체험 세션 예약에만 해당합니다
```

- **각 단계는 배치 상한(200건)을 두고, 못 끝낸 분량은 다음 날 이어서 처리합니다.** 한 번의 실행이
  `maxDuration`을 넘기지 않게 하는 것이 우선이며, 워치독은 하루 늦어도 사용자 경험이 달라지지 않습니다.
- **단계 하나가 실패해도 다음 단계를 실행합니다.** 스위퍼 실패로 세션 자동 종료가 멈추면 안 됩니다.
- 실행 결과는 `session_events`(1~3단계, `trigger='scheduler'`)와 애플리케이션 로그(4·5단계)에 남깁니다.
- **1·2·3단계의 종료 전이는 예약 반납을 동반합니다**(`05_api_contract.md` 4.7.3절):
  `paused → completed`는 `flash_lite`만, `paused → abandoned`와 `evaluating → failed`는 전부.
  **반납은 멱등이어야 하고, 크론이 두 번 돌아도 여력이 부풀지 않아야 합니다.**
- **5단계는 안전망이지 정상 경로가 아닙니다.** 여기서 정리되는 행이 꾸준히 나오면
  **반납 6지점 중 하나가 빠졌다는 신호**입니다(`01_state_machine.md` 7.5절). 건수를 로그에 남기고
  0이 아니면 원인을 찾습니다 — 원장 행이 날짜별이라 여력 계산에는 이미 영향이 없지만,
  `held`로 남은 과거 행은 "반납 누락"과 구분되지 않아 관측을 오염시킵니다.

---

## 6. 배포 절차

```
1. PR 생성 → CI (typecheck / lint / build / 1.3절 키 유출 grep 2종)
2. Preview 배포 자동 생성 → 스테이징 Supabase에서 수동 확인
3. 스키마 변경이 있으면: 스테이징에 마이그레이션 적용 → supabase gen types 재생성 →
   같은 커밋에 database.types.ts 포함 (04_data_layer.md 11절)
4. main 머지 → Production 배포
5. **운영 Supabase에 마이그레이션 적용** (배포 후가 아니라, 새 컬럼을 읽는 코드가 뜨기 전에)
6. 배포 직후: 04_data_layer.md 5.4절 RLS 확인 쿼리 2종 실행 → 각각 0행
7. 스모크: 로그인 → 세션 생성 → 문서 업로드·추출 → prepare → start → 턴 1회(SSE) →
   complete → evaluate → 리포트 도달
8. 스모크(2차 — D27·D28·D29): 아래 6항목
   a. GET /api/capacity 응답에 잔여량·한도 수치가 없는지 (불리언 + 시각 + 상태만)
   b. 동의 없이 prepare → 409 trial_consent_required (전이하지 않고 configuring 유지)
   c. 동의 후 prepare → 예약 성공 → session_events에 quota_reserved
   d. 키 연결(PUT) → 응답에 키 원문이 없는지 (본문 전수 확인, keyLast4만)
   e. 키를 연결한 계정으로 세션 생성 → funding_source='byok' → ai_quota_reservations에 행이 없는지
   f. 세션 취소 → ai_quota_ledger.held_calls가 예약 전 값으로 정확히 복귀하는지
9. 스모크(3차 — D31): 아래 3항목
   a. complete 직후 응답이 202/evaluating으로 즉시 돌아오는지 (워커를 기다리지 않는지)
   b. 리포트가 한 번의 워커 호출로 점수+코칭까지 채워지는지
      (session_events에 evaluating → evaluated가 한 번만, 중간 completed 되돌림 없이)
   c. GET /api/internal/jobs/coach 가 404인지 — 옛 경로가 남아 있으면 안 됩니다
```

**배포 전 체크리스트 (D27·D28 — 위 절차와 별개로 한 번은 답해야 하는 질문들)**

| # | 항목 | 미충족이면 |
|---|---|---|
| **P1** | **`AI_RPD_LIMIT_*` 3종을 AI Studio 대시보드에서 읽어 운영 환경변수에 주입했는가** (3.1.1절 절차 — **문서에는 없는 값이라 소유자만 읽을 수 있습니다**) | **게이트가 fail-open으로 동작합니다** — D27은 실질적으로 미적용이고 벽이 다시 면접 도중으로 돌아옵니다. 부팅 경고 로그로 확인하세요 |
| ~~**P2**~~ | ~~`AI_QUOTA_RESET_TIMEZONE`을 관측으로 확정했는가~~ → **✅ 2026-09-10 확정: `America/Los_Angeles`.** 남은 확인은 **환경변수에 그 값이 실제로 들어갔는지** 한 줄뿐입니다 | 값이 비어 UTC로 떨어지면 리셋 경계에서 최대 8시간 어긋납니다 |
| **P3** | Vault 확장(S7)과 `vault` 미노출(S8)을 확인했는가 | **타인의 자격증명이 REST로 조회 가능해집니다.** 나머지 방어가 전부 무의미해집니다 |
| **P4** | 함수 실행 권한(S9)이 `service_role` 전용인가 | `authenticated`가 남의 키를 복호화하거나 원장을 조작할 수 있습니다 |
| **P5** | 동의 문구 버전(1.5절)이 이번 배포에서 올라갔는가 | 올랐다면 **전체 사용자가 재동의**합니다(의도된 동작). 안 올렸는데 문구만 고쳤다면 **과거 동의 기록이 거짓이 됩니다** |
| **P6** | Preview가 운영 AI 키를 공유하고 있지 않은가 (D24) | PR 검증이 **원장 밖**에서 한도를 먹고, 원장은 여유 있다고 말합니다(2.3절) |

- **마이그레이션 적용 순서가 배포와 어긋나면 런타임에 `undefined`가 흐릅니다.**
  컬럼 추가는 코드 배포보다 **먼저**, 컬럼 삭제는 코드 배포보다 **나중**입니다.
- **첫 마이그레이션이 원격에 적용된 뒤에는 기존 파일을 절대 수정하지 않습니다.**
  해시가 갈라져 이후 모든 적용이 막힙니다(`04_data_layer.md` 10절).
- 롤백: Vercel의 이전 배포로 되돌립니다. **마이그레이션은 자동으로 되돌아가지 않으므로**,
  파괴적 변경(컬럼 삭제·타입 변경)은 실행 전 리더 확인을 받습니다.

---

## 7. 관측

| 대상 | 수단 |
|---|---|
| 라우트 오류·지연 | Vercel 함수 로그. 오류 로그에 `sessionId`·`route`·`errorCode`를 **항상** 포함 |
| AI 호출 실패 원인 구분 | 로그에 `provider`·`model_name`·정규화 오류 종류(`RateLimitError`/`AuthError`/…)를 함께 남깁니다. **키 오류·한도·모델명 오타가 로그에서 구분되지 않으면 원인을 찾는 데 며칠이 갑니다** |
| 폴백 사다리 발동 | `session_events(event_name='rate_limit_fallback')`, `detail: { step, layer, provider, retryAfterSec }` |
| 평가 성공률 | `evaluations.status` + `attempt_count` 집계 |
| 코치 실패 | `session_events`로만 관측(D10). `attempt_count`는 **평가자 시도만** 셉니다 |
| DB·Storage 용량 | Supabase 대시보드(상시). Storage는 단조 증가하므로 주기적으로 봐야 합니다 |
| **예약 게이트 (D27, 주간 점검)** | `session_events`의 `quota_reserved`·`quota_released`·`quota_overflow` 3종 + `ai_quota_ledger`의 `denied_count`·`held_calls`. 판정 기준은 `02_ai_architecture.md` 8.3.9절 표 — **`denied_count`가 많은데 `held_calls`에 여유가 있으면 반납이 새고 있는 것**이고, `quota_overflow`가 잦으면 예약량이 실사용보다 작은 것입니다 |
| **`pause_reason='rate_limited'` 발생** | **0이어야 정상입니다.** 예약이 올바르면 면접 도중 RPD 소진은 구조적으로 일어나지 않습니다. 뜨면 사용자 문제가 아니라 **설계 결함의 신호**이므로 `quota_overflow`로 버킷을 특정해 해당 `AI_RESERVE_*`를 올립니다 |
| **`funding_source='byok'` 행의 `rate_limited`** | **보안 사고로 다룹니다.** 사용자 키 세션이 우리 공용 한도에 부딪혔다는 뜻이므로 **공용 키 폴백 금지가 깨진 것**이고, D29 동의 없는 데이터가 공용 경로로 나갔을 수 있습니다(`02_ai_architecture.md` 8.3.9절) |
| **키 수명주기 (D28)** | `account_events` 5종(`api_key_connected`/`replaced`/`disconnected`/`marked_invalid`/`trial_consent_granted`). **키 원문도 해시도 남지 않습니다** — 남는 것은 사실·시각·`key_last4`뿐입니다 |
| **사용자 키 오류 3분류** | 로그에 `normalizeProviderError`의 `kind`(`transient`/`key_invalid`/`key_quota_exhausted`)와 `keyFingerprint`를 남깁니다. **`key_invalid`가 갑자기 늘면 우리 검증 로직이나 모델 접근 권한을 먼저 의심**하세요 — 사용자들이 동시에 키를 지웠을 리는 없습니다 |

---

## 8. 남은 결정

```
[해소 2026-09-10] 3절 — Vercel Hobby의 함수 실행 시간(300초), 크론 최소 간격(하루 1회)과
            정밀도(±59분), body 4.5MB, 메모리 2GB/1vCPU. 출처 URL과 확인일을 3절 표에 적었다.
            → 60초 가정이 틀렸으므로 평가·코치 체이닝을 폐기했다(D31, 05_api_contract.md 6.2절).
            → 일 1회 크론 판단은 검증됐다. 바꾸지 않는다.
[해소 2026-09-10] AI_QUOTA_RESET_TIMEZONE = America/Los_Angeles.
            Gemini의 RPD는 태평양 시간 자정에 리셋된다(3.1절). 추정이 아니라 확인된 값이다.
            안전 마진 15%는 이제 날짜 경계 완충이 아니라 본래 용도(한도 근처 여유)로만 쓰인다.

[확인 필요 / 남음] 3절 — Vercel Hobby의 대역폭·함수 호출 수 상한, 배포 보호 사용 가능 여부.
            4절 추정으로는 여유가 크다고 보지만 출처를 확인하지 못했다
[확인 필요 / 남음] 3.1절 표 — 선택 모델들의 무료 티어 RPM / RPD / TPM.
            **문서를 더 읽어서 해결되는 항목이 아니다.** Google은 이 수치를 문서에 싣지 않고
            계정별로 AI Studio 대시보드에서 확인하게 한다(2026-09-10 확인).
            소유자가 https://aistudio.google.com/rate-limit 에서 읽어 환경변수 3종에 주입해야 한다.
            절차는 3.1.1절. 주입 전까지 D27 예약 게이트는 fail-open이다.
            → 이 사실이 "수치를 환경변수로 빼고 미설정 시 fail-open" 설계를 검증했다.
              계정마다 다른 값을 코드에 박았다면 첫 배포부터 틀린 정원을 계산하고 있었을 것이다.
[확인 필요 / 남음] 3.2절 — 모델의 JSON Schema 제약 강제 범위.
            **부분 해소(D32):** minLength/maxLength는 지원하지 않음이 확인됐다(02_ai_contracts.md 소관).
            재시도율에 주는 영향은 평가자 구현 시 실측한다
```

```
[결정 완료 D27] 예약 게이트 수치는 전부 환경변수이고, 한도 3종 미설정 시 fail-open이다.
  근거: fail-closed는 환경변수 오타 하나로 서비스를 죽이는 반면, fail-open의 최악은
        "D27 이전 설계"와 같다(폴백 사다리 1~4단계가 그대로 남아 있다).
        설계의 실패 모드가 이전보다 나빠지지 않는 쪽을 택한다.
        대신 침묵하지 않는다 — 부팅 경고 로그 + 배포 전 체크리스트 P1 + 8.3.9절 관측.
  전부 서버 전용이다. 한도 수치는 비밀이 아니지만 하루 체험 정원이 그대로 계산되는 값이고,
  클라이언트에 나가는 여력 정보는 GET /api/capacity의 불리언과 시각 하나뿐이다.
```

```
[결정 완료 D28] 사용자 API 키는 환경변수가 아니라 Supabase Vault에 있다 (1.4절).
  환경변수는 배포 단위 상수이고 사용자 키는 사용자마다 다르므로 그릇 자체가 맞지 않는다.
  복호화 지점은 src/lib/ai/credentials.ts 한 곳이며 CI 검사 3이 이를 강제한다.
  공용 키 폴백 경로는 존재하지 않는다 — 넘어가면 D29 동의 없는 데이터가 공용 경로로 나간다.
```

```
[결정 완료 D24] Preview 환경의 AI 키를 운영 키와 분리한다.
  근거: 무료 티어의 일당 한도(RPD)는 환경을 구분하지 않으므로, 분리하지 않으면
        PR 검증 몇 번이 그날 실제 사용자가 받을 수 있는 리포트 수를 직접 깎는다.
        개발 활동이 프로덕션 가용성을 잠식하는 구조를 남길 이유가 없고,
        무료 티어라 키를 하나 더 만드는 비용은 0이다. 실측 전에 정해도 뒤집힐 위험이 없다.
```

> 전체 결정 기록: [`00_input/decisions.md`](00_input/decisions.md)
