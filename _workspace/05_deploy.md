# 배포 구성 (Vercel + Supabase)

> 소유: `vercel-platform-engineer` · 상태: **초안(draft)**
> 짝 문서: `05_api_contract.md`(엔드포인트·런타임·`maxDuration` 근거)
> 입력: `04_data_layer.md` 6·7·8·12절, `02_ai_architecture.md` 4·8절, `00_input/constraints.md`

## 변경 로그
- 2026-09-09 최초 작성. 환경변수 16종, 공개/비공개 구분, 크론 1종, 무료 플랜 `[확인 필요]` 자리 확보.

---

## 1. 환경변수 전체 목록

**철칙 — `NEXT_PUBLIC_` 접두사는 브라우저 번들에 문자열로 박힙니다.**
빌드 시점에 인라인되므로 배포된 JS 파일을 열면 누구나 읽을 수 있고, **한 번 배포되면 되돌릴 수 없습니다.**
AI 프로바이더 키와 Supabase `service_role` 키에 이 접두사를 붙이는 것은 즉시·영구 유출입니다(고정 제약).

### 1.1 공개 (`NEXT_PUBLIC_` — 브라우저에 노출됨)

| 변수 | 값의 성격 | 용도 | 노출되어도 되는 이유 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 프로젝트 URL | 브라우저 Supabase 클라이언트, Realtime, Storage 직업로드 | 공개 엔드포인트입니다 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 키 | 위와 동일 | **RLS가 전제입니다.** 12개 테이블 전부 RLS가 켜져 있고 정책이 소유자만 허용하므로, 이 키만으로는 남의 데이터에 닿을 수 없습니다. RLS가 하나라도 꺼지면 이 키가 곧 전체 데이터 유출 경로가 됩니다 |
| `NEXT_PUBLIC_SITE_URL` | 배포 URL | 절대 URL 생성(리다이렉트·메타데이터) | 공개 정보 |

**공개 변수는 이 3개가 전부입니다.** 새 `NEXT_PUBLIC_` 변수를 추가할 때는
"이 값이 배포된 JS에 평문으로 박혀도 되는가"를 먼저 답해야 합니다.

### 1.2 서버 전용 (**절대 `NEXT_PUBLIC_` 금지**)

| 변수 | 용도 | 사용 지점 | 유출 시 결과 |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | RLS 우회 쓰기 | `src/lib/supabase/admin.ts` (첫 줄 `import 'server-only'`) | **RLS 전면 무력화. 전 사용자 데이터 읽기·쓰기·삭제 가능** |
| `GOOGLE_AI_API_KEY` | Google AI Studio (플래너·면접관·요약·평가·코치 전부. D11 단독 프로바이더) | `src/lib/ai/providers/google.ts` | 무료 티어 쿼터 도난, 과금 위험 |
| `ANTHROPIC_API_KEY` | 예산이 열릴 때의 전환용. **MVP에서는 설정하지 않습니다** | `src/lib/ai/providers/anthropic.ts`(껍데기) | 종량 과금 도난 |
| `JOB_SECRET` | 내부 워커 라우트(`/api/internal/**`) 인증 | 체이닝 `fetch`의 `Authorization` 헤더, 워커 라우트의 검사 | 누구나 평가 워커를 무한 호출 → 무료 티어 쿼터 소진 |
| `CRON_SECRET` | 크론 라우트(`/api/cron/**`) 인증 | `Authorization: Bearer ${CRON_SECRET}` 검사 | 워치독 임의 실행. 세션이 강제 종료될 수 있음 |
| `AI_MODEL_INTERVIEWER` | 역할별 모델 ID 오버라이드 | `src/lib/ai/roles.ts` | 없음(비밀이 아님). 단 서버 전용으로 둡니다 |
| `AI_MODEL_SUMMARIZER` | 〃 | 〃 | 〃 |
| `AI_MODEL_PLANNER` | 〃 | 〃 | 〃 |
| `AI_MODEL_EVALUATOR` | 〃 | 〃 | 〃 |
| `AI_MODEL_COACH` | 〃 | 〃 | 〃 |
| `AI_PROVIDER` | `google` \| `anthropic`. 기본 `google` | `src/lib/ai/roles.ts` | 없음 |
| `WATCHDOG_EVALUATING_TIMEOUT_MIN` | 기본 `10` | 게으른 워치독·크론 | 없음 |
| `PAUSED_AUTO_CLOSE_DAYS` | 기본 `7` (D7) | 크론 | 없음 |

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
    "src/app/api/sessions/[sessionId]/turns/route.ts":  { "maxDuration": 60 },
    "src/app/api/documents/[documentId]/extract/route.ts": { "maxDuration": 60 },
    "src/app/api/internal/jobs/plan/route.ts":          { "maxDuration": 60 },
    "src/app/api/internal/jobs/evaluate/route.ts":      { "maxDuration": 60 },
    "src/app/api/internal/jobs/coach/route.ts":         { "maxDuration": 60 },
    "src/app/api/cron/daily/route.ts":                  { "maxDuration": 60 },
    "src/app/api/account/route.ts":                     { "maxDuration": 60 },
    "src/app/api/**":                                   { "maxDuration": 15 }
  }
}
```

- `maxDuration`은 **라우트 파일의 `export const maxDuration`으로도** 선언하고 `vercel.json`과 같은 값으로 둡니다.
  한쪽만 두면 나중에 파일이 옮겨졌을 때 조용히 기본값으로 떨어집니다.
- **크론은 하루 1회만 등록합니다.** 무료 플랜의 크론 빈도 제약(3절)에 안전하게 들어가고,
  D7이 자동 종료 시한을 7일로 늘려 일 1회로 충분해졌기 때문입니다(`04_data_layer.md` 3.3절).

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
| S5 | RLS 확인 쿼리 2종 | 결과 **0행** | `04_data_layer.md` 5.4절. 배포 직후 반드시 실행 |
| S6 | Site URL / Redirect URLs | 운영·프리뷰 도메인 등록 | 없으면 로그인 리다이렉트가 깨집니다 |

> **이 서비스에는 이메일 발송 경로가 하나도 없습니다**(D2·D8). SMTP 설정을 하지 않습니다.

---

## 3. 무료 플랜 한도 — **`[확인 필요]` 실측 전에는 값을 적지 않습니다**

이 절의 숫자를 기억으로 채우지 않습니다. 플랜 정책은 바뀌고, 틀린 숫자로 설계를 정당화하는 것이
숫자를 모르는 것보다 나쁩니다. **Phase 3 착수 시 아래 출처에서 확인해 이 표를 채웁니다.**

| 항목 | 값 | 출처 | 우리 설계가 요구하는 것 | 확인 시점 |
|---|---|---|---|---|
| 함수 최대 실행 시간 | `[확인 필요]` | https://vercel.com/docs/functions/configuring-functions/duration | **최대 60초**(I2 평가자). 그 외 전부 ≤ 15초 | 배포 전 |
| 크론 최소 주기 / 개수 | `[확인 필요]` | https://vercel.com/docs/cron-jobs | **일 1회 × 1개**면 충분 | 배포 전 |
| 크론 실행 시각의 정확도 | `[확인 필요]` | 〃 | 워치독은 지연에 둔감합니다(하루 오차 허용) | 배포 전 |
| 대역폭 / 함수 호출 수 | `[확인 필요]` | https://vercel.com/docs/pricing | 4절 추정 참조 | 배포 전 |
| 배포 보호 사용 가능 여부 | `[확인 필요]` | https://vercel.com/docs/deployment-protection | Preview 보호(2.3절) | 배포 전 |

**값이 무엇이든 설계가 성립하는 이유:** `05_api_contract.md` 11.3절이 실행 상한이 60초보다 낮을 때의
조정 순서(Evaluator를 flash로 → 축 단위 분할)를 미리 정해 두었고, 크론은 일 1회 하나뿐이며,
평가 진행은 크론이 아니라 **단계 체이닝**이 이끕니다(6.2절). **크론이 아예 없어도 정상 경로는 동작합니다** —
크론은 아무도 보지 않는 세션을 위한 안전망일 뿐입니다.

### 3.1 선택 모델의 무료 티어 한도 — **`[확인 필요]` (Phase 3 착수 시 여기에 기록)**

`02_ai_architecture.md` 8절의 호출 예산 **전체가 이 값에 매달려 있습니다.**
출처: Google AI Studio / Gemini API 요금·한도 문서.

| 역할 | 모델 | RPM | RPD | TPM | 확인일 | 출처 URL |
|---|---|---|---|---|---|---|
| `interviewer` | `gemini-2.5-flash-lite` | `[확인 필요]` | `[확인 필요]` | `[확인 필요]` | | |
| `summarizer` | `gemini-2.5-flash-lite` | `[확인 필요]` | `[확인 필요]` | `[확인 필요]` | | |
| `planner` | `gemini-2.5-flash` | `[확인 필요]` | `[확인 필요]` | `[확인 필요]` | | |
| `evaluator` | `gemini-2.5-pro` | `[확인 필요]` | `[확인 필요]` | `[확인 필요]` | | |
| `coach` | `gemini-2.5-flash` | `[확인 필요]` | `[확인 필요]` | `[확인 필요]` | | |

**대조할 우리 소비량**(`02_ai_architecture.md` 8.1절, 20턴 세션 1건 기준):

```
호출 26회 = planner 1 + interviewer ≤20 + summarizer ≤3 + evaluator 1 + coach 1
입력 약 61,000 토큰 / 출력 약 8,000 토큰
동시 세션 N개일 때 대략 1.5 × N RPM (면접관 호출은 사용자 발화 간격에 묶임)
```

**기록해야 할 것 (Phase 3):**

| # | 값 | 그 값으로 계산할 것 |
|---|---|---|
| 1 | 모델별 RPM | **동시 세션 상한.** 초과하면 폴백 사다리 3~4단계로 내려갑니다 |
| 2 | 모델별 RPD | **하루 최대 세션 수** = RPD ÷ 26 (병목 모델 기준). MVP 사용자 20~30명 규모에 맞는지 |
| 3 | `gemini-2.5-pro`의 RPD | 평가자는 세션당 1회(+재시도 ≤3)이므로 **여기가 리포트 생성의 상한**입니다 |
| 4 | TPM | 세션당 입력 61K가 몇 세션까지 동시에 들어가는지 |
| 5 | 429의 `Retry-After` 유무 | `resumable_after` 계산에 씁니다(`05_api_contract.md` 10.1절). 없으면 다음 날 00:00 UTC |

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

---

## 4. 무료 플랜 안에 들어가는가 — 설계 측 근거

| 압박 지점 | 우리 설계 | 판단 |
|---|---|---|
| **함수 실행 시간** | 60초를 요구하는 라우트는 **I2(평가자) 하나뿐**. 나머지는 전부 ≤15초 | 위험이 한 점에 모여 있어 조정 레버도 한 개(11.3절)입니다 |
| **함수 호출 수** | 세션 1건당 서버 호출 약 **40~50회**(CRUD 15 + 면접관 턴 20 + 워커 체인 2~5 + 폴링) | Realtime을 쓰므로 폴링이 거의 없습니다(`04_data_layer.md` 8.1절: "무료 티어에서 폴링보다 저렴") |
| **크론** | **일 1회 × 1개** | 가장 보수적인 크론 정책에도 들어갑니다 |
| **대역폭** | 오디오를 저장·전송하지 않습니다. 문서는 클라이언트가 Storage에 **직접** 올려 Vercel 대역폭을 쓰지 않습니다(`04_data_layer.md` 7.4절) | Vercel 쪽 대역폭은 사실상 HTML·JS·JSON뿐 |
| **Supabase DB 용량** | 스냅샷 텍스트가 유일한 증가 요인(세션당 수십 KB 추정, `04_data_layer.md` 14.1절 `[확인 필요]`) | |
| **Supabase Storage 용량** | D3으로 원본 파일을 계속 보관하므로 **단조 증가**합니다. 줄어드는 힘이 없습니다 | 한도에 닿으면 D3을 되돌리는 정책 결정이 필요합니다 |
| **AI 무료 티어** | 3.1절 `[확인 필요]` | 유일하게 실측 전까지 확신할 수 없는 항목 |

**설계상 $0을 유지하는 핵심 3가지**: (1) 오디오 미저장·미전송, (2) 문서 Storage 직업로드,
(3) Realtime 1테이블 구독으로 폴링 제거. 셋 다 이미 다른 문서에서 확정된 결정입니다.

---

## 5. 크론 라우트 `GET /api/cron/daily`가 하는 일 (4가지, 순서 고정, 전부 멱등)

```
0. Authorization: Bearer ${CRON_SECRET} 검사 → 불일치 시 401
1. paused 자동 종료 (D7 — 7일)
   where status='paused' and paused_at < now() - interval '7 days'
   답변한 주질문 ≥ 1 → completed (+ 평가 체인 시작, 리포트에 "중단된 세션" 배지)
   답변한 주질문 = 0 → abandoned
   ※ idx_sessions_status_updated 부분 인덱스를 탑니다
2. evaluating 워치독 (게으른 워치독이 놓친 세션)
   where status='evaluating' and evaluations.started_at < now() - 10분
   attempt_count < 3 → 워커 재체이닝 / 소진 → failed (failure_reason='evaluation_failed')
3. in_progress 유실 세션 (15절 #2 근사)
   where status='in_progress' and updated_at < now() - (max_duration_min + 30분)
   → paused (pause_reason='connection_lost')
   ※ 이 상태는 부분 인덱스에 없어 순차 스캔입니다. MVP 규모에서 허용
4. Storage 스위퍼 (04_data_layer.md 9.4절)
   storage_cleanup_queue의 pending 200건 → storage.remove() → done / attempt_count += 1
   + documents에 대응 행이 없는 24시간 이상 된 고아 객체 제거
   + done 행 중 30일 지난 것 삭제
```

- **각 단계는 배치 상한(200건)을 두고, 못 끝낸 분량은 다음 날 이어서 처리합니다.** 한 번의 실행이
  `maxDuration`을 넘기지 않게 하는 것이 우선이며, 워치독은 하루 늦어도 사용자 경험이 달라지지 않습니다.
- **단계 하나가 실패해도 다음 단계를 실행합니다.** 스위퍼 실패로 세션 자동 종료가 멈추면 안 됩니다.
- 실행 결과는 `session_events`(1~3단계, `trigger='scheduler'`)와 애플리케이션 로그(4단계)에 남깁니다.

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
```

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

---

## 8. 남은 결정

```
[확인 필요] 3절 표 전체 — Vercel 무료 플랜의 함수 실행 시간, 크론 주기, 대역폭.
            Phase 3 착수 시 출처 URL과 확인일을 함께 기록한다
[확인 필요] 3.1절 표 전체 — 선택 모델들의 무료 티어 RPM / RPD / TPM.
            02_ai_architecture.md 8절의 호출 예산 전체가 이 값에 매달려 있다
[확인 필요] 3.2절 — 모델의 JSON Schema 제약 강제 범위 (평가자 구현 시)
```

```
[결정 완료 D24] Preview 환경의 AI 키를 운영 키와 분리한다.
  근거: 무료 티어의 일당 한도(RPD)는 환경을 구분하지 않으므로, 분리하지 않으면
        PR 검증 몇 번이 그날 실제 사용자가 받을 수 있는 리포트 수를 직접 깎는다.
        개발 활동이 프로덕션 가용성을 잠식하는 구조를 남길 이유가 없고,
        무료 티어라 키를 하나 더 만드는 비용은 0이다. 실측 전에 정해도 뒤집힐 위험이 없다.
```

> 전체 결정 기록: [`00_input/decisions.md`](00_input/decisions.md)
