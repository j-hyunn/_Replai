# UI 플랜 (Next.js App Router + shadcn/ui 단독)

> 소유: `shadcn-ui-engineer` · 상태: **초안(draft)** · `ui_plan_version = "1.0.0-draft"`
> 입력(원본 문서, 이 문서는 이들을 따르며 뒤집지 않습니다):
> `01_product_spec.md` 7절(화면 11개) · `01_state_machine.md`(상태·전이·4상태) ·
> `01_rubric.md`(리포트 구성·D1) · `03_voice_pipeline.md` 11·12·14.4절(UI 상태 계약) ·
> `04_data_layer.md` 7·8·9·12절(Storage·Realtime·삭제) · `05_api_contract.md` **1·12절(훅 타입의 원본)**
> D27~D30 관련 입력: `01_product_spec.md` **6.5·7·10절** · `01_state_machine.md` **4.5절** ·
> `02_ai_architecture.md` **4.6·13.6.3·13.7절** · `05_api_contract.md` **4.7·4.8·4.9·10.2·13·14절**
> 함께 읽을 것: `00_input/decisions.md`(**확정 결정 30건** — 판정 기준이며 재논의 대상이 아닙니다)

## 변경 로그
- 2026-09-09 최초 작성. 라우트 11개, 훅 34개(엔드포인트 32 + 비엔드포인트 훅), 공용 컴포넌트 트리, 접근성·테마 방침 확정.
- 2026-09-09 **QA 대응(F1·F2·F3·F4·F11·F13·F14) + 계약 2차 갱신 반영.** 확정 결정 D18~D22를 문서 전체에 적용했습니다.
  - **D18(F1)** — 평가 시작 주체는 **서버**입니다. 8.1절의 리포트 진입 시 자동 호출을 **삭제**했고,
    훅 이름을 `useStartEvaluation` → **`useRetryEvaluation`**(`failed` 재시도 전용)으로 바꿨습니다.
    `#15`/`#9` 응답의 `session.status`가 정상 경로에서 **`evaluating`**이라는 사실을 화면 분기에 반영했습니다.
  - **D19(F2)** — **취소 ≠ 삭제.** "폐기"·"세션 버리기"를 `useDeleteSession`에서 **`useCancelSession`(#33)** 으로
    옮겼습니다. 10절을 "취소 UI와 삭제 UI"로 재편하고 10.1절(취소)을 신설했으며, `/sessions`에
    **"취소된 세션 보기" 토글**(`includeCanceled`)을 추가했습니다.
  - **D20(F3)** — `Evaluation.myFeedback` / `myDisputes`로 피드백·이의 접수 상태를 **새로고침 후에도 복원**하고,
    이미 이의를 제기한 축·인용의 **중복 제기를 차단**합니다(7.5·7.6절).
  - **D21(F4)** — `useDocument`(#34 `DocumentDetail`) 신설. 문서 삭제 확인 다이얼로그가 **누르기 전에**
    `linkedSessionCount` / `configuringSessionCount`를 보여 줍니다(10.3절).
  - **D22** — 토스트는 **`sonner`로 확정**(13절 미결 해소). 이 예외는 `sonner` 하나뿐이며 직접 조립 6종은 그대로입니다.
  - **F7 반영** — `utterance_done` 페이로드에 `sessionStatus`가 원본(`02_ai_contracts.md` 3.5절)에도 추가됐습니다.
  - **F13** — 머리말의 "확정 결정 17건"을 22건으로 정정. **F14** — 7.2절에 루브릭 축 5개 식별자 매핑 표 추가.
  - 신설 훅 3개(`useCancelSession` `useDocument` `useAbandonPreparation`), 개명 1개, 삭제 0개 → 훅 **37개**.
  - 부수 정정: 5절 이후 본문의 절 번호 상호 참조가 한 칸씩 밀려 있던 것을 실제 절 번호로 맞췄습니다.
- 2026-09-10 **D27(예약 게이트)·D28(BYOK)·D29(체험 동의)·D30(체험 예약 1건 제한) 반영.** 문서를 재작성하지 않고 해당 절만 고쳤습니다.
  - **신규 화면 `/settings/api-key`**(4.12절) — 키 연결·교체·해제. **끝 4자리 마스킹만**, 발급 안내, D29 프라이버시 설명, `?next=` 복귀.
    **키 입력 폼은 이 라우트 한 곳에만 존재합니다**(`01_product_spec.md` 7절 근거 4).
  - **신규 다이얼로그 2종** — 체험 데이터 처리 동의(4.13절, D29) / 여력·키 안내 3종(4.14절, D27·D28).
  - **신설 훅 6개** — `useCapacity` `useApiKeyStatus` `useConnectApiKey` `useDisconnectApiKey` `useVerifyApiKey` `useGrantTrialConsent`
    (계약 #36~#41). 훅 **37개 → 43개**.
  - **기존 shape 변경 2건** — `Session.fundingSource`(nullable 아님) 추가, **`PauseReason` 3종 → 5종**.
    재개 패널(4.6.1절)이 **5종 전부**를 분기하며, `byok_quota_exhausted`에는 **재개 가능 시각을 표시하지 않습니다**.
  - **신규 오류 4종 처리** — 503 `capacity_unavailable`, 409 `trial_consent_required` / `consent_version_stale` /
    `byok_key_invalid` / `byok_quota_exhausted`. SSE `stream_error.code`에도 뒤 2종이 추가됐습니다(3.3절).
  - **D30** — 체험 사용자의 두 번째 `prepare`가 409입니다. 4.4절에 **기존 세션으로 보내는 링크**가 있는 안내를 넣었습니다.
  - **리포트의 키 연결 CTA**는 "같은 이력서로 다시 하기"와 **같은 카드 안**입니다(8.4절). 두 CTA를 경쟁시키지 않습니다.
  - **여력 부족 화면의 1순위 버튼은 "키 연결하기"** 입니다(4.14절 — `02_ai_architecture.md` 13.7.3절).
  - 금칙어 검사를 12.1절 옆이 아니라 **4.14.4절**에 상시 검사 항목으로 두었습니다.
- 2026-09-10 **QA 2차 G2 대응 — D30 소거법·폴백 폐기.** 4.4절만 고쳤고 문서를 재작성하지 않았습니다.
  - 계약 3차 갱신이 **409 `trial_reservation_exists`** 와 `details.existingSessionId`(**항상 채워짐, `null` 아님**)를
    확정했습니다(`05_api_contract.md` **13절 오류 표 + 13절 `trial_reservation_exists` 예시 · 4.7.6절**).
    **인용은 줄 번호가 아니라 절 번호로 답니다** — 계약이 갱신될 때마다 줄이 밀려 인용이 썩습니다.
  - **소거법 폐기** — "다른 409 3종이 아니면 D30"으로 판정하던 방식을 삭제하고, `usePrepareSession`의 오류를
    **`error.code` 직접 분기**로 바꿨습니다(409 4종 + 503 1종). 알 수 없는 `code`는 일반 오류로 떨어집니다.
  - **`activeSessions` 폴백 삭제** — `[이어서 하기]`의 목적지는 `details.existingSessionId` 하나뿐입니다.
    추측으로 고른 세션은 사용자를 엉뚱한 면접으로 보냅니다.
  - D30 안내에 **`[이전 면접 취소하기]`(#33 `useCancelSession`)** 를 추가했습니다 — 취소는 예약 반납을
    부작용으로 가지므로 막다른 길이 아닙니다. 이 안내를 503 여력 부족 화면과 섞지 않습니다.
  - **재확인(D34 이후)** — 계약이 D34로 재작성된 뒤에도 **409 `trial_reservation_exists`** 와
    `details.existingSessionId`(**항상 채워짐**)는 그대로입니다(`05_api_contract.md` 13절 · 4.7.6절).
    이 절의 계약 인용을 **줄 번호에서 절 번호로 바꿨습니다** — D34로 줄이 밀려 인용이 엉뚱한 타입 정의를
    가리키고 있었습니다. 분기 로직 자체는 고칠 것이 없었습니다(소거법·폴백은 이미 삭제된 상태).
  - **16절 #10 해소 처리**(14절 §5·15절 서술도 함께 정리). **16절 #11도 해소** — `02_ai_architecture.md`
    13.6.3절에 "API 키"·"한도" 예외가 명문화되어 QA가 grep 히트를 오탐으로 처리할 필요가 없어졌습니다.
  - 훅 추가·개명·삭제 없음(**43개 그대로**). 새 UI 라이브러리 없음.

---

## 0. 이 문서의 위상과 절대 제약

| 항목 | 내용 |
|---|---|
| **UI 라이브러리** | **shadcn/ui 단독.** MUI·Ant·Chakra·Mantine·DaisyUI·Bootstrap 등 **도입 금지**. shadcn에 없는 것은 **Radix 프리미티브 + Tailwind + `cn()`** 으로 `components/ui/` 규약에 맞춰 직접 조립합니다(13절에 목록) |
| **아이콘** | `lucide-react`만 (shadcn 전제). 다른 아이콘 팩 설치 금지 |
| **색** | 하드코딩 금지. shadcn 테마 토큰(CSS 변수)과 Tailwind 유틸리티만 (12절) |
| **타입의 원본** | `05_api_contract.md` **12절**. 이 문서는 파생일 뿐이며, 두 문서가 다르면 **계약이 옳습니다** |
| **응답 래핑** | `05_api_contract.md` **1절**. 최상위 배열을 반환하는 엔드포인트는 **하나도 없습니다** |
| **음성 4상태** | `listening` `transcribing` `thinking` `speaking` — **문자 단위 계약**(U1). 번역·축약·변형 금지 |

---

## 1. 라우트 트리 — 실제 파일 경로와 URL

라우트 그룹 `(...)`는 **URL에 나타나지 않습니다.** 링크를 쓸 때마다 아래 표의 "URL" 열과 대조합니다.

```
src/app/
├── layout.tsx                                     루트 레이아웃(테마·폰트·Toaster·SkipLink)
├── globals.css                                    shadcn 테마 토큰
├── (marketing)/
│   └── page.tsx                                   → /
├── (auth)/
│   └── login/page.tsx                             → /login
└── (app)/
    ├── layout.tsx                                 AppShell(헤더·네비·미열람 배지)
    ├── dashboard/page.tsx                         → /dashboard
    ├── sessions/
    │   ├── page.tsx                               → /sessions
    │   ├── new/page.tsx                           → /sessions/new
    │   └── [sessionId]/
    │       ├── ready/page.tsx                     → /sessions/{id}/ready
    │       ├── interview/page.tsx                 → /sessions/{id}/interview
    │       ├── report/page.tsx                    → /sessions/{id}/report
    │       └── transcript/page.tsx                → /sessions/{id}/transcript
    ├── documents/page.tsx                         → /documents
    └── settings/
        ├── account/page.tsx                       → /settings/account
        └── api-key/page.tsx                       → /settings/api-key   ★신규 (D28)
```

| # | URL | 페이지 파일 | 렌더 방식 |
|---|---|---|---|
| 1 | `/` | `(marketing)/page.tsx` | 서버 컴포넌트(정적) |
| 2 | `/login` | `(auth)/login/page.tsx` | 클라이언트 컴포넌트 |
| 3 | `/dashboard` | `(app)/dashboard/page.tsx` | 클라이언트(훅) |
| 4 | `/sessions/new` | `(app)/sessions/new/page.tsx` | 클라이언트 |
| 5 | `/sessions/{sessionId}/ready` | `.../ready/page.tsx` | 클라이언트 |
| 6 | `/sessions/{sessionId}/interview` | `.../interview/page.tsx` | 클라이언트 |
| 7 | `/sessions/{sessionId}/report` | `.../report/page.tsx` | 클라이언트 |
| 8 | `/sessions/{sessionId}/transcript` | `.../transcript/page.tsx` | 클라이언트 |
| 9 | `/sessions` | `(app)/sessions/page.tsx` | 클라이언트 |
| 10 | `/documents` | `(app)/documents/page.tsx` | 클라이언트 |
| 11 | `/settings/account` | `(app)/settings/account/page.tsx` | 클라이언트 |
| **12** ★신규 | **`/settings/api-key`** | `(app)/settings/api-key/page.tsx` | 클라이언트 |
| — | `/sessions/{sessionId}/compare` | **만들지 않음** `[later]` | — |

**정적 세그먼트 우선순위 확인.** `/sessions/new`는 정적 세그먼트이고 `/sessions/[sessionId]`는 동적입니다.
Next.js는 정적을 먼저 매칭하므로 `new`가 `sessionId`로 해석되는 일은 없습니다. 다만 `[sessionId]` 아래에는
`page.tsx`를 두지 않습니다(`/sessions/{id}` 단독 URL을 만들지 않음) — 세션 상세의 실체는 상태에 따라
`ready`/`interview`/`report` 중 하나이고, 중간 라우트를 만들면 "어디로 보낼지"를 두 곳에서 판단하게 됩니다.

**상태 → 화면 라우팅은 한 곳에만 둡니다.** `src/lib/session/route-for-status.ts`:

```
created | configuring        → /sessions/new?sessionId={id}
ready                        → /sessions/{id}/ready
in_progress | paused         → /sessions/{id}/interview
completed | evaluating | evaluated | failed → /sessions/{id}/report
abandoned                    → /sessions            (리포트가 없으므로 목록으로)
canceled                     → /sessions?includeCanceled=true   (행은 남아 있다 — D19)
```

각 페이지는 진입 시 자기 상태가 아니면 위 함수 결과로 `router.replace()` 합니다. 이것이 딥링크·뒤로가기·
Realtime 전이 세 경로의 유일한 분기입니다.

- **`canceled`는 목록에서 기본적으로 숨겨집니다**(D19, 4.3절 계약). 그래서 목적지에 `?includeCanceled=true`를
  붙입니다 — 그러지 않으면 취소된 세션의 딥링크가 **자기 자신이 보이지 않는 목록**으로 떨어집니다.
- **`completed`와 `evaluating`은 둘 다 리포트로 보냅니다**(D18). `#15`/`#9` 직후의 정상 상태는
  `completed`가 아니라 `evaluating`이므로, 두 값 중 하나만 처리하는 분기를 쓰면 깨집니다(계약 4절 경고).

**`/settings/api-key`의 `?next=` 복귀 (D28).** 이 화면에는 최소 네 곳에서 딥링크로 들어옵니다 —
리포트 하단 CTA(8.4절) · 여력 부족 안내(4.14절) · 대시보드 배너(4.3절) · 동의 거부(4.13절).
전부 `?next={돌아갈 URL}`을 붙이고, 연결 성공 후 그 경로로 `router.replace()` 합니다.

- **`next` 값은 검증합니다.** `/`로 시작하고 `//`·`/\`로 시작하지 않는 **내부 경로만** 받습니다.
  그 외에는 조용히 무시하고 `/dashboard`로 보냅니다(오픈 리다이렉트 방지).
- **`next`에 키·토큰 등 어떤 비밀도 싣지 않습니다.** 이 쿼리에 들어가는 것은 **경로뿐**입니다(4.12절 보안 규칙).
- 준비 화면에서 온 경우 `next`는 `/sessions/new?sessionId={id}`입니다 — 세션은 `configuring`에 그대로
  남아 있으므로(계약 4.9.2절) 돌아오면 설정이 보존된 채 이어서 준비할 수 있습니다.

**미들웨어 리다이렉트와의 정합**(`05_api_contract.md` 7.2절): 미인증 사용자가 `(app)` 이하로 오면
`/login?next={원래 경로}`로 302됩니다. 로그인 성공 후 UI는 `next` 쿼리로 복귀하고, 없으면 `/dashboard`입니다.

---

## 2. 공용 데이터 계층 — 훅을 쓰기 전에 고정되는 것

### 2.1 `fetchJson` — 언랩하지 않습니다. 언랩은 훅의 일입니다

```ts
// src/lib/api/fetch-json.ts
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,          // 05_api_contract.md 13절의 code
    message: string,                // 서버가 준 한국어 message
    readonly details?: unknown,
  ) { super(message); }
}

// T는 "봉투(envelope) 전체"의 타입이다. 리소스 타입이 아니다.
export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T>;
```

- 응답 바디에 `error` 키가 있으면 `ApiError`를 던집니다. **성공 바디와 오류 바디는 섞이지 않습니다**(계약 1절).
- `204`는 `undefined`를 돌려줍니다(#32 `usePrewarm`).
- **SSE 응답(#9)에는 절대 쓰지 않습니다.** `fetchJson`은 내부에서 `res.json()`을 호출하므로 스트림을 삼킵니다.

### 2.2 제네릭은 주장이지 검사가 아닙니다 — 훅 작성 규칙

```ts
// 금지 — 컴파일은 통과하고 런타임에 깨진다
const sessions = await fetchJson<SessionSummary[]>('/api/sessions');

// 필수 — 봉투를 그대로 선언하고, 훅이 명시적으로 꺼낸다
const res = await fetchJson<{ sessions: SessionSummary[]; nextCursor: string | null }>('/api/sessions');
```

### 2.3 상태 관리

- 서버 상태: **TanStack Query**. UI 라이브러리가 아니라 데이터 페칭 라이브러리이므로 shadcn-only 제약과 무관합니다.
  (렌더링하는 DOM이 하나도 없습니다. 이것이 판별 기준입니다.)
- 폼: **react-hook-form + zod** — shadcn `form` 컴포넌트가 이 둘을 전제로 생성됩니다. shadcn 공식 의존성입니다.
- 클라이언트 상태(음성 4상태, 스트리밍 버퍼): `useReducer` 기반 로컬 상태. 전역 스토어를 두지 않습니다.

### 2.4 쿼리 키 규칙

```
['dashboard']                            ['sessions', {status, cursor}]
['session', sessionId]                   ['turns', sessionId]
['evaluation', sessionId]                ['transcript', sessionId]
['documents', {docType, cursor}]         ['account']
['capacity']                             ['apiKey']
```

`['capacity']`와 `['apiKey']`는 **같은 서버 사실의 두 창**입니다(계약 4.7.5절 — `/api/capacity`가
`user_api_keys`를 함께 읽습니다). 그래서 **키를 바꾸는 뮤테이션 3개(#38·#39·#40)는 성공 시 두 키를 모두
invalidate** 합니다. 한쪽만 무효화하면 키를 연결한 직후에도 "시작할 수 없어요"가 남아 있게 됩니다.
`useGrantTrialConsent`(#41) 성공 시에도 `['capacity']`를 invalidate 합니다(`requiresTrialConsent`가 바뀝니다).

Realtime 알림과 상태 전이 뮤테이션은 **해당 키를 무효화(invalidate)** 할 뿐, 캐시에 값을 직접 써넣지 않습니다.

---

## 3. 데이터 페칭 훅 목록 (**QA 교차 대조 기준선**)

"언랩" 열: **예** = 훅이 봉투에서 리소스를 꺼내 반환 / **아니오** = 봉투 모양 그대로 반환(키가 2개 이상이거나 `nextCursor`가 필요한 경우).
`05_api_contract.md` 4절의 "대응 훅" 열과 이름이 **문자 단위로 같습니다.**

### 3.1 조회 훅 (`useQuery`)

| 훅 | 엔드포인트 | 응답 봉투 | 언랩 | **훅 반환 타입(camelCase)** |
|---|---|---|---|---|
| `useDashboard` | `GET /api/dashboard` | `{ activeSessions, unreadReportCount, recentSessions }` | 아니오 | `{ activeSessions: SessionSummary[]; unreadReportCount: number; recentSessions: SessionSummary[] }` |
| `useSessions` | `GET /api/sessions` | `{ sessions, nextCursor }` | 아니오 | `{ sessions: SessionSummary[]; nextCursor: string \| null }` |
| `useSession` | `GET /api/sessions/[sessionId]` | `{ session }` | **예** | `Session` |
| `useTurnsResync` | `GET /api/sessions/[sessionId]/turns` | `{ turns, questions }` | 아니오 | `{ turns: Turn[]; questions: Question[] }` |
| `useEvaluation` | `GET /api/sessions/[sessionId]/evaluation` | `{ evaluation }` | **예** | `Evaluation \| null` ← **`null`은 오류가 아닙니다.** `Evaluation`에는 **`myFeedback: ReportFeedback \| null`과 `myDisputes: ScoreDispute[]`가 포함**됩니다(D20) |
| `useTranscript` | `GET /api/sessions/[sessionId]/transcript` | `{ turns, questions }` | 아니오 | `{ turns: Turn[]; questions: Question[] }` |
| `useDocuments` | `GET /api/documents` | `{ documents, nextCursor }` | 아니오 | `{ documents: Document[]; nextCursor: string \| null }` |
| **`useDocument`** ✅신규 | `GET /api/documents/[documentId]` (#34) | `{ document }` | **예** | **`DocumentDetail`** = `Document & { linkedSessionCount: number; configuringSessionCount: number }` (D21) |
| `useDocumentDownloadUrl` | `GET /api/documents/[documentId]/download-url` | `{ url, expiresInSec }` | 아니오 | `{ url: string; expiresInSec: 60 }` |
| `useAccount` | `GET /api/account` | `{ profile, stats }` | 아니오 | `{ profile: Profile; stats: AccountStats }` |
| **`useCapacity`** ★신규 | `GET /api/capacity` (#36) | `{ capacity }` | **예** | **`Capacity`** = `{ canStartSession: boolean; keyStatus: KeyStatus; trialStatus: TrialStatus; nextFundingSource: FundingSource \| null; requiresTrialConsent: boolean; consentVersion: string; availableAtIso: string \| null }` |
| **`useApiKeyStatus`** ★신규 | `GET /api/account/api-key` (#37) | `{ apiKey }` | **예** | **`ApiKeyStatus`** = `{ keyStatus: KeyStatus; keyLast4: string \| null; provider: 'google' \| null; lastVerifiedAt: string \| null; lastFailureCode: 'auth_rejected' \| 'quota_exhausted' \| 'unknown' \| null; lastFailureAt: string \| null }` — **키 원문 필드가 없습니다** |

- `useDocumentDownloadUrl`은 **자동 실행하지 않습니다**(`enabled: false` + `refetch()`). 만료 60초짜리 URL을
  화면 진입 때마다 발급하면 쓰지도 않을 서명 URL이 쌓입니다. 사용자가 "원본 열기"를 누를 때만 발급합니다.
- `useEvaluation`은 호출 자체가 서버의 **게으른 워치독**과 `report_first_viewed_at` 기록을 겸합니다
  (계약 6.5·6.6절). 그래서 리포트 화면에서 **이 훅을 건너뛰는 최적화를 하면 안 됩니다** — 지표 2가 통째로 빕니다.
- **`myFeedback`·`myDisputes` 전용 조회 훅을 따로 만들지 마세요**(D20). 값은 `useEvaluation` 하나에 실려 옵니다.
  `myDisputes`는 비어 있어도 **`[]`이고 `null`이 아니므로**, `.map()` 앞에 `?? []`를 두지 않습니다(계약 12.3절).
- `useDocument`는 **삭제 확인 다이얼로그를 열 때만** 실행합니다(`enabled: false` + `refetch()`).
  목록의 모든 행에 대해 미리 부르면 문서 수만큼 집계 쿼리가 나갑니다.

**`useCapacity`·`useApiKeyStatus`를 쓸 때 틀리기 쉬운 6가지 (D27·D28·D29)**

1. **`canStartSession`을 직접 계산하지 마세요.** `keyStatus === 'connected'`면 여력과 **무관하게 항상 `true`**
   입니다(계약 4.7.5절). 프론트가 `trialStatus`로 다시 계산하면 BYOK 사용자에게 벽이 생깁니다.
2. **`availableAtIso === null`을 "내일 오세요"로 렌더하지 마세요.** 체험 소진으로 막힌 경우 `null`이며,
   **기다려도 풀리지 않는 벽**입니다. 시각 줄 자체를 빼고 키 연결 CTA만 남깁니다(4.14절).
3. **`consentVersion`을 하드코딩하지 마세요.** `useCapacity` 응답의 값을 그대로 `useGrantTrialConsent`에
   되돌려 보냅니다. 하드코딩하면 문구를 올린 순간 **409 `consent_version_stale`** 이 납니다.
4. **동의 여부 판정은 `requiresTrialConsent` 하나입니다.** `#41` 응답의 `consent.sessionId`로 분기하지 마세요 —
   같은 버전에 이미 동의한 사용자에게는 **기존 행이 그대로 돌아옵니다**(멱등, 계약 14절 함정 2).
5. **잔여량·한도·버킷 이름은 응답에 없고 앞으로도 없습니다.** 그 값을 요구하는 UI를 설계하지 마세요.
6. **`ApiKeyStatus`에 키 원문 필드가 없으므로 "보기" 토글·복사 버튼을 만들 수 없습니다.**
   화면에 쓸 수 있는 키 값은 **`keyLast4` 하나뿐**입니다(계약 4.8.1절 강제 1).

- 두 훅은 `staleTime`을 짧게(30초) 두고, `/dashboard` · `/sessions/new` · 리포트 · `/settings/*` 네 화면에서
  공유합니다. 화면마다 다시 부르지 않습니다.
- **`useCapacity`가 실패해도 화면을 오류로 덮지 않습니다.** 시작 버튼을 잠그는 **부차 정보**이므로,
  실패 시에는 버튼을 활성으로 두고 서버의 503을 받아 4.14절 안내를 띄웁니다.
  **권위 있는 판정은 언제나 `#3`/`#6`의 응답이지 이 훅이 아닙니다**(계약 4.7.1절 — `#3`의 조회는 비원자적입니다).

### 3.2 변경 훅 (`useMutation`)

| 훅 | 엔드포인트 | 요청 body | 응답 봉투 | 언랩 | **훅 반환 타입** |
|---|---|---|---|---|---|
| `useCreateSession` | `POST /api/sessions` | `{ sourceSessionId?: string \| null }` | `201 { session }` | **예** | `Session` |
| `useUpdateSessionConfig` | `PATCH /api/sessions/[sessionId]/config` | `SessionConfigPatch` | `{ session }` | **예** | `Session` |
| `usePrepareSession` | `POST /api/sessions/[sessionId]/prepare` | — | `202 { sessionId, status, preparation }` | 아니오 | `{ sessionId: string; status: 'configuring'; preparation: PreparationState }` |
| `useBackToConfig` | `POST /api/sessions/[sessionId]/back-to-config` | — | `{ session }` | **예** | `Session` |
| `useStartSession` | `POST /api/sessions/[sessionId]/start` | `{ micReady: boolean }` | `{ session, openingQuestion }` | 아니오 | `{ session: Session; openingQuestion: Question }` |
| `useCorrectTurn` | `PATCH /api/sessions/[sessionId]/turns/[turnId]` | `{ transcriptText: string }` | `{ turn }` | **예** | `Turn` |
| `useSwitchModality` | `POST /api/sessions/[sessionId]/modality` | `{ modality, reason }` | `{ session }` | **예** | `Session` |
| `usePauseSession` | `POST /api/sessions/[sessionId]/pause` | `{ pauseReason: PauseReason }` | `{ session }` | **예** | `Session` |
| `useResumeSession` | `POST /api/sessions/[sessionId]/resume` | — | `{ session, currentQuestion, lastInterviewerTurn }` | 아니오 | `{ session: Session; currentQuestion: Question \| null; lastInterviewerTurn: Turn \| null }` |
| `useCompleteSession` | `POST /api/sessions/[sessionId]/complete` | — | `{ session }` | **예** | `Session` |
| **`useRetryEvaluation`** (구 `useStartEvaluation`) | `POST /api/sessions/[sessionId]/evaluate` | — | `202 EvaluationJobAccepted` | 아니오 | `{ sessionId: string; status: 'evaluating'; evaluationId: string; attempt: number; pollAfterMs: number }` ← **`failed` 재시도 전용**(D18). `completed`·`evaluating`·`evaluated`에 부르면 **409** |
| `useRetryCoach` | `POST /api/sessions/[sessionId]/coach/retry` | — | `202 { sessionId, evaluationId, coachStatus }` | 아니오 | `{ sessionId: string; evaluationId: string; coachStatus: 'running' }` |
| `useReportFeedback` | `PUT /api/sessions/[sessionId]/feedback` | `{ isHelpful, comment? }` | `{ feedback }` | **예** | `ReportFeedback` |
| `useCreateDispute` | `POST /api/sessions/[sessionId]/disputes` | `{ scoreId, citationId?, reasonCode, comment? }` | `201 { dispute }` | **예** | `ScoreDispute` |
| `useReportEvent` | `POST /api/sessions/[sessionId]/events` | `{ eventName: ClientEventName, detail? }` | `{ ok: true }` | 아니오 | `void`(반환값 사용 안 함) |
| **`useCancelSession`** ✅신규 | `POST /api/sessions/[sessionId]/cancel` (#33) | — | `{ session }` | **예** | `Session` (`status === 'canceled'`). **행은 남습니다 — 삭제가 아닙니다**(D19, 10.1절) |
| **`useAbandonPreparation`** ✅신규 | `POST /api/sessions/[sessionId]/abandon-preparation` (#35) | — | `{ session }` | **예** | `Session` (`status === 'failed'`, `failureReason === 'document_extraction_failed'`) |
| `useDeleteSession` | `DELETE /api/sessions/[sessionId]` | — | `{ ok: true }` | 아니오 | `void` ← **실제 삭제.** 취소(`useCancelSession`)와 **다른 경로**입니다(계약 4.2절) |
| `useCreateDocument` | `POST /api/documents` | `DocumentCreate` | `201 { document }` | **예** | `Document` |
| `useExtractDocument` | `POST /api/documents/[documentId]/extract` | — | `{ document }` | **예** | `Document` |
| `useUpdateDocument` | `PATCH /api/documents/[documentId]` | `{ title?, extractedText? }` | `{ document }` | **예** | `Document` |
| `useDeleteDocument` | `DELETE /api/documents/[documentId]` | — | `{ ok, affectedSessionCount, configuringSessionCount }` | 아니오 | `{ ok: true; affectedSessionCount: number; configuringSessionCount: number }` |
| `useDeleteAccount` | `DELETE /api/account` | `{ password: string }` | `{ ok: true }` | 아니오 | `void` |
| `usePrewarm` | `POST /api/sessions/[sessionId]/prewarm` | — | `204`(본문 없음) | — | `void` |
| **`useConnectApiKey`** ★신규 | `PUT /api/account/api-key` (#38) | `{ apiKey: string }` ← **키 원문이 존재하는 유일한 방향** | `{ apiKey }` | **예** | `ApiKeyStatus` (`keyStatus === 'connected'`). **연결과 교체가 같은 훅**입니다 — 부분 수정이 아니라 **전체 교체** |
| **`useDisconnectApiKey`** ★신규 | `DELETE /api/account/api-key` (#39) | — | `{ apiKey }` | **예** | `ApiKeyStatus` (`keyStatus === 'none'`, `keyLast4 === null`). ⚠️ **`{ ok: true }`가 아닙니다** — 다른 DELETE 훅과 모양이 다릅니다 |
| **`useVerifyApiKey`** ★신규 | `POST /api/account/api-key/verify` (#40) | — | `{ apiKey }` | **예** | `ApiKeyStatus`. 성공이면 `lastVerifiedAt` 갱신, 실패면 `keyStatus === 'invalid'` + `lastFailureCode` |
| **`useGrantTrialConsent`** ★신규 | `POST /api/trial-consent` (#41) | `{ consentVersion: string; sessionId?: string \| null }` | `201`(재동의는 `200`) `{ consent }` | **예** | `TrialConsent` = `{ id; consentVersion; grantedAt; sessionId: string \| null }` |

**⚠️ `useDisconnectApiKey`는 이 문서에서 `{ ok: true }`를 반환하지 않는 유일한 DELETE 훅입니다.**
`useDeleteSession`·`useDeleteAccount`와 같은 모양이라고 가정해 `void`로 선언하면, 해제 직후 화면이
`keyStatus`를 갱신하지 못해 **"연결됨"이 남아 있게** 됩니다. 언랩해서 `ApiKeyStatus`를 그대로 씁니다.

**키 뮤테이션 3종(#38·#39·#40)의 공통 규약 — 보안 (D28 6.5.7절)**

| 규칙 | 내용 |
|---|---|
| 원문 보관 금지 | 요청 body에 실은 뒤 **폼 상태를 즉시 리셋**합니다(`form.reset()`). 컴포넌트 상태·ref·전역 스토어 어디에도 남기지 않습니다 |
| 저장소 금지 | **`localStorage`·`sessionStorage`·IndexedDB·쿠키에 키를 넣지 않습니다.** 저장할 이유가 없습니다 — 서버가 보관합니다 |
| URL 금지 | **쿼리 파라미터·해시·`router.push` 인자에 키가 등장하지 않습니다.** `?next=`에 들어가는 것은 경로뿐입니다 |
| 재시도 금지 | 실패해도 **자동 재시도하지 않습니다**(`retry: 0`). 재시도는 원문을 메모리에 더 오래 붙잡아 두고, 무효한 키를 반복 제출해 `invalid` 판정을 굳힙니다 |
| 로깅 금지 | 뮤테이션 변수(`variables`)를 오류 리포터·`console`·`sonner` 토스트 본문에 싣지 않습니다. TanStack Query의 전역 `onError`가 `variables`를 직렬화하지 않는지 확인합니다 |
| 오류 문구 | 400 `validation_failed`의 `details.fields`에도 **입력값이 되비치지 않습니다**(계약 4.8.1절). 그대로 렌더해도 안전하지만, 렌더 전에 값 포함 여부를 가정하지 않습니다 |
| 성공 후 | `['apiKey']`·`['capacity']`를 invalidate. `?next=`가 있으면 그 경로로 `router.replace()` |

**`useReportEvent`는 실패해도 사용자에게 아무것도 보여주지 않습니다.** 감사 로그가 실패했다고 면접이 멈추면 안 됩니다.
다만 `score_card_viewed`가 유실되면 지표 5의 분모가 비므로, 실패 시 1회 재시도합니다.

**`useCancelSession`과 `useDeleteSession`을 같은 버튼에 연결하지 마세요 (D19 — 가장 위험한 혼동).**

| | `useCancelSession` (#33) | `useDeleteSession` (#23) |
|---|---|---|
| UI 문구 | **"이 면접 그만두기"** | **"이 면접 삭제"** |
| 대화 기록 | **남습니다** | 함께 사라집니다 |
| 확인 | 일반 `AlertDialog` 1겹 | **"되돌릴 수 없습니다"** 명시 |
| 부를 수 있는 상태 | `created` `configuring` `ready` `in_progress` `paused` `failed` `abandoned` **7개뿐** | 모든 상태 |
| 그 밖의 상태에서 | **409 `invalid_transition`** — `completed` 이후 세션은 취소 대상이 아니라 삭제 대상입니다 | — |

- 훅은 **`completed` `evaluating` `evaluated` `canceled`에서 취소 버튼 자체를 렌더하지 않습니다.** 409를 UI로
  받아 처리하는 것보다 버튼을 감추는 쪽이 정확합니다.
- 성공 후 `['session', id]` · `['sessions']` · `['dashboard']`를 invalidate 합니다. **낙관적 제거를 하지 않습니다** —
  취소된 세션은 목록에서 사라지는 것이 아니라 토글에 따라 **다시 나타날 수 있기** 때문입니다.

### 3.3 스트리밍 훅 — `useInterviewStream` (#9)

```ts
// src/hooks/use-interview-stream.ts
type InterviewStreamState = {
  phase: 'idle' | 'streaming' | 'done' | 'error';
  text: string;                          // 지금까지 받은 utterance_chunk.text의 누적
  chunks: { seq: number; text: string }[];
  done: {                                // utterance_done 페이로드 (스트림당 정확히 1회)
    turnId: string; questionId: string | null; parentQuestionId: string | null;
    depth: number; questionKind: QuestionKind | null;
    action: InterviewerAction; targetAxis: Axis | null; sessionStatus: SessionStatus;
  } | null;
  notice: { kind: 'distress_guard' | 'pressure_capped' | 'rate_limit_fallback';
            level: number | null; messageKo: string } | null;
  // ★ D28: byok 세션에서만 나오는 2종이 추가됐습니다 (계약 5.2절·10.2절)
  error: { code: 'llm_timeout' | 'llm_rate_limited' | 'llm_failed'
                | 'byok_key_invalid' | 'byok_quota_exhausted';
           retryable: boolean; messageKo: string } | null;
};

function useInterviewStream(sessionId: string): {
  state: InterviewStreamState;
  submit(answer: AnswerCommit): void;    // POST + SSE 소비 시작
  abort(): void;                          // barge-in / "답변 시작"
};
```

**계약(계약 5절)에서 어긋나면 안 되는 것 5가지**

1. `fetch()` + `ReadableStream` 수동 파싱을 씁니다. **`EventSource`를 쓰지 않습니다** — POST 본문을 보낼 수 없습니다.
2. **`res.json()`을 절대 호출하지 않습니다.**
3. `stream_error`가 오면 `utterance_done`은 **오지 않습니다.** `done`을 기다리는 코드가 매달리면 안 됩니다.
4. **스트림이 끊기면 재요청하지 않습니다.** `useTurnsResync`(#10)로 재동기화합니다(계약 5.5절).
   재동기화 결과에 면접관 발화가 **없을 때만** 같은 `answerSeq`로 #9를 재시도합니다.
5. `409 turn_seq_conflict`를 받으면 `details.currentSeq`로 재동기화하고 **LLM을 다시 부르지 않습니다.**
6. **`stream_error.code`가 `byok_key_invalid` / `byok_quota_exhausted`이면 `retryable`은 항상 `false`이고,
   서버가 세션을 이미 `paused`로 옮겼습니다**(`01_state_machine.md` 4.5절). UI는 재시도하지 말고
   `['session', id]`를 invalidate 해 **재개 패널(4.6.1절)로 넘깁니다.** 두 문구는 4.14절의 고정 문안이며,
   `messageKo`를 그대로 띄우더라도 **프로바이더 원문이 섞여 들어오지 않는지** QA 대조 항목입니다.
   **`byok_quota_exhausted`에 시각을 덧붙이지 마세요** — `resumableAfter`가 `null`입니다.

**`utterance_done.sessionStatus` — 면접 종료를 알아내는 유일한 신호 (F7 해소)**

`02_ai_contracts.md` 3.5절(원본)에 `sessionStatus`가 추가되어, 계약 세 문서(`02`·`05`·`06`)가 같은 페이로드를
말하게 됐습니다. 최종 페이로드는 `turnId` `questionId` `parentQuestionId` `depth` `questionKind`
`action` `targetAxis` **`sessionStatus`** 8개입니다.

- 타입은 `SessionStatus`지만 **실 가능값은 `in_progress` | `completed` 둘뿐**입니다. UI는 이 둘만 분기하고,
  나머지 값이 오면 `in_progress`로 취급합니다(모르는 값 때문에 화면이 멈추면 안 됩니다).
- **`sessionStatus === 'completed'`** → 입력창(`AnswerInputVoice`/`AnswerInputText`)을 닫고,
  마지막 발화의 TTS 재생이 끝난 뒤 `/sessions/{id}/report`로 이동합니다.
  **`useCompleteSession`을 부르지 않습니다** — 서버가 이미 옮겼습니다(#9의 종료 조건 경로).
- 리포트에 도착했을 때 세션 status는 정상 경로에서 **`evaluating`**입니다(D18). `completed`를 기다리지 마세요.
- `action`은 `InterviewerAction` 5개 값 유니온(`follow_up` `next_main` `neutral_transition` `comfort` `wrap_up`)으로
  좁혀졌습니다. `wrap_up`은 **마무리 발화이지 질문이 아니므로**(D5) 질문 트리에 넣지 않습니다.

### 3.4 엔드포인트가 없는 훅 (API 계약 밖 — 클라이언트 SDK 직접 사용)

| 훅 | 무엇을 쓰나 | 반환 | 근거 |
|---|---|---|---|
| `useSessionRealtime(sessionId)` | Supabase Realtime(`interview_sessions`, `id=eq.{sessionId}`) | `{ connected: boolean }` **페이로드를 반환하지 않습니다** | 계약 2.1절 **E1**. 페이로드는 **snake_case**이므로 렌더링 금지. "변경됨" 신호로만 쓰고 `['session', id]`·`['evaluation', id]`를 invalidate |
| `useDocumentUpload()` | `supabase.storage.from('documents').upload(...)` | `{ documentId, storagePath, mimeType, byteSize }` | 계약 2.1절 **E2**. 경로는 `documents/{userId}/{documentId}.{ext}`(`04_data_layer.md` 7.2절). 업로드 성공 **후** `useCreateDocument` 호출 |
| `useAuth()` / `useSignIn()` / `useSignUp()` / `useSignOut()` | `@supabase/ssr` 브라우저 클라이언트 | `{ user, isLoading }` 등 | `/api/auth/*` 라우트가 계약에 없습니다. 인증은 쿠키 세션이며 snake_case 데이터 경계가 아닙니다 |
| `useVoiceSession()` | `src/lib/voice/*`(`03_voice_pipeline.md` 소유) | 4상태 + VU 레벨 + interim 전사 | 7절. **오디오 API는 `audioGraph.ts` 한 파일에만**(S2) |

`useSessionRealtime`의 반환에 페이로드를 넣지 않는 것이 E1을 **타입으로 강제**하는 방법입니다.
받을 수 없으면 렌더링할 수도 없습니다.

---

## 4. 화면별 계획

각 화면에 공통으로 적용되는 상태 규약:

| 상태 | 표현 |
|---|---|
| 로딩 | shadcn `Skeleton`. **스피너 대신 실제 레이아웃 모양의 스켈레톤**을 씁니다(레이아웃 점프 방지) |
| 빈 상태 | `EmptyState` 공용 컴포넌트 — 아이콘 + 한 문장 설명 + **다음 행동 버튼 1개** |
| 오류 | `ErrorState` 공용 컴포넌트 — `ApiError.message`(서버가 준 한국어) + "다시 시도" 버튼 |
| 권한 없음 | API는 남의 리소스와 없는 리소스를 **똑같이 404**로 답합니다(계약 7.3절). UI도 구분하지 않고 **"찾을 수 없는 세션입니다"** + `/sessions`로 가는 버튼. **"권한이 없습니다"라고 쓰지 않습니다** — 그 문구가 곧 "그 id는 존재한다"는 누설입니다 |
| 미인증 | 미들웨어가 302로 처리하므로 화면 분기가 없습니다. `/api/**`의 401은 `ApiError`로 잡아 `/login?next=`로 보냅니다 |

---

### 4.1 `/` — 랜딩

| 항목 | 내용 |
|---|---|
| 진입 | 누구나 |
| 이탈 | `/login`(로그인·회원가입), 이미 인증되면 헤더의 "대시보드" → `/dashboard` |
| 데이터 | 없음. 훅 없음 |
| shadcn | `Button` `Card` `Badge` `Separator` `Accordion`(FAQ) |
| 레이아웃 | 히어로(한 문장 정의 + CTA) → 3단 가치 카드(꼬리질문 / 원문 인용 평가 / 음성 대화) → 흐름 4단계 → FAQ |
| 로딩·빈·오류 | 해당 없음(정적) |

- **음성이 저장되지 않는다**는 사실을 랜딩에서 한 번 말합니다. 가입 전에 알아야 할 정보입니다.
- 서버 컴포넌트로 두고 클라이언트 JS를 최소화합니다.

---

### 4.2 `/login` — 로그인·회원가입

| 항목 | 내용 |
|---|---|
| 진입 | 미인증(인증 상태로 오면 미들웨어가 `/dashboard`로 302) |
| 이탈 | 성공 시 `?next=` 또는 `/dashboard` |
| 훅 | `useSignIn` `useSignUp` (Supabase Auth 직접) |
| shadcn | `Tabs`(로그인/회원가입) `Form` `Input` `Label` `Button` `Alert` `Card` |

**필수 문구 (D8 전달 — `04_data_layer.md` 12절)**

> 회원가입 탭 이메일 필드 아래: **"확인 메일을 보내지 않습니다. 주소를 다시 한 번 확인해 주세요. 오타가 있으면 계정을 되찾을 수 없습니다."**

- **이메일 재입력 필드는 두지 않습니다**(붙여넣기로 무력화되고 이탈만 늘어납니다 — 6.1절).
- 상태: 제출 중 `Button` `disabled` + 스피너, 실패 시 `Alert variant="destructive"`에 Supabase 오류를 한국어로 매핑.
- 비밀번호 재설정 링크는 두되, **메일 발송 경로가 없다는 한계를 그 화면에서 명시**합니다.
  → **`[결정 완료 D23]` 비밀번호 재설정 링크를 정상 노출합니다.** "비밀번호를 잊으셨나요?"
  D2(알림 메일 없음)·D8(가입 확인 끔)은 발송량이 사용자 활동에 비례하는 경로를 막은 것이고,
  재설정은 사용자가 드물게 명시적으로 요청할 때만 발송되므로 무료 SMTP 한도와 충돌하지 않습니다.
  재설정마저 막으면 D8이 남긴 "계정 복구 경로 없음" 위험이 올바른 이메일로 가입한 사용자에게까지
  번집니다. Supabase Auth의 재설정 메일을 사용합니다.

---

### 4.3 `/dashboard` — 홈

| 항목 | 내용 |
|---|---|
| 진입 | 인증 |
| 이탈 | `/sessions/new`(새 면접), `route-for-status()`로 각 세션 상세, **`/settings/api-key?next=/dashboard`** |
| 훅 | `useDashboard` **`useCapacity`** |
| shadcn | `Card` `Button` `Badge` `Skeleton` `Separator` `ScrollArea` `Alert` `Tooltip` |

**레이아웃**

```
[ 새 면접 시작 ]  ← 최상단, 가장 큰 CTA
── 이어서 할 일 ─────────────────────────────
  · 작성 중인 세션    (created | configuring)  → /sessions/new?sessionId=
  · 시작 대기 세션    (ready)                  → /sessions/{id}/ready
  · 진행 중·일시정지  (in_progress | paused)   → /sessions/{id}/interview
  · 평가 중          (completed | evaluating)  → /sessions/{id}/report
── 새 리포트 (unreadReportCount) ─────────────  Badge로 개수
── 최근 세션 (recentSessions) ────────────────  SessionListItem 재사용
```

- `activeSessions`를 위 4묶음으로 나누는 것은 **`status` 값으로만** 합니다. 서버가 미리 나눠 주지 않으므로
  `src/lib/session/group-active.ts`에 분류 함수를 둡니다.
- `unreadReportCount > 0`이면 앱 헤더의 "이력" 링크에도 `Badge`를 답니다(D2 — **앱 내 배지만, 이메일 없음**).
- 빈 상태: "아직 면접 기록이 없습니다. 이력서와 JD를 넣고 첫 모의면접을 시작해 보세요." + "새 면접 시작".
- 오류: 카드 전체를 `ErrorState`로 대체하되 "새 면접 시작" 버튼은 **남깁니다**(대시보드가 죽어도 진입은 살아 있어야 합니다).

**`canStartSession === false`일 때 — 벽에는 반드시 출구가 함께 있습니다 (D28)**

"새 면접 시작"을 `disabled`로 두고, 버튼 **아래**에 `Alert`(`variant="default"`)로 4.14.1절 문안을 띄웁니다.
`Badge`는 버튼 옆에 하나만: **"오늘 예약 마감"**.

```
[ 새 면접 시작 ](disabled)   [오늘 예약 마감]
┌ Alert ────────────────────────────────────────────────┐
│ 지금은 새 면접을 시작할 수 없어요                       │
│ (4.14.1절 본문)                                        │
│ [ 키 연결하기 ](기본)   [ 지난 리포트 보기 ](ghost)     │
└────────────────────────────────────────────────────────┘
```

- **1순위 버튼은 "키 연결하기"** 입니다(`02_ai_architecture.md` 13.7.3절). `/settings/api-key?next=/dashboard`.
- `keyStatus === 'invalid'`이면 이 자리에 **4.14.2절(키 무효) 문안**을 대신 띄웁니다 — 원인이 여력이 아닙니다.
- **"이어서 할 일"과 "최근 세션"은 그대로 보입니다.** 막힌 것은 *새로 여는 것* 하나뿐이고,
  그 사실을 안내 마지막 줄이 말합니다. 대시보드 전체를 오류 화면으로 덮지 마세요.
- 리포트 CTA를 닫은 사용자에게 남는 "조용한 안내"가 이 자리입니다(`01_product_spec.md` 6.5.2절).
  `keyStatus === 'connected'`이면 이 영역을 **아예 렌더하지 않습니다.**

---

### 4.4 `/sessions/new` — 세션 설정

| 항목 | 내용 |
|---|---|
| 진입 | 인증. 쿼리 `?sessionId=`가 있으면 그 세션을 이어서 설정, 없으면 새로 생성 |
| 이탈 | 준비 완료 → `/sessions/{id}/ready` · **그만두기(취소) → `/sessions`** · 준비 포기 → `/sessions/{id}/report`(실패 화면) · **키 연결 → `/settings/api-key?next=/sessions/new?sessionId={id}`** |
| 훅 | `useCreateSession` `useSession` `useUpdateSessionConfig` `usePrepareSession` `useDocuments` **`useCancelSession`**(그만두기) **`useAbandonPreparation`**(추출 실패 시 준비 포기) **`useCapacity`** **`useGrantTrialConsent`** |
| shadcn | `Form` `RadioGroup` `Card` `Select` `Button` `Alert` `Dialog` `AlertDialog` `Checkbox` `Skeleton` `Badge` `Tabs`(파일/직접입력) `Textarea` `Progress` |

**세션 행을 언제 만드는가 — UI 소유 결정**

```
마운트 시 ?sessionId= 없음 → useCreateSession() → router.replace('/sessions/new?sessionId={id}')
```

`created` 상태로 즉시 만듭니다. 이유는 `PATCH .../config`(#5)가 세션 id를 요구하고, 부분 저장이 정상 경로이기
때문입니다(`SessionConfigPatch`는 전 필드가 선택). 그 대가로 **아무것도 고르지 않고 떠난 빈 세션**이 남으므로,
대시보드의 "작성 중인 세션"에 각 항목의 정리 수단을 두고, 설정 화면의 **"이 면접 그만두기"는 `useCancelSession`(#33)** 을 부릅니다.

> **⚠️ 이 자리에 `useDeleteSession`을 쓰지 마세요 (D19).** 이 문서의 초안은 "폐기"를 실제 삭제에 연결하고
> "`created → canceled`는 실제 삭제입니다"라고 적었습니다 — **틀렸습니다.** `canceled`는 **행이 남는 종료 상태**이고,
> `created → canceled`는 #33이 담당하는 정상 전이입니다. 빈 세션이라도 삭제 경로로 보내면 같은 버튼 문구가
> 진행 중 세션에서는 대화 기록을 파괴하게 됩니다. **파괴적 동작은 명시적 확인을 거친 삭제 하나로만 모읍니다**(10절).

**단계 구성(한 화면 안의 4개 섹션, 페이지 분할 없음)**

| 섹션 | 컴포넌트 | 저장 시점 |
|---|---|---|
| 1. 직군 | `RadioGroup` 5개(`pm` `pd` `security` `ai` `engineer`) | 선택 즉시 `PATCH config`(디바운스 500ms) |
| 2. 페르소나 | `PersonaCard` 2장(`deep_pressure` `technical_probe`). 각 카드에 **주질문 수·최대 깊이** 표시 | 선택 즉시 |
| 3. 모달리티 | `RadioGroup` 2개(`voice` `text`) + **음성 고지 4항목**(`03_voice_pipeline.md` 6.4절, 이 문서 9절) | 선택 즉시 |
| 4. 이력서 / JD | `DocumentPicker` ×2 (보관함에서 고르기 / 새로 올리기 / 직접 입력) | 선택·업로드 후 |

- 페르소나 카드의 숫자(4·6, 4·2)는 `01_state_machine.md` 3절 값을 `src/lib/session/persona-meta.ts`
  **프론트 상수**로 둡니다. 세션 행의 `mainQuestionBudget`은 `ready` 이후에나 확정되므로 설정 화면에서는
  쓸 수 없습니다. **이 상수가 상태 머신과 어긋나면 사용자에게 거짓말이 되므로 QA 대조 항목입니다.**
- 텍스트 모드는 **처음부터 선택 가능**해야 합니다(`03_voice_pipeline.md` 10.4절 "시작 경로 동등").
  음성을 실패해야만 도달하는 경로로 만들지 않습니다.

**"면접 준비" 버튼 — 가드와 대기 UI**

```
활성 조건: jobRole && persona && modality && resumeDocumentId && jdDocumentId
           && 두 문서의 extractionStatus === 'succeeded'
```

- 조건 미충족 시 버튼을 `disabled`로 두고 **무엇이 빠졌는지 목록으로** 보여줍니다. 비활성 버튼만 두면
  사용자는 왜 못 누르는지 모릅니다.
- 누르면 `usePrepareSession` → `202`. 이후 **8~20초** 동안 `preparation.state === 'running'` 대기 화면:
  `Progress`(불확정) + "이력서와 JD를 읽고 첫 질문을 준비하고 있습니다".
- 폴링: `useSession`을 3초 간격 `refetchInterval`. `status === 'ready'`가 되면 `/sessions/{id}/ready`로 이동.
  Realtime(`useSessionRealtime`)도 함께 걸어 두고, 둘 중 먼저 오는 쪽이 이깁니다.
- `preparation.state === 'failed'`: **상태 전이가 아닙니다.** 세션은 `configuring`에 남습니다(계약 12.2절).
  `Alert variant="destructive"` + "다시 준비" 버튼. 화면을 떠나게 하지 않습니다.
- 문서 추출 실패(`extractionStatus === 'failed'`): 해당 `DocumentPicker`에 인라인 오류 +
  **"텍스트 직접 입력" 탭으로 유도**. 스캔 PDF는 MVP에서 실패 처리이므로 이 유도가 1순위 출구입니다.
- **추출 실패 배너 안의 탈출구 — "이 세션 준비 포기"(`useAbandonPreparation`, #35). QA F8 대응.**
  이것이 없으면 재시도도 직접 입력도 원치 않는 사용자가 `configuring`에 갇힙니다.
  - 배너 구성: ① [다시 추출] ② [텍스트 직접 입력] ③ **[이 세션 준비 포기]**(`variant="ghost"`, 가장 약한 위계).
    포기가 첫 번째 선택지처럼 보이면 안 됩니다.
  - 확인 문구: **"이 면접을 준비하지 못한 것으로 처리합니다. 대화 기록은 아직 없으므로 잃는 것이 없습니다.
    이력서와 JD 문서는 보관함에 그대로 남습니다."**
  - 성공 시 `status='failed'` + `failureReason='document_extraction_failed'` → `route-for-status()`가
    `/sessions/{id}/report`(실패 화면)로 보냅니다. 이 실패 사유에는 **[평가 재시도]를 노출하지 않습니다**
    (계약 4.4절 — #16이 409를 돌려주는 사유입니다). 4.7절 참조.
  - **가드**: 참조 문서 중 하나가 실제로 `extraction_status='failed'`일 때만 서버가 받습니다. 그렇지 않으면
    409 `guard_failed`이며, 그때 사용자가 원하는 것은 포기가 아니라 **취소(#33)** 입니다.

**체험 동의 게이트 — "면접 준비"를 누른 직후, `usePrepareSession` **직전** (D29)**

```
[면접 준비] 클릭
   └─ capacity.nextFundingSource === 'trial_shared' && capacity.requiresTrialConsent
        ├─ 예 → 동의 다이얼로그(4.13절)
        │        ├─ [동의하고 시작하기] → useGrantTrialConsent({ consentVersion, sessionId })
        │        │                        → 성공 후 usePrepareSession()
        │        └─ [내 키를 연결할게요]  → /settings/api-key?next=/sessions/new?sessionId={id}
        └─ 아니오 → 바로 usePrepareSession()
```

- **`byok` 세션은 이 다이얼로그를 보지 않습니다**(`nextFundingSource === 'byok'`). 조건 분기를
  `keyStatus`가 아니라 **`nextFundingSource` + `requiresTrialConsent`** 로 씁니다 — 계약이 그 둘로 판정합니다.
- **동의를 화면 진입 시점에 미리 받지 않습니다.** 준비를 누르기 전까지는 아직 아무 AI 호출도 일어나지 않습니다.
- 동의 거부는 **막다른 길이 아닙니다.** 세션은 `configuring`에 남고 설정이 보존되므로,
  키를 연결하고 돌아오면 같은 화면에서 이어서 준비합니다(계약 4.9.2절).
- **낙관적 진행 금지.** `useGrantTrialConsent`가 성공한 뒤에 `usePrepareSession`을 부릅니다.
  둘을 동시에 쏘면 **409 `trial_consent_required`** 로 준비가 실패합니다.

**`usePrepareSession`이 돌려주는 오류 5종(409 4종 + 503 1종) — `error.code`로 직접 분기합니다**

> **소거법 금지.** "다른 코드가 아니면 D30"으로 판정하지 않습니다. 계약 13절이 네 가지 409에 각각
> 고유한 `code`를 두었으므로(`05_api_contract.md` **13절 오류 표**) 분기는 **언제나 `error.code`의 `switch`**이며,
> 알지 못하는 `code`는 D30이 아니라 **일반 오류 안내**로 떨어집니다.

| 응답 | 원인 | 화면 |
|---|---|---|
| **409 `trial_consent_required`** | 현재 문구 버전 동의가 없음(옛 버전 동의만 있는 경우 포함) | 동의 다이얼로그를 **다시 띄웁니다**. `details.requiredConsentVersion`을 `useGrantTrialConsent`에 씁니다. `['capacity']` invalidate |
| **409 `consent_version_stale`**(#41에서) | 클라이언트 번들이 옛 문구를 띄우고 있음 | **새로고침 후 다시 띄웁니다**(계약 4.9.1절). 사용자에게는 "안내 문구가 업데이트되었어요. 다시 확인해 주세요" |
| **409 `trial_reservation_exists`** | 체험 사용자가 이미 `held` 예약을 가진 다른 세션이 있음(D30) | 아래 D30 안내. **목적지는 `details.existingSessionId`** 입니다. 503 화면·"내일 오세요" 문구와 **섞지 않습니다** |
| **409 `byok_key_invalid`** | 연결한 키가 거절됨(#6의 키 검증 단계) | 4.14.2절 안내 + `/settings/api-key?next=`로 교체 유도 |
| **503 `capacity_unavailable`** | 공용 여력 소진 | 4.14.1절 `AlertDialog`. **세션은 `configuring`에 남습니다** — "설정은 그대로 저장돼 있어요" 줄이 사실입니다 |

**D30 — 체험 사용자의 두 번째 준비는 409 `trial_reservation_exists`입니다**

체험 사용자는 **동시에 예약 1건**만 가질 수 있습니다(D30). 이미 준비를 마친(또는 준비 중인) 세션이 있는 채로
다른 세션에서 `prepare`를 부르면 **409 `trial_reservation_exists`** 입니다. 탭을 여러 개 열어 두면
악의 없이도 발생합니다.

> **이미 준비 중인 면접이 있습니다**
> 한 번에 하나의 면접만 준비할 수 있어요. 먼저 시작한 면접을 이어서 하거나, 그 면접을 취소한 뒤
> 새로 시작해 주세요.
>
> `[이어서 하기]`  `[이전 면접 취소하기]`  `[여기 남기]`

- **목적지는 `details.existingSessionId` 하나뿐입니다.** 계약이 이 값을 **항상 채워 보내며 `null`이 아니라고**
  못박았으므로(`05_api_contract.md` **13절 `trial_reservation_exists` 응답 예시 · 4.7.6절**), `[이어서 하기]`는
  `route-for-status(useSession(details.existingSessionId))`로 보냅니다.
- **`useDashboard`의 `activeSessions`에서 세션을 찾는 폴백은 폐기했습니다.** 추측으로 고른 세션은 사용자를
  엉뚱한 면접으로 보냅니다. `existingSessionId`가 없으면 링크를 만들지 말고 일반 오류 안내로 떨어뜨립니다
  — 틀린 목적지보다 낫습니다(QA 4차 검증 항목: `activeSessions` 폴백 잔재 grep).
- **`[이전 면접 취소하기]`는 `useCancelSession`(#33)** 을 `details.existingSessionId`에 대해 부릅니다.
  취소는 예약 반납을 부작용으로 가지므로(계약 4.7.3절) 성공 후 `usePrepareSession`을 다시 부르면 통과합니다.
  10.1절의 취소 확인 `AlertDialog`를 그대로 재사용합니다 — 확인 없이 남의 세션을 지우지 않습니다.
- 이 안내에는 **키 연결 CTA를 넣지 않습니다.** 사용자가 할 일은 키 연결이 아니라 **기존 면접 정리**입니다.
  같은 이유로 **여력 부족(503) 화면·"내일 오세요" 문구와 섞지 않습니다** — 여력이 남아 있어도 나오는 오류입니다.
- 안내 문구에 "예약"이라는 내부 용어를 쓰지 않습니다 — 사용자에게는 "준비 중인 면접"입니다.
- **`byok` 세션에서는 이 코드가 나오지 않습니다.** 예약 자체를 하지 않으므로 분기에 도달할 수 없습니다.

**상태별 렌더링**

| 상태 | 표현 |
|---|---|
| 로딩 | 4개 섹션 스켈레톤 |
| 빈(문서 보관함 비었음) | `DocumentPicker` 안에 "아직 올린 문서가 없습니다" + 업로드/직접 입력 탭 |
| 오류 | 섹션별 인라인 `Alert`. 화면 전체를 오류로 덮지 않습니다(다른 섹션은 계속 편집 가능) |
| 잘못된 상태 진입 | `status`가 `created`/`configuring`이 아니면 `route-for-status()`로 `replace` |

---

### 4.5 `/sessions/[sessionId]/ready` — 준비·마이크 점검

| 항목 | 내용 |
|---|---|
| 진입 | `status === 'ready'` |
| 이탈 | "면접 시작" → `/sessions/{id}/interview` · "설정 변경" → `/sessions/new?sessionId=` · **그만두기(취소) → `/sessions`** |
| 훅 | `useSession` `useStartSession` `useBackToConfig` **`useCancelSession`** `usePrewarm` `useVoiceSession`(사전 점검) `useReportEvent`(`voice_precheck`) |
| shadcn | `Card` `Button` `Alert` `Badge` `Progress` `AlertDialog` `Separator` `Switch`(TTS 사용 여부) |

**"오프닝 질문이 생성되었는가"는 별도 조회가 필요 없습니다.** `status === 'ready'`의 정의 자체가
"컨텍스트 준비와 오프닝 질문 생성 완료"입니다(`01_state_machine.md` 1절). 질문 본문은 `useStartSession`의
응답 `openingQuestion`으로 옵니다.

**마이크 사전 점검 6단계**(`03_voice_pipeline.md` 3.6절, U9) — `MicPrecheck` 컴포넌트

| # | 점검 | 실패 시 |
|---|---|---|
| 1 | `isSecureContext` | F1 — "보안 연결에서만 음성을 쓸 수 있습니다" → 텍스트 모드로 시작 |
| 2 | `SpeechRecognition` 존재 | F2 — "이 브라우저는 음성 인식을 지원하지 않습니다" → 텍스트 모드로 시작 |
| 3 | `getUserMedia` 권한 (`requesting_permission`) | F3/F4 — 9절 |
| 4 | **마이크 레벨 3초 측정** — `VuMeter` + "말씀해 보세요" | 무음이면 "소리가 들어오지 않습니다" + 장치 재선택 안내 |
| 5 | 한국어 TTS 음성 존재 (`getVoices()`에 `ko`) | F10 — "면접관 음성 없이 텍스트로 진행합니다"(경고이지 차단이 아님) |
| 6 | **한국어 샘플 재생** — 사용자 제스처로 자동재생 차단 해제 | F12 — "면접관 음성을 켜려면 화면을 한 번 눌러 주세요" |

- 각 단계는 `Badge`(대기 / 확인됨 / 건너뜀 / 실패) + **텍스트 레이블**로 표시합니다. 색만으로 표현하지 않습니다(U6).
- 점검 결과는 `useReportEvent({ eventName: 'voice_precheck', detail: { ... } })`로 남깁니다.
- **텍스트 모달리티로 설정된 세션에서는 3~6단계를 건너뜁니다.** 1·2단계 결과만 안내 문구로 남기고
  "면접 시작"을 즉시 활성화합니다. 텍스트 사용자에게 마이크 점검을 강요하면 1급 시민이 아닙니다.
- `usePrewarm`은 "면접 시작" 버튼에 마우스가 올라가거나 포커스가 닿을 때 **1회만** 호출합니다(C4/P6).
  LLM을 부르지 않는 경로이므로 쿼터를 태우지 않습니다.

**음성 고지 4항목 (필수, `03_voice_pipeline.md` 6.4절 + D16)** — 9절에 문안 원본.

**"면접 시작"** → `useStartSession({ micReady })`. `micReady`는 3~4단계 통과 여부입니다.
실패해도 시작을 막지 않고 `micReady: false`로 보내면 텍스트 모드로 진행됩니다.

---

### 4.6 `/sessions/[sessionId]/interview` — 면접 진행 (**이 서비스의 심장**)

6절 전체가 이 화면의 상세입니다. 여기서는 골격만 적습니다.

| 항목 | 내용 |
|---|---|
| 진입 | `status === 'in_progress'` 또는 `'paused'` |
| 이탈 | 종료 → `/sessions/{id}/report` · **그만두기(취소) → `/sessions?includeCanceled=true`** |
| 훅 | `useSession` `useTurnsResync` `useInterviewStream` `useCorrectTurn` `useSwitchModality` `usePauseSession` `useResumeSession` `useCompleteSession` **`useCancelSession`** `useSessionRealtime` `useVoiceSession` `useReportEvent` |
| shadcn | `Card` `Button` `Textarea` `Badge` `Alert` `AlertDialog` `Dialog` `Progress` `ScrollArea` `Separator` `Skeleton` `Tooltip` `Toggle` |

```
┌ InterviewHeader ─────────────────────────────────────────────┐
│ 페르소나 · 직군 · 진행도(answeredMainQuestionCount/budget)     │
│                          [일시정지] [여기서 마치기]  ← 상시 노출 │
├ ConversationLog (ScrollArea, aria-live="polite") ─────────────┤
│  면접관 발화 / 내 답변 (모달리티와 무관하게 동일 렌더)          │
│  ...                                                          │
│  [스트리밍 중인 면접관 발화 + 커서]                            │
├ VoiceStatePanel ─────────────────────────────────────────────┤
│  listening / transcribing / thinking / speaking 중 하나        │
├ InputArea (모달리티에 따라 교체되는 유일한 영역) ──────────────┤
│  voice: VU미터 + [답변 완료] + [텍스트로 전환]                 │
│  text : Textarea + [보내기] + [음성으로 전환]                  │
└──────────────────────────────────────────────────────────────┘
```

**상태별 렌더링**

| 상태 | 표현 |
|---|---|
| 초기 로딩 | 헤더 + 로그 스켈레톤. `useTurnsResync`로 전체 로그 복구 |
| 빈 로그 | 시작 직후 오프닝 질문만 있는 상태. 빈 상태 문구를 따로 두지 않습니다 |
| `paused` | 로그 위에 **재개 패널**(`ResumePanel`) 오버레이. 4.6.1 |
| 스트리밍 오류 | `stream_error` 배너 + `retryable`에 따른 안내. 로그는 지우지 않습니다 |
| 네트워크 오류(F17) | "연결이 불안정합니다. 다시 시도합니다" + **전사는 입력창에 보존**. 3회 실패 시 `paused(connection_lost)` |
| 권한 없음/없는 세션 | 404 → "찾을 수 없는 세션입니다" |

#### 4.6.1 재개 패널 (`paused`)

`pause_reason`별로 문구와 버튼이 다릅니다. **2026-09-10 D28로 3종 → 5종이 되었습니다**(계약 12절).
5종을 **전부** 분기해야 하며, 모르는 값이 오면 `user_requested`의 중립 문구로 폴백합니다
(모르는 값 때문에 재개 패널이 비면 사용자가 세션에 갇힙니다).

| `pauseReason` | 원인 주체 | 문구 | 버튼 |
|---|---|---|---|
| `user_requested` | 사용자 | "면접을 일시정지했습니다. 마지막 질문부터 이어서 진행합니다." | [이어서 하기] [여기서 마치기] **[이 면접 그만두기]**(취소 — 기록은 남습니다) |
| `rate_limited` | 우리 | "지금은 이어갈 수 없습니다. **{resumableAfter}** 이후 '이어서 하기'를 누르면 마지막 질문부터 계속됩니다." | [이어서 하기](시각 전에는 `disabled` + 남은 시간) [여기서 마치기] |
| `connection_lost` | — | "연결이 끊어져 면접이 멈췄습니다. 마지막 질문부터 이어서 진행합니다." | [이어서 하기] [여기서 마치기] |
| **`byok_key_invalid`** ★신규 | **사용자** | 4.14.2절 고정 문안 — "연결하신 키로 접속할 수 없었어요. 키가 삭제되었거나 권한이 바뀌었을 수 있습니다." | **[키 교체하기]**(1순위, `/settings/api-key?next=/sessions/{id}/interview`) [이어서 하기] [여기서 마치기] |
| **`byok_quota_exhausted`** ★신규 | **사용자** | 4.14.3절 고정 문안 — "연결하신 키의 사용량이 오늘 한도에 도달했어요. Google AI Studio에서 확인하실 수 있습니다." | [이어서 하기] [여기서 마치기] (+ Google AI Studio 링크는 본문 안의 텍스트 링크) |

**신규 2종에서 절대 하면 안 되는 것 (D28 · `01_state_machine.md` 4.5절)**

- **재개 가능 시각을 표시하지 마세요.** 두 사유 모두 `resumableAfter`가 **`null`** 입니다.
  `rate_limited`용 카운트다운 컴포넌트를 그대로 재사용하면 `null`에 "잠시 후"·"Invalid Date"가 렌더됩니다.
  **시각 줄과 카운트다운을 조건부로 완전히 제거**하고, [이어서 하기]도 `disabled`로 두지 않습니다 —
  키를 고친 사용자는 **지금 당장** 이어서 할 수 있어야 합니다.
- **"내일 다시 오세요"를 쓰지 마세요.** 우리는 사용자 계정의 리셋 시각을 모릅니다.
  대신 **확인할 곳**(Google AI Studio)을 알려 주는 것이 정확합니다.
- **"공용으로 계속하기" 같은 선택지를 만들지 마세요.** 체험이 남아 있어도 마찬가지입니다 —
  D29 동의를 받지 않은 이력서·답변이 공용 경로로 나가게 됩니다(계약 4.8.2절, 보안 사고 취급).
- **세션은 잃지 않습니다.** 둘 다 `paused`이고 대화 로그는 그대로이며 7일 재개 창(D7)이 동일합니다.
  그 사실을 문구 아래 한 줄로 함께 말합니다.
- `byok_key_invalid`에서 키를 교체하고 돌아오면 **`['session', id]`를 invalidate** 한 뒤 재개 패널을
  다시 그립니다. 교체 성공만으로 자동 재개하지 않습니다 — 재개는 사용자의 명시적 행동입니다.

- **재개 시한 안내**: `pausedAt + 7일`(D7)을 "이 세션은 {날짜}까지 이어서 할 수 있습니다"로 표시합니다.
- "여기서 마치기"는 `answeredMainQuestionCount >= 1`일 때만 활성(전이 가드). 0이면 비활성 + 이유 툴팁.
- `useResumeSession` 응답의 `currentQuestion`을 다시 발화하고(음성 모드면 TTS 재생),
  `lastInterviewerTurn`이 로그에 없으면 덧붙입니다.

---

### 4.7 `/sessions/[sessionId]/report` — 리포트

7·8절이 상세입니다. 골격:

| 항목 | 내용 |
|---|---|
| 진입 | `status`가 `completed` `evaluating` `evaluated` `failed` 중 하나 |
| 이탈 | "같은 이력서로 다시 하기" → `/sessions/new?sessionId=` (복제) · "대화 전문" → `/sessions/{id}/transcript` · `/sessions` · **키 연결 → `/settings/api-key?next=/sessions/{id}/report`** |
| 훅 | `useSession` `useEvaluation` **`useRetryEvaluation`**(`failed`일 때만) `useRetryCoach` `useTranscript`(꼬리질문 요약용) `useReportFeedback` `useCreateDispute` `useReportEvent` `useCreateSession`(복제) `useSessionRealtime` **`useCapacity`**(키 CTA 노출 판정) |
| shadcn | `Card` `Badge` `Progress` `Accordion` `Dialog` `RadioGroup` `Textarea` `Button` `Alert` `Separator` `Skeleton` `Tooltip` `ScrollArea` |

**`status`에 따른 4개 화면 — 같은 라우트, 다른 본문**

| `status` | 화면 |
|---|---|
| `completed` | **평가 준비 중**(8.1절). 서버가 평가를 등록하는 짧은 구간이며, 화면은 `evaluating`과 **같습니다** |
| `evaluating` | 평가 진행(8.2절) |
| `evaluated` | 리포트 본문(7절) |
| `failed` | 실패 화면 — `failureReason`을 한국어로 매핑(계약 12.1절) + **평가 계열일 때만** [평가 재시도] |

> **`completed`와 `evaluating`을 다른 화면으로 그리지 마세요 (D18).** 평가는 서버가 `completed` 전이의
> 부작용으로 등록하므로(계약 6.2절), `completed`는 "아직 시작되지 않음"이 아니라 **"방금 등록되었거나
> 등록 재시도 중"** 입니다. 두 상태의 사용자 경험은 동일한 대기 화면 하나입니다.

`failureReason` → 한국어 매핑은 `src/lib/session/failure-reason-ko.ts` 한 곳에.
**값 자체를 번역해 서버로 되돌려 보내지 않습니다.**

**[평가 재시도] 버튼을 노출하는 조건 — `failureReason` 2개뿐입니다.**

| `failureReason` | 재시도 버튼 | 이유 |
|---|---|---|
| `evaluation_failed` | **노출**(`useRetryEvaluation`) | `failed → evaluating`. #16의 유일한 정상 입구 |
| `evaluation_enqueue_failed` | **노출**(`useRetryEvaluation`) | 위와 같음 |
| `document_extraction_failed` | **감춤** | 평가할 답변이 없습니다. #16이 409를 돌려줍니다(계약 4.4절). 대신 [새 면접 시작] |
| `provider_permanent_error` / `context_corrupted` | **감춤** | 답변이 남아 있으면 [여기서 마치기]가 아니라 새 세션이 출구입니다 |

**`failed` 세션에서도 [이 면접 그만두기](`useCancelSession`)를 노출합니다** — `failed → canceled`는 열린 전이이며,
사용자가 실패한 세션을 이력에서 치우는 유일한 비파괴 수단입니다.

---

### 4.8 `/sessions/[sessionId]/transcript` — 대화 전문

| 항목 | 내용 |
|---|---|
| 진입 | `completed` 이후 상태 |
| 이탈 | 리포트로 복귀 |
| 훅 | `useTranscript` `useSession` |
| shadcn | `Card` `Badge` `Separator` `ScrollArea` `Skeleton` `Breadcrumb` |

- `questions`의 `parentQuestionId` / `depth`로 **질문 트리**를 그립니다. 꼬리질문은 들여쓰기 +
  "꼬리질문 {depth}단계" `Badge`. 색 들여쓰기만으로 깊이를 표현하지 않고 **텍스트 레이블을 병기**합니다.
- 정정된 발화(`isCorrected`)에는 "사용자가 정정한 답변" `Badge`. `transcriptRaw`는 `Accordion`으로 접어 둡니다
  (기본 접힘 — 정본이 `transcriptText`라는 사실을 화면 위계로 표현).
- **인용 딥링크 대상**: 리포트에서 `/sessions/{id}/transcript#turn-{turnId}`로 들어옵니다.
  진입 시 해당 발화로 스크롤 + `QuoteHighlight`로 `quoteText`를 `<mark>` 강조 + 2초 후 강조 페이드.
  - 하이라이트는 **`quoteText` 문자열 매칭**으로 합니다. 오프셋(`quoteStart`/`quoteEnd`)은 같은 문자열이
    여러 번 나올 때 **어느 것인지 고르는 용도로만** 씁니다(계약 9.2절 R3 — JS `slice`에서만 사용).
- 빈 상태: 턴이 0건이면 "이 세션에는 남은 대화가 없습니다".

---

### 4.9 `/sessions` — 세션 이력

| 항목 | 내용 |
|---|---|
| 진입 | 인증 |
| 이탈 | `route-for-status()`로 각 세션 |
| 훅 | `useSessions`(무한 스크롤, `nextCursor`, `includeCanceled`) **`useCancelSession`** `useDeleteSession` |
| shadcn | `Card` `Badge` `Button` `AlertDialog` `Skeleton` `Separator` `DropdownMenu`(행 메뉴) `Switch`(취소된 세션 보기) `Sonner`(토스트) |

- **`Table`을 쓰지 않고 `Card` 리스트**로 만듭니다. 모바일에서 표는 가로 스크롤을 만들고, 각 행에 상태·점수·
  날짜·작업 4가지가 들어가 카드가 더 자연스럽습니다.
- 행 구성: 직군·페르소나 `Badge` / 상태 `Badge` / `overallScore`(`null`이면 "—") + `scoredAxisCount`
  "5축 중 {n}축 채점" / 생성일 / `isReportUnread`면 **"새 리포트"** `Badge` / 행 메뉴.
- **행 메뉴는 3개 항목이고, "그만두기"와 "삭제"는 분리된 별개 항목입니다**(D19):

| 항목 | 훅 | 노출 조건 |
|---|---|---|
| 열기 | — (`route-for-status()`) | 항상 |
| **이 면접 그만두기** | `useCancelSession` | `status`가 `created` `configuring` `ready` `in_progress` `paused` `failed` `abandoned` **7개일 때만** |
| **이 면접 삭제** | `useDeleteSession` | 항상. `variant` 파괴적 강조 + `Separator`로 위 항목과 시각적으로 분리 |
- **`overallScore`를 `scoredAxisCount` 없이 단독으로 보여주지 않습니다.** 2축만 채점된 4.5와 5축 전부
  채점된 4.5는 같은 숫자가 아닙니다(계약 9.1절).
- 상태 배지 문구: `abandoned` → **"중단됨"**, `canceled` → **"그만둔 면접"**. 둘은 다른 상태입니다 —
  `abandoned`는 7일이 지나 시스템이 정리한 것이고, `canceled`는 사용자가 스스로 그만둔 것입니다.

**"취소된 세션 보기" 토글 (D19 — 기본 꺼짐)**

```
┌ 세션 이력 ───────────────────── [ ] 취소된 세션 보기 ┐
```

| 항목 | 내용 |
|---|---|
| 컴포넌트 | shadcn `Switch` + `Label`("취소된 세션 보기"). 목록 헤더 우측 |
| 기본값 | **꺼짐.** 그만둔 면접은 "지금 할 일"이 아닙니다 |
| 켜면 | `useSessions({ includeCanceled: true })` → 쿼리스트링 **`includeCanceled=true`**(문자열 `'true'`) |
| 끄면 | 파라미터를 **아예 붙이지 않습니다.** `includeCanceled=false`를 보내지 않습니다 — 서버는 문자열 `'true'`만 참으로 보므로 동작은 같지만, 보내지 않는 쪽이 기본 동작임을 URL에서 읽을 수 있습니다 |
| 커서 | **토글을 바꾸면 `nextCursor`를 버리고 처음부터 다시 조회합니다**(계약 4.3절). 필터가 바뀐 뒤의 커서는 무효입니다 |
| 쿼리 키 | `['sessions', { status, includeCanceled, cursor }]` — `includeCanceled`가 키에 **들어가야** 두 목록이 서로의 캐시를 덮어쓰지 않습니다 |
| URL 동기화 | `?includeCanceled=true`를 URL에 반영합니다. `route-for-status()`가 취소된 세션을 이 URL로 보내므로(1절), 딥링크로 들어온 사용자에게 토글이 **켜진 채로** 보여야 합니다 |

- **대시보드에는 이 토글이 없습니다.** `GET /api/dashboard`는 언제나 취소된 세션을 제외합니다(계약 4.3절).
- 토글을 켰을 때의 빈 상태: "그만둔 면접이 없습니다".
- **프론트에서 `canceled`를 필터링하지 않습니다.** 필터는 서버가 합니다 — 클라이언트가 한 번 더 거르면
  `status=canceled` 명시 조회가 빈 화면이 됩니다.
- 빈 상태: "아직 완료한 면접이 없습니다" + "새 면접 시작".
- 그만두기: 10.1절 · 삭제: 10.2절.

---

### 4.10 `/documents` — 이력서·JD 보관함

| 항목 | 내용 |
|---|---|
| 진입 | 인증 |
| 이탈 | `/sessions/new` |
| 훅 | `useDocuments` **`useDocument`**(삭제 확인 전 영향 건수) `useDocumentUpload` `useCreateDocument` `useExtractDocument` `useUpdateDocument` `useDeleteDocument` `useDocumentDownloadUrl` |
| shadcn | `Tabs`(이력서/JD) `Card` `Button` `Badge` `Textarea` `Input` `Dialog` `AlertDialog` `Alert` `Progress` `Skeleton` |

**업로드 흐름 (계약 2.1절 E2, `04_data_layer.md` 7.4절)**

```
1. crypto.randomUUID() 로 documentId 생성
2. supabase.storage.from('documents').upload(`${userId}/${documentId}.${ext}`, file)   ← 서버 경유 안 함
3. useCreateDocument({ docType, sourceType:'file', title, documentId, storagePath, mimeType, byteSize })
4. useExtractDocument(documentId)   → extractionStatus: 'succeeded' | 'failed'
5. 성공: extractedText를 Textarea에 보여주고 편집 가능하게 (제품 스펙 6절 — "확인 없이 넘어가면 안 됩니다")
   실패: extractionError 표시 + "텍스트 직접 입력" 탭으로 유도
```

- 클라이언트 사전 검증: **10MB 이하**, 확장자 `pdf` `docx` `txt` `md`. 서버·버킷 정책과 **같은 상수**를
  `src/lib/documents/constraints.ts`에 두고 양쪽이 이 파일을 씁니다.
- 업로드 진행률은 `Progress`. 추출 중(`running`)은 불확정 `Progress` + "문서를 읽고 있습니다".
  10MB PDF는 최악 ~25초이므로 **취소 버튼과 예상 시간 안내**를 둡니다.
- 파일 드래그 앤 드롭 영역은 shadcn에 없습니다 → `FileDropzone`을 직접 조립합니다(13절).
- "원본 열기"는 `useDocumentDownloadUrl().refetch()` → 새 탭. **만료 60초**이므로 미리 발급하지 않습니다.
- `extractionStatus` `Badge` 매핑: `pending` 대기 / `running` 읽는 중 / `succeeded` 준비됨 /
  `failed` 실패 / `not_required` 직접 입력.
- 빈 상태: 탭별로 "아직 올린 이력서가 없습니다" + [파일 올리기] [직접 입력].
- 삭제: 10.3절. **D6으로 경고 문구가, D21로 경고 시점이 바뀌었습니다.**

---

### 4.11 `/settings/account` — 계정

| 항목 | 내용 |
|---|---|
| 진입 | 인증 |
| 이탈 | 계정 삭제 성공 → `/` |
| 훅 | `useAccount` `useDeleteAccount` `useSignOut` **`useApiKeyStatus`**(상태 표시 전용) |
| shadcn | `Card` `Button` `AlertDialog` `Input` `Label` `Alert` `Separator` `Skeleton` `Badge` |

- 표시: `profile.email` / `displayName` / `defaultJobRole` / 가입일,
  그리고 `stats` — 세션 {n}건 · 문서 {n}건 · 저장 용량 {x} MB.
- **AI 키 — 상태 한 줄 + 링크만입니다. 폼을 두지 않습니다** (D28 · `01_product_spec.md` 7절 근거 4).

  | `keyStatus` | 이 화면에 보이는 것 |
  |---|---|
  | `none` | "연결된 키 없음" + `[키 연결하기]` → `/settings/api-key?next=/settings/account` |
  | `connected` | "연결됨 · ****{keyLast4}" + `[키 관리]` |
  | `invalid` | `Badge variant="destructive"` "키를 다시 확인해 주세요" + `[키 관리]` |

  - 훅은 **`useApiKeyStatus` 하나만** 추가합니다. `useConnectApiKey`·`useDisconnectApiKey`·`useVerifyApiKey`를
    이 화면에서 부르지 않습니다 — **키 입력 폼이 두 곳에 있으면 보안 규칙도 두 곳에서 검증해야 합니다.**
  - `keyLast4` 외의 키 값은 이 화면에도 존재하지 않습니다. 복사 버튼·"보기" 토글을 두지 않습니다.
  - 계정 삭제 확인 문구(10.4절)에 **"연결하신 AI 키도 함께 삭제됩니다"** 한 줄을 추가합니다(D28 보안 4항).
- `storageBytes`는 MB로 반올림해 표시합니다.
- **로그아웃**과 **계정 삭제**를 시각적으로 멀리 둡니다. 계정 삭제는 `Card`를 `border-destructive`로 분리.
- 삭제: 10.4절.
- `displayName` / `defaultJobRole` 편집 UI는 **만들지 않습니다** — 수정 엔드포인트가 계약에 없습니다(14절 §4).
  읽기 전용으로 표시합니다. **없는 API를 가정해 폼을 만들지 않습니다.**


### 4.12 `/settings/api-key` — AI 키 연결·교체·해제 ★신규 (D28)

| 항목 | 내용 |
|---|---|
| 진입 | 인증. 딥링크 4곳(리포트 CTA · 여력 부족 안내 · 대시보드 배너 · 동의 거부) + `/settings/account` 링크 |
| 이탈 | `?next=` 경로(검증 통과 시), 없으면 `/dashboard` |
| 훅 | `useApiKeyStatus` `useConnectApiKey` `useDisconnectApiKey` `useVerifyApiKey` |
| shadcn | `Card` `Form` `Input` `Label` `Button` `Alert` `AlertDialog` `Badge` `Separator` `Skeleton` `Accordion`(발급 안내) `Tooltip` |

**화면 구성 — 위에서 아래로 5개 블록**

```
① 현재 상태          Badge + 한 줄 (none / connected·****{last4} / invalid)
② 키 입력 폼         Input(type="password") + [연결하기] / [키 교체하기]
③ 발급 안내          Accordion — Google AI Studio에서 키를 만드는 단계
④ 왜 키를 연결하나   D29 프라이버시 설명 (체험 = 공용, 본인 키 = 본인 계정)
⑤ 연결 해제          keyStatus !== 'none'일 때만. border-destructive 카드로 분리
```

**① 현재 상태**

| `keyStatus` | 표시 | 부가 |
|---|---|---|
| `none` | "연결된 키 없음" | ②의 버튼은 **[연결하기]** |
| `connected` | `Badge` "연결됨" + **`****{keyLast4}`** | `lastVerifiedAt`을 "마지막 확인: {상대시간}"으로. `[지금 확인하기]`(`useVerifyApiKey`) |
| `invalid` | `Badge variant="destructive"` **"키를 다시 확인해 주세요"** | `lastFailureCode`를 4.14.2/4.14.3절 문안으로 매핑. ②의 버튼은 **[키 교체하기]** |

- `lastFailureCode` → 문구 매핑은 `src/lib/api-key/failure-code-ko.ts` **한 곳**에만 둡니다
  (`auth_rejected` → 4.14.2절 / `quota_exhausted` → 4.14.3절 / `unknown` → "키를 확인하는 중 문제가 있었어요. 다시 확인해 주세요").
- **`lastFailureCode`를 그대로 화면에 출력하지 않습니다.** 값은 영어 식별자이고, 번역해서 서버로 되돌려 보내지도 않습니다.

**② 키 입력 폼 — 이 서비스에서 키 원문을 다루는 유일한 곳**

| 규칙 | 내용 |
|---|---|
| 필드 | `Input type="password"`, `autoComplete="off"`, `spellCheck={false}`, `name="apiKey"` |
| **"보기" 토글 없음** | 만들 수 있어도 만들지 않습니다. 입력 중 어깨너머 노출과 스크린샷 유출을 줄이는 쪽이 오타 방지보다 중요합니다. 오타는 **연결 시 프로바이더 검증 1회**(#38)가 즉시 잡습니다 |
| **복사 버튼 없음** | 되돌려줄 값이 없습니다. `ApiKeyStatus`에 원문 필드가 존재하지 않습니다 |
| 연결 = 교체 | `keyStatus`와 무관하게 **같은 `useConnectApiKey`(#38)** 입니다. 부분 수정이 아니라 전체 교체이므로 "기존 키 일부만 고치기" UI를 만들지 않습니다 |
| 제출 후 | **즉시 `form.reset()`.** 성공·실패 어느 쪽이든 입력값을 화면과 메모리에서 지웁니다 |
| 대기 표시 | 프로바이더 검증이 포함돼 **~1.5초** 걸립니다(계약 #38). 버튼을 `disabled` + 스피너로 두고, 이 지연이 정상이라는 것을 "키를 확인하고 있어요"로 말합니다 |
| 실패 | `Alert variant="destructive"` 인라인. **입력값을 오류 문구에 되비추지 않습니다** |
| 성공 | `sonner` 토스트 "키를 연결했어요" → `['apiKey']`·`['capacity']` invalidate → `?next=`로 `router.replace()` |

**③ 발급 안내 (`Accordion`, 기본 접힘)**

Google AI Studio에서 키를 만드는 단계를 번호 목록으로 둡니다. 외부 링크는 `target="_blank" rel="noopener noreferrer"`.
**우리가 대신 발급해 줄 수 없다**는 사실을 분명히 하고, 스크린샷은 넣지 않습니다(외부 화면은 자주 바뀝니다).

**④ 왜 키를 연결하나 — D29 프라이버시 설명 (제약이 아니라 업그레이드로 씁니다)**

> **본인 키를 연결하면 무엇이 달라지나요**
>
> 체험 면접은 Google의 무료 AI 서비스로 진행됩니다. 입력하신 이력서와 답변을 Google이 서비스
> 개선에 사용할 수 있고, 검토자가 읽을 수 있습니다.
> 본인 API 키를 연결하면 이 과정을 거치지 않고, 언제든 면접을 시작하실 수 있습니다.
>
> 연결하신 키는 **암호화해서 보관**하며, 화면에는 **끝 4자리만** 보여 드립니다.
> 연결을 해제하거나 계정을 삭제하시면 **키도 함께 실제로 삭제**됩니다.

- 4.13절 동의 다이얼로그와 **첫 두 문장이 같습니다.** 두 곳의 문구는
  `src/lib/consent/trial-consent.ts`의 **같은 상수를 import** 합니다(계약 4.9.1절 — 사본을 만들면 해시가 갈라집니다).
- 마지막 두 줄(보관·삭제)은 이 화면 전용이며 동의 해시 대상이 **아닙니다.** 상수를 나눠 둡니다.

**⑤ 연결 해제 (`keyStatus !== 'none'`일 때만)**

- `border-destructive` 카드로 분리하고 `AlertDialog`로 확인합니다.
- 확인 문구: **"연결하신 키를 지웁니다. 저장된 키는 실제로 삭제되며 되돌릴 수 없습니다.
  진행 중인 면접은 이어서 할 수 없게 되고, 지난 리포트는 그대로 남습니다."**
- 해제 후 `keyStatus === 'none'`이 되어 **체험이 남아 있으면 체험 경로로, 없으면 벽**이 됩니다.
  그 결과를 확인 다이얼로그에서 미리 말하지 않습니다 — 체험 잔여를 노출하는 셈이 됩니다(금칙, 4.14.4절).

**보안 — 이 화면에서 지켜지지 않으면 다른 어디서도 지켜지지 않습니다**

1. **키 원문을 화면 어디에도 다시 표시하지 않습니다.** 입력 직후에도 마스킹뿐입니다.
2. **`localStorage`·`sessionStorage`·IndexedDB·쿠키에 키를 넣지 않습니다.**
3. **URL·쿼리 파라미터·해시에 키가 등장하지 않습니다.** `?next=`에는 경로만 들어갑니다.
4. **폼은 이 라우트에만 존재합니다.** `/settings/account`는 상태 한 줄 + 링크뿐입니다(4.11절).
5. 자동 재시도 없음(`retry: 0`), 뮤테이션 `variables`를 로깅·토스트에 싣지 않음(3.2절 표).
6. 이 페이지를 **서버 컴포넌트로 만들지 않습니다** — 폼 값이 서버 액션 페이로드로 흐르는 경로를 늘리지 않고,
   계약이 정한 `PUT /api/account/api-key` 하나로 모읍니다.

**상태별 렌더링**

| 상태 | 표현 |
|---|---|
| 로딩 | ①②를 `Skeleton`으로. ③④는 정적이므로 **즉시 보입니다**(읽을거리가 먼저 보이는 편이 낫습니다) |
| 오류(`useApiKeyStatus` 실패) | ① 자리에 `ErrorState`. **②는 그대로 둡니다** — 상태를 못 읽어도 키를 연결할 수는 있어야 합니다 |
| 빈 상태 | 해당 없음(`keyStatus === 'none'`이 정상 상태입니다) |

---

### 4.13 체험 데이터 처리 동의 다이얼로그 ★신규 (D29)

| 항목 | 내용 |
|---|---|
| 어디서 | `/sessions/new`에서 "면접 준비"를 누른 직후, `usePrepareSession` **직전**(4.4절) |
| 조건 | `capacity.nextFundingSource === 'trial_shared'` **그리고** `capacity.requiresTrialConsent === true` |
| 훅 | `useGrantTrialConsent`(#41) |
| shadcn | `Dialog` `Checkbox` `Button` `Label` `Alert` |
| 컴포넌트 | `src/components/session/TrialConsentDialog.tsx` |

**문안 — `01_product_spec.md` 6.5.4절의 초안을 그대로 씁니다**

> **체험 면접을 시작하기 전에 확인해 주세요**
>
> 체험 면접은 Google의 무료 AI 서비스로 진행됩니다. 입력하신 이력서와 답변을 Google이 서비스
> 개선에 사용할 수 있고, 검토자가 읽을 수 있습니다.
> 본인 API 키를 연결하면 이 과정을 거치지 않습니다.
>
> ☐ 위 내용을 확인했고 체험 면접 진행에 동의합니다
>
> `[동의하고 시작하기]`  `[내 키를 연결할게요]`

| 규칙 | 내용 |
|---|---|
| 기본값 | `Checkbox`는 **체크되지 않은 상태**. 미리 동의시켜 두지 않습니다 |
| 활성 조건 | 체크 전에는 [동의하고 시작하기]가 `disabled` |
| 거부 경로 | [내 키를 연결할게요] → `/settings/api-key?next=/sessions/new?sessionId={id}`. **막다른 길이 아닙니다** |
| 닫기 | `Esc`·바깥 클릭으로 닫을 수 있고, 닫으면 **아무 일도 일어나지 않습니다**(준비를 시작하지 않습니다) |
| 문구 출처 | **`src/lib/consent/trial-consent.ts` 한 곳.** 이 파일의 상수를 import 하며 **두 번째 사본을 만들지 않습니다** — 서버가 같은 상수로 해시를 계산합니다(계약 4.9.1절) |
| 버전 | 화면에 버전 문자열을 노출하지 않되, `useCapacity`의 `consentVersion`을 **그대로** `#41`에 보냅니다 |
| 기록 | 동의 성공 후에만 `usePrepareSession()`. 순서를 뒤집지 않습니다 |
| D16과 분리 | **마이크 권한 안내(9절)와 합치지 마세요.** 주체(브라우저 vs 우리)도 시점도 다릅니다 |
| 접근성 | `Dialog`에 `aria-describedby`로 본문을 연결하고, 열릴 때 포커스를 **본문 첫 문장**에 둡니다(버튼이 아닙니다 — 읽기 전에 누르게 하지 않습니다) |

- `byok` 세션은 이 다이얼로그를 **보지 않습니다.**
- 사용자가 이미 같은 버전에 동의했다면 `requiresTrialConsent`가 `false`여서 다이얼로그 자체가 뜨지 않습니다.
  그럼에도 서버가 409 `trial_consent_required`를 주면 **캐시가 낡은 것**이므로 `['capacity']`를 invalidate 하고 다시 띄웁니다.

---

### 4.14 안내 문구 3종 — **원인이 다르면 사용자가 할 일도 다릅니다** (D27·D28)

세 상황은 **원인 주체와 복구 경로가 전부 다릅니다.** 문구를 하나로 합치거나 서로 베끼지 마세요.
문안은 `src/lib/blocked/blocked-copy.ts` **한 곳**에 두고, **오류 `code`로 조회**합니다.
프로바이더 오류 메시지를 화면에 그대로 띄우지 않습니다.

| # | 상황 | 트리거 | 원인 주체 | 1순위 버튼 |
|---|---|---|---|---|
| 4.14.1 | 공용 여력 소진 | `canStartSession === false` / **503 `capacity_unavailable`** | **우리** | **[키 연결하기]** |
| 4.14.2 | 사용자 키 무효 | **409 `byok_key_invalid`** / `stream_error` / `keyStatus === 'invalid'` | **사용자** | **[키 교체하기]** |
| 4.14.3 | 사용자 키 사용량 소진 | **409 `byok_quota_exhausted`** / `stream_error` | **사용자** | [이어서 하기] (+ Google AI Studio 링크) |

> **⚠️ 503을 무조건 4.14.1로 렌더하지 마세요 (계약 14절 함정 1 · 15절 #11).**
> `useCapacity`의 **`keyStatus === 'invalid'`이면 진짜 원인은 여력이 아니라 무효한 키**입니다.
> 이 사용자에게 "오늘 면접이 모두 찼습니다"라고 말하면 **내일 다시 와도 똑같이 막힙니다.**
> 분기는 다음 한 줄입니다.
>
> ```
> 503 capacity_unavailable 수신
>   └─ capacity.keyStatus === 'invalid' ? 4.14.2(키를 다시 확인해 주세요) : 4.14.1(여력 부족)
> ```

#### 4.14.1 공용 여력 소진 — 벽에 출구를 함께 둡니다

> **지금은 새 면접을 시작할 수 없어요**
>
> 오늘 진행할 수 있는 면접이 모두 찼습니다.
> **본인 API 키를 연결하면 지금 바로 시작할 수 있어요.**
> 이미 진행 중인 면접과 지난 리포트는 그대로 보실 수 있습니다.
>
> `[키 연결하기]`  `[지난 리포트 보기]`

- **1순위 버튼은 "키 연결하기"** 입니다. "확인"이 1순위이면 D28로 얻은 유일한 이득이 사라집니다.
- `availableAtIso`가 **`null`이 아닐 때만** 부차 정보로 한 줄 덧붙입니다:
  "{내일 오전 0시} 이후에 다시 열립니다." **`null`이면 이 줄을 아예 렌더하지 않습니다** — 기다려도 풀리지 않습니다.
- **재시도 버튼을 두지 않습니다.** 지금 다시 눌러도 같은 결과입니다.
- #6에서 거절된 경우 한 줄 더: **"지금까지 입력하신 설정은 그대로 저장돼 있어요."**
  #3에서 거절된 경우에는 세션 자체가 없으므로 **그 줄을 뺍니다**.
- 노출 방식: 대시보드·세션 목록에서는 `Alert`(4.3절), **사용자가 방금 시도해 실패한 경우(503)에는 `AlertDialog`**.
  토스트로 흘려보내지 마세요 — 사용자가 무언가를 눌렀고 그것이 실패했습니다.

#### 4.14.2 사용자 키가 유효하지 않음 — "다시 확인해 주세요"

> **연결하신 키를 다시 확인해 주세요**
>
> 연결하신 키로 접속할 수 없었어요. 키가 삭제되었거나 권한이 바뀌었을 수 있습니다.
> 새 키로 교체하시면 마지막 질문부터 이어서 진행합니다.
>
> `[키 교체하기]`  `[여기서 마치기]`

- **"오늘 면접이 모두 찼습니다"라고 말하지 않습니다.** 원인이 우리 쪽이 아닙니다.
- **"내일 다시 오세요"를 쓰지 않습니다.** 기다린다고 풀리는 문제가 아닙니다 — 사용자가 키를 고쳐야 합니다.
- `details.keyLast4`가 오면 **"****{keyLast4} 키"** 로 어느 키인지 짚어 줍니다. 그 외 키 값은 표시하지 않습니다.
- 면접 도중이면 **세션을 잃지 않는다**는 사실을 함께 말합니다(`paused`, 7일 재개 창).

#### 4.14.3 사용자 키의 사용량이 소진됨 — **시각을 지어내지 않습니다**

> **연결하신 키를 지금은 쓸 수 없어요**
>
> 연결하신 키의 사용량이 오늘 한도에 도달했어요. Google AI Studio에서 확인하실 수 있습니다.
> 사용량이 회복되면 마지막 질문부터 이어서 진행합니다.
>
> `[이어서 하기]`  `[여기서 마치기]`   (본문에 Google AI Studio 링크)

- **재개 가능 시각을 제시하지 않습니다.** `resumableAfter`도 `details.availableAtIso`도 없습니다.
  없는 정보를 지어내면 **그 시각에 다시 온 사용자가 또 막힙니다**(`01_state_machine.md` 4.5절 규칙 2).
- **"내일 다시 오세요"를 쓰지 않습니다.** 우리가 아는 사실이 아닙니다. 대신 **확인할 곳**을 알려 줍니다.
- **[이어서 하기]를 `disabled`로 두지 않습니다.** 결제를 활성화했거나 사용량이 회복된 사용자는 즉시 이어서 할 수 있어야 합니다.
- 4.14.2와 **첫 문장부터 다릅니다.** 한쪽은 "키가 잘못됐다", 다른 쪽은 "키는 멀쩡한데 지금은 못 쓴다"입니다.
  사용자가 할 일이 각각 **키 교체**와 **잠시 후 재개**로 갈립니다.

#### 4.14.4 문구 금칙 — 상시 검사 항목 (`02_ai_architecture.md` 13.6.3절 · `01_product_spec.md` 6.5.5절)

**사용자에게 보이는 어떤 문자열에도 넣지 않습니다.**

```
"무료 티어"  "티어"  "쿼터"  "quota"  "한도"  "레이트 리밋"  "rate limit"
"RPD"  "RPM"  "예약분"  "토큰"  "버킷"  "잔여"  "1/1"  "남은 횟수"
```

| 예외 | 범위 |
|---|---|
| **"API 키"** | 허용합니다. 사용자가 Google에서 발급받을 것의 **이름**입니다 |
| **"한도"** | **4.14.3절 한 곳에서만** 허용합니다. 그것은 우리 내부 사정이 아니라 **사용자 본인 계정의 사실**이고, 감추면 사용자가 원인을 찾을 수 없습니다(`01_product_spec.md` 6.5.6절이 명시한 예외). **4.14.1·4.14.2에는 쓰지 않습니다** |

- **체험 잔여 횟수 카운터를 노출하지 않습니다.** "1/1"·"남은 횟수"·"무료 체험 잔여" 어느 것도 만들지 않습니다.
  그 순간 제품이 요금제처럼 보입니다. 체험은 "첫 면접"이지 "무료 쿠폰"이 아닙니다(6.5.3절).
- `trialStatus`는 **분기 조건으로만** 쓰고 **화면에 렌더하지 않습니다.**
- 서버가 준 `message`를 그대로 렌더하는 경로(`ErrorState`)도 이 검사 대상입니다.
  계약이 `details`에 버킷·잔여량·한도를 넣지 않기로 했지만(계약 13절), **UI가 그 약속에 기대어 검사를 생략하지는 않습니다.**
- 검사 방법: `src/lib/blocked/blocked-copy.ts`와 `src/components/**`에 대한 **금칙어 grep을 QA 항목으로** 둡니다(17절).

---

## 5. 컴포넌트 트리와 재사용 단위

```
src/components/
├── ui/                          ← shadcn add 로 생성된 것 + 14절의 직접 조립분. 손으로 고치지 않음
├── layout/
│   ├── AppShell.tsx             (app) 레이아웃. 헤더 + 미열람 배지 + SkipLink
│   └── PageHeader.tsx           제목 + 뒤로가기 + 우측 액션 슬롯
├── common/
│   ├── EmptyState.tsx           아이콘 + 문장 + 행동 버튼 1개
│   ├── ErrorState.tsx           ApiError.message + 다시 시도
│   ├── NotFoundState.tsx        404 전용 ("찾을 수 없는 …")
│   ├── ConfirmDeleteDialog.tsx  AlertDialog + 확인 문구 입력 + 잃는 것/남는 것 목록 (삭제 전용)
│   ├── ConfirmCancelDialog.tsx  AlertDialog. 취소(#33) 전용 — 파괴적 스타일을 쓰지 않는다
│   ├── LoadingCard.tsx          Skeleton 조합
│   ├── LiveRegion.tsx           aria-live 전용(시각적으로 숨김)
│   └── BlockedNotice.tsx        ★ 안내 3종의 유일한 껍데기 (4.14절). code → 문안 + 버튼을 blocked-copy.ts에서 조회
├── session/
│   ├── SessionListItem.tsx      /dashboard · /sessions 공용
│   ├── SessionStatusBadge.tsx   status → 한국어 라벨 + 토큰 (한 곳)
│   ├── PersonaCard.tsx          /sessions/new
│   ├── JobRoleRadioGroup.tsx
│   ├── ModalityRadioGroup.tsx
│   ├── TrialConsentDialog.tsx   ★ 체험 동의 (4.13절, D29). trial-consent.ts 상수를 import
│   └── DocumentPicker.tsx       보관함/업로드/직접입력 3탭. /sessions/new · /documents 공용
├── account/
│   ├── ApiKeyStatusRow.tsx      ★ 상태 한 줄 (4.11·4.12절 ① 공용). keyLast4 외의 키 값을 받지 않는다
│   ├── ApiKeyForm.tsx           ★ 키 입력 폼. /settings/api-key에만 마운트된다 (4.12절 ②)
│   └── ApiKeyDisconnectCard.tsx ★ 연결 해제 (4.12절 ⑤)
├── interview/
│   ├── ConversationLog.tsx      ★ 음성·텍스트 공용. 모달리티를 모른다
│   ├── TurnBubble.tsx           면접관/후보 공용. isCorrected · sttConfidence 힌트
│   ├── StreamingTurn.tsx        스트리밍 중 면접관 발화 + 커서
│   ├── VoiceStatePanel.tsx      4상태 표시 (6.1절)
│   ├── VuMeter.tsx              직접 조립
│   ├── SilenceCountdownRing.tsx 직접 조립 (U4)
│   ├── AnswerInputVoice.tsx     ← 교체되는 유일한 영역
│   ├── AnswerInputText.tsx      ←        "
│   ├── TranscriptCorrection.tsx 직전 답변 인라인 편집
│   ├── ResumePanel.tsx          paused
│   ├── DistressChoiceDialog.tsx session_notice(distress_guard) 3지 선택
│   └── InterviewControls.tsx    일시정지 / 여기서 마치기 (상시)
├── report/
│   ├── OverallScoreCard.tsx     총점 + 페르소나 + rubricVersion + scoredAxisCount
│   ├── AxisScoreCard.tsx        축 카드 (점수·가중치·rationale·인용·improvement)
│   ├── CitationBlock.tsx        인용 + 이의 제기 버튼
│   ├── InsufficientEvidenceCard.tsx  score = NULL 전용
│   ├── ImprovementList.tsx      코치 개선점 3가지
│   ├── FollowUpDepthSummary.tsx 꼬리질문 요약
│   ├── HelpfulnessFeedback.tsx  지표 4 (myFeedback으로 초기 상태 복원)
│   └── DisputeDialog.tsx        지표 5 (사유 코드 4종. myDisputes로 중복 제기 차단)
└── transcript/
    ├── QuestionTree.tsx
    └── QuoteHighlight.tsx
```

**재사용의 핵심 3가지**

1. **`ConversationLog` / `TurnBubble`은 모달리티를 모릅니다.** `turns`만 받습니다. 음성이든 텍스트든
   같은 트리가 그려지고, **교체되는 것은 `AnswerInputVoice` ↔ `AnswerInputText` 하나뿐**입니다.
   두 모드를 다른 페이지로 나누면 세션 중 전환이 불가능해집니다.
2. **`SessionStatusBadge`가 status → 한국어 라벨의 유일한 사본**입니다. 화면마다 매핑을 다시 쓰면
   같은 상태가 화면마다 다르게 불립니다.
3. **`ConfirmDeleteDialog`가 삭제 3종(세션·문서·계정)의 공통 껍데기**입니다. "잃는 것 / 남는 것"을
   props로 받아 10.2~10.4절의 각 문구를 채웁니다.
5. **`BlockedNotice`가 안내 3종의 유일한 사본입니다**(4.14절). 화면마다 문구를 다시 쓰면
   같은 상황이 화면마다 다르게 불리고, 금칙어 검사 지점이 흩어집니다. 이 컴포넌트는 **문구를 받지 않고
   `code`를 받습니다** — `capacity_unavailable` / `byok_key_invalid` / `byok_quota_exhausted`.
   문구를 prop으로 받게 만드는 순간 호출부에서 아무 문장이나 들어올 수 있습니다.
6. **`ApiKeyForm`은 `/settings/api-key`에만 마운트됩니다**(D28 6.5.7절). 재사용 가능한 컴포넌트로
   만들어 두되 **다른 화면에서 import 하지 않습니다** — 폼이 두 곳에 있으면 보안 규칙도 두 곳에서 검증해야 합니다.
   `ApiKeyStatusRow`는 반대로 두 화면에서 공용이며, **`keyLast4` 외의 키 값을 받는 prop이 없습니다.**

4. **`ConfirmCancelDialog`를 `ConfirmDeleteDialog`와 합치지 않습니다**(D19). 한 컴포넌트로 묶고 prop으로
   문구만 바꾸면, `variant="destructive"`와 "되돌릴 수 없습니다"가 취소 흐름에 새어 들어옵니다.
   **두 동작이 다르다는 사실을 컴포넌트 경계로 강제합니다**(10.1절).

---

## 6. 면접 세션 화면 — 상세

### 6.1 음성 4상태 UI (문자 단위 계약)

```
listening | transcribing | thinking | speaking
```

| 상태 | 한국어 표시 | 시각 | 보조 | 함께 노출되는 버튼 |
|---|---|---|---|---|
| `listening` | **듣는 중** | `VuMeter`(입력 레벨) + 마이크 아이콘 | 침묵 임박 시 `SilenceCountdownRing` + "곧 답변을 마칩니다" | **[답변 완료]**(항상 활성), [텍스트로 전환] |
| `transcribing` | **받아쓰는 중** | 점 3개 애니메이션 + interim 전사를 `text-muted-foreground`로 흐리게 | t+400ms 이내 반드시 표시 | (없음) |
| `thinking` | **면접관이 생각 중** | 펄스 인디케이터 | 3초 → "조금만 기다려 주세요" / 8초 → 지연 안내 | 8초 경과 시 **[텍스트로 전환]** |
| `speaking` | **말하는 중** | 파형 아이콘 + 스트리밍 텍스트 커서 | — | **[답변 시작]**(수동 barge-in, D15), [다시 듣기] |

**규약**

- `transcribing`은 **텍스트 모드에서 나타나지 않습니다.** 제출 즉시 `thinking`입니다.
- 나머지 3개는 **두 모달리티 모두에서** 나타납니다. 텍스트 모드에서도 `speaking`을 표시합니다
  (오디오만 없고, 면접관이 응답 중이라는 사실은 모달리티와 무관합니다 — `03_voice_pipeline.md` 10.4절).
- **색·애니메이션만으로 상태를 표현하지 않습니다.** 항상 한국어 텍스트 레이블이 함께 있습니다(U6).
- 상태 전환은 `LiveRegion`(`aria-live="polite"`)으로 스크린리더에 알립니다.

**보조 4상태 — `voice-pipeline-engineer` U2에 대한 회신**

```
idle | requesting_permission | error | text_fallback
```

**이름을 그대로 채택합니다. 변경 요청 없습니다.** 그리고 **`error`를 4상태와 배타적으로 만들지 않습니다** —
`error`는 별도 배너 레이어이며, `thinking` 표시와 동시에 존재할 수 있습니다. 구현상 4상태는
`voiceState`, 보조 상태는 `overlay`라는 **다른 필드**에 둡니다. 한 필드에 넣으면 배타가 강제됩니다.

```ts
type InterviewUiState = {
  voiceState: 'listening' | 'transcribing' | 'thinking' | 'speaking';
  overlay: null | { kind: 'idle' | 'requesting_permission' | 'error' | 'text_fallback'; messageKo: string };
};
```

### 6.2 스트리밍 텍스트 표시

- `utterance_chunk`가 오는 즉시 `StreamingTurn`에 append합니다. **오디오 재생 완료를 기다리지 않습니다**(U5).
  텍스트가 오디오보다 **먼저** 화면에 나타나는 것이 계약입니다.
- 진행 중 표시: 마지막 글자 뒤 깜빡이는 커서(`▍`). `aria-busy="true"`.
- **자동 스크롤은 사용자가 맨 아래에 있을 때만.** 위로 스크롤해 과거 발화를 읽는 중이면 강제로 내리지 않고
  "새 발화 ↓" 플로팅 버튼을 띄웁니다.
- `aria-live`: 스트리밍 중에는 **글자마다 읽히면 안 되므로** 컨테이너를 `aria-live="off"`로 두고,
  `utterance_done` 시점에 완성된 발화 전문을 `LiveRegion`에 한 번 넣습니다.
- 스트림 오류(`stream_error`): 지금까지 렌더된 텍스트를 **지우지 않고** 아래에 `Alert`를 붙입니다.
  `retryable: true` → "면접관이 답변을 정리하고 있습니다" (상태는 `thinking` 유지),
  `retryable: false` → 4단계 안내 + 재개 시각.
- `session_notice`:
  - `distress_guard` → `DistressChoiceDialog` **3지 선택**("잠시 쉬기 / 여기서 마치기 / 계속하기").
    각각 `usePauseSession` / `useCompleteSession` / 닫기.
  - `pressure_capped`, `rate_limit_fallback` → 배너 1회.

### 6.3 텍스트 폴백 전환

- **양방향 토글**을 `InputArea` 우측에 상시 노출합니다. 음성 → 텍스트뿐 아니라 **텍스트 → 음성 복귀**도
  언제든 가능해야 합니다.
- `voice → text`(`03_voice_pipeline.md` 10.3절 순서 고정):
  1. 진행 중인 턴의 **interim 전사를 `Textarea`에 미리 채웁니다** ← 유실 방지. 이 절의 핵심
  2. `releaseAudioGraph()`
  3. `useSwitchModality({ modality: 'text', reason })`
  4. `Textarea`에 포커스
  5. `overlay = text_fallback` 배너
- `text → voice`: 미제출 텍스트가 있으면 **전환을 막고** "먼저 제출하거나 지워 주세요". 그다음 마이크 재점검.
- 자동 전환(권한 거부·장치 실패·STT 연속 실패)은 **사유별 문구**를 `03_voice_pipeline.md` 10.2절 매트릭스 그대로 씁니다.
- `reason` 값은 영어 문자열 그대로 서버에 보냅니다: `mic_permission_denied` `mic_unavailable` `stt_error`
  `rate_limit_fallback` `user_requested_after_delay` `user_requested`.

### 6.4 "답변 완료" 버튼 (D14)

- `listening` 중 **항상 활성**입니다. 침묵 감지는 보조이고 **이 버튼이 본체**입니다(원칙 4, U3).
- 누르면 침묵 타이머를 건너뛰고 즉시 턴을 확정 → `transcribing`.
- 키보드 접근: `InputArea` 안에서 Tab 순서 첫 번째. 단축키는 두지 않습니다
  (면접 중 오발동이 답변을 끊습니다).
- `listening` 카운트다운 예고(U4): 남은 침묵 시간 **1,200ms** 구간에서 `SilenceCountdownRing`을 띄우고
  "곧 답변을 마칩니다"를 붙입니다. **이 동안 말을 이으면 리셋**되고 링이 사라집니다.
  링은 `role="timer"` + `aria-label="곧 답변을 마칩니다"`이며, 초 단위로 `aria-live`를 갱신하지 않습니다
  (스크린리더가 계속 떠들면 답변을 방해합니다).

### 6.5 "답변 시작" 버튼 — 수동 barge-in (D15)

- **자동 barge-in은 MVP 기본 `off`**입니다. `speaking` 중 **[답변 시작]** 버튼을 항상 노출합니다(U10).
- 누르면 `03_voice_pipeline.md` 5.2절 순서: `speechSynthesis.cancel()` → SSE `abort()` →
  `speaking → listening` → 로그에 "(중간에 답변을 시작했습니다)" 표시.
- **이미 렌더된 면접관 텍스트를 지우지 않습니다.** 오디오는 사라져도 텍스트는 남습니다.
- 클라이언트는 저장을 결정하지 않습니다. 서버가 M7/M8로 확정분을 저장합니다.

### 6.6 "일시정지 / 여기서 마치기" 상시 노출

- `InterviewHeader` 우측에 **항상** 보입니다(`02_ai_architecture.md` 10.2절 — G4 오탐 대비 안전장치).
  스크롤·상태·모달리티와 무관하게 사라지지 않습니다.
- **[일시정지]** → `usePauseSession({ pauseReason: 'user_requested' })` → 재개 패널.
- **[여기서 마치기]** → `AlertDialog` 확인 → `useCompleteSession()` → `/sessions/{id}/report`.
  `answeredMainQuestionCount === 0`이면 비활성 + "답변한 주질문이 1개 이상이어야 평가할 수 있습니다".
  - **응답의 `session.status`는 정상 경로에서 `completed`가 아니라 `evaluating`입니다**(D18, 계약 4절 경고).
    서버가 같은 요청 안에서 평가를 등록하기 때문입니다. `status === 'completed'`를 기대하고 화면을 넘기는
    분기를 쓰면 **정상 경로에서 그 분기가 한 번도 실행되지 않습니다.** 두 값 모두 리포트로 보냅니다.
  - 이동 후 리포트 화면에서 **`useRetryEvaluation`을 부르지 않습니다.** 평가는 이미 등록됐습니다.
- **[이 면접 그만두기]**(취소) → `ConfirmCancelDialog` → `useCancelSession()` → `/sessions?includeCanceled=true`.
  `in_progress`·`paused` 어느 쪽에서도 부를 수 있습니다.
  - **진행 중 취소의 순서**(`03_voice_pipeline.md` 5.2절 정리 순서를 그대로 탑니다):
    ① `speechSynthesis.cancel()` ② 진행 중 SSE `abort()` ③ `releaseAudioGraph()`로 오디오 버퍼 폐기
    ④ `useCancelSession()` ⑤ 이동. **오디오 폐기는 클라이언트의 일입니다** — 서버는 오디오를 갖고 있지 않습니다.
  - abort는 상태를 바꾸지 않으므로 취소와 충돌하지 않습니다(계약 4.2절).
  - **대화 기록은 남습니다.** 다이얼로그 문구가 이 사실을 말해야 합니다(10.1절).
- 이탈 방어: `visibilitychange` / `beforeunload`에서 `navigator.sendBeacon`으로 `#13 pause`를 호출합니다
  (계약 15절 #2의 근사안, 최선 노력). **여기에 확인 다이얼로그를 띄우지 않습니다** — 브라우저가 무시합니다.

### 6.7 직전 답변 정정 (제품 스펙 5절)

- 정정 창: 내 답변이 렌더된 순간부터 **다음 면접관 발화의 `utterance_done` 도착까지**
  (`03_voice_pipeline.md` 9.1절, 계약 15절 #5). `useInterviewStream`의 `done`이 오면 창을 닫습니다.
- `thinking` 구간이 가장 자연스러운 지점이므로, 이때 연필 아이콘을 **강조**합니다.
- 문구: **"고친 내용은 평가에 반영됩니다."** "면접관이 다시 듣습니다"가 아닙니다(U7).
- `sttConfidence < 0.6`이면 "인식이 불확실합니다. 확인해 주세요" 힌트. **보조 신호일 뿐**이며
  (`NULL`이 흔함 — L6) 정정 버튼 자체는 confidence와 무관하게 항상 노출됩니다.
- 저장: `useCorrectTurn` → `Turn` 반환 → 로그의 해당 발화 교체 + "정정됨" `Badge`.
- 창이 닫힌 뒤 시도하면 서버가 409를 줍니다. UI는 그 전에 버튼을 감춥니다.
- **`utterance_done.sessionStatus === 'completed'`(면접 종료)일 때도 창은 그 시점에 닫힙니다.** 마지막 답변만
  예외적으로 계속 고칠 수 있게 두지 않습니다 — 서버가 이미 평가를 등록했으므로(D18) 고쳐도 반영되지 않고,
  "고친 내용은 평가에 반영됩니다"라는 이 절의 약속이 거짓이 됩니다.

---

## 7. 리포트 화면 — 상세

### 7.1 총점 영역 (D1)

```
┌ OverallScoreCard ──────────────────────────────┐
│  3.4 / 5.0                                      │
│  심층 압박형 · 채점 기준 v1.0.0-draft            │
│  5축 중 4축이 총점에 반영되었습니다               │
└────────────────────────────────────────────────┘
```

- `overallScore`를 **소수 1자리**로 표시합니다(D1). 값은 `numeric(3,2)`이므로 표시에서만 반올림하고
  재계산하지 않습니다.
- **페르소나와 `rubricVersion`을 총점 옆에 반드시 함께** 노출합니다(D1 강제 2번). 가중치가 다르면 다른 척도입니다.
- `scoredAxisCount`를 문장으로 붙입니다. **총점만 단독으로 크게 띄우지 않습니다.**
- `overallScore === null`(모든 축이 근거 부족): 숫자 자리에 "—"를 두고
  "이번 세션에서는 점수를 낼 근거가 부족했습니다"를 설명으로 답니다. **오류 화면이 아닙니다.**
- 시각화는 `Progress`(0~5를 0~100%로) 한 종류만 씁니다. 차트 라이브러리를 도입하지 않습니다.

### 7.2 축별 카드 5장

**루브릭 축 5개 — 식별자 ↔ 표시명 매핑 (QA F14 대응. 이 표가 코드 대조의 기준선입니다)**

`src/lib/report/axis-meta.ts` **한 곳에만** 둡니다. 화면마다 다시 쓰면 같은 축이 화면마다 다르게 불립니다.

| `Axis` 값 (**영어 그대로. 번역·camelCase 변환 금지**) | 화면 표시명(한국어) | 카드 순서 |
|---|---|---|
| `job_knowledge` | 직무 지식 | 1 |
| `logical_consistency` | 논리 일관성 | 2 |
| `evidence_specificity` | 근거의 구체성 | 3 |
| `structure` | 구조화 | 4 |
| `communication` | 전달력 | 5 |

- **카드 순서는 이 표 고정입니다.** `evaluation.axes`가 오는 순서에 의존하지 않고 이 배열로 정렬합니다 —
  세션마다 축 순서가 바뀌면 회차 비교가 불가능합니다.
- `axes`는 **언제나 정확히 5개**입니다(계약 12절). 개수가 다르면 렌더링하지 말고 오류로 처리합니다.
- 이 값들은 `01_rubric.md` 1절 · `02_ai_contracts.md`(`$defs/axis`) · `04_data_layer.md`(CHECK 5개 값) ·
  `05_api_contract.md` 12절(`Axis`)과 **문자 단위로 같습니다.** `targetAxis`(질문)·`related_axis`(코치 개선점)도
  같은 유니온이므로 같은 매핑을 씁니다.

`Accordion`이 아니라 **항상 펼쳐진 `Card` 5장**입니다. 접으면 인용이 숨겨지고, 인용 없는 점수는
이 제품에서 성립하지 않습니다(핵심 가치 2).

```
┌ AxisScoreCard: 논리 일관성 ─────────────────────────────┐
│  3 / 5      가중치 0.30      [이건 아닌 것 같아요]        │
│  채점 근거: {rationale}                                   │
│  ── 근거가 된 내 답변 ────────────────────────────────    │
│   ❝ {quoteText} ❞                    [이건 아닌 것 같아요] │
│     {comment}                        [전문에서 보기 →]     │
│   (최대 3건)                                              │
│  ── 이렇게 해보세요 ──────────────────────────────────    │
│  {improvement}          ← null이면 이 영역 전체를 감춘다   │
└──────────────────────────────────────────────────────────┘
```

- **`improvement === null`이면 그 영역을 통째로 감춥니다**(`04_data_layer.md` 12절 조정 1).
  "생성 실패" 문구를 축마다 반복 노출하지 않습니다.
- **인용 클릭 → transcript 이동**: `[전문에서 보기 →]`는 `/sessions/{id}/transcript#turn-{turnId}`로 갑니다.
  대상 페이지가 실재함을 4.8절에서 확인했습니다.
- 인용 하이라이트는 `quoteText` 문자열로 합니다(계약 9.2절).
- 정정된 발화를 인용한 경우 "사용자가 정정한 답변" `Badge`를 함께 노출합니다(루브릭 4절 6항).
- **`score_card_viewed` 이벤트**: 각 축 카드가 뷰포트에 50% 이상 1초 이상 들어오면
  `useReportEvent({ eventName: 'score_card_viewed', detail: { axis, scoreId } })`를 **축당 1회** 보냅니다.
  지표 5가 "축 점수 카드 노출 대비 클릭 비율"이므로 **이 이벤트가 분모**입니다. 빠지면 지표가 계산되지 않습니다.
- 리포트 최초 렌더 시 `report_viewed`도 1회 보냅니다.

### 7.3 근거 부족 축 (`score = NULL`)

`InsufficientEvidenceCard`로 **다르게** 그립니다. 0점처럼 보이면 안 됩니다.

```
┌ 근거의 구체성 ───────────────────────────────────┐
│  채점하지 않음   [근거 부족]                       │
│  이번 세션에서는 판단할 근거가 부족했습니다.        │
│  이 축은 총점 계산에서 제외되었습니다.              │
│  다음 세션에서 이 축이 채점되려면: {rationale}      │
└──────────────────────────────────────────────────┘
```

- 판정 기준은 **`isInsufficientEvidence === true`** 하나입니다. `score === null`과 항상 함께 오지만,
  UI는 boolean을 봅니다(숫자 0과 `null`을 헷갈릴 여지를 없앱니다).
- 인용은 0건이므로 인용 영역을 만들지 않습니다.
- **이의 제기 버튼은 이 카드에도 둡니다** — "근거가 있었는데 못 찾았다"가 정확히 사용자가 알려 줄 수 있는 것입니다.
  `citationId`는 `null`로 보냅니다.
- 점수 자리에 회색 0을 그리지 않습니다. 색으로만 구분하지 않고 **"채점하지 않음"** 텍스트를 씁니다.

### 7.4 총평 · 개선점 · 꼬리질문 요약

| 영역 | 원본 | `null`일 때 |
|---|---|---|
| 총평 | `evaluation.summary` (3~5문장) | **`summary === null`이 "코치 미완료"의 유일한 판정 기준**. 이때만 리포트 상단에 **[개선 제안 다시 생성]**(`useRetryCoach`)을 **한 번** 노출 |
| 개선점 3가지 | `evaluation.improvements` (`CoachImprovement[]`) | 영역 감춤 |
| 모범 답변 | `evaluation.coachPayload.model_answers` | 영역 감춤 |
| 다음 행동 | `evaluation.coachPayload.next_actions` | 영역 감춤 |

- **`coachPayload`와 `improvements` 안의 키는 snake_case입니다**(계약 2.1절 **E3**).
  `related_axis` `why_weak` `model_answer` `expected_effect` `next_actions` `model_answers` —
  **camelCase로 고쳐 쓰면 런타임에 `undefined`입니다.** 프론트 타입도 계약 12절 그대로 snake_case로 선언합니다.
- **꼬리질문 요약**(`FollowUpDepthSummary`, 루브릭 5절): "어느 주질문에서 몇 단계까지 파고들렸는지".
  `Evaluation`에 이 필드가 없으므로 **`useTranscript`의 `questions`에서 계산**합니다
  (`questionKind === 'main'`별로 자손의 최대 `depth`). 데이터를 지어내지 않고 기존 엔드포인트로 파생시킵니다.
  → 성능·왕복이 문제가 되면 14절 §3의 API 추가 요청으로 전환합니다.

### 7.5 유용성 피드백 UI (지표 4)

```
┌ 이 피드백이 도움이 되었나요? ────────────────┐
│  [👍 도움됐어요]   [👎 아쉬워요]              │
│  (선택) 어떤 점이 그랬는지 알려 주세요        │
│  [Textarea]                        [저장]     │
└──────────────────────────────────────────────┘
```

- `useReportFeedback`은 **`PUT`**이므로 멱등입니다. 세션당 1회 저장, **수정 가능**.
- 저장 후 버튼은 선택 상태를 유지하고 "의견을 남겨 주셔서 감사합니다. 언제든 바꿀 수 있습니다"를 표시합니다.

**초기 상태는 `evaluation.myFeedback`에서 복원합니다 (D20 — 미결이었던 §1이 해소됐습니다).**

```ts
// 별도 조회 훅을 만들지 않는다. useEvaluation 하나에 실려 온다.
const fb = evaluation?.myFeedback ?? null;      // ReportFeedback | null
const initial = fb ? { isHelpful: fb.isHelpful, comment: fb.comment ?? '' } : null;
```

| `myFeedback` | 화면 |
|---|---|
| `null` | 미제출 상태. 두 버튼 모두 선택 안 됨 |
| 값 있음 | 해당 버튼이 **선택된 채로** 렌더 + `comment`가 `Textarea`에 채워짐 + "의견을 남겨 주셔서 감사합니다. 언제든 바꿀 수 있습니다" |

- **새로고침해도 확인 문구가 사라지지 않습니다.** 이것이 D20이 고친 문제입니다.
- 저장 성공 후 `['evaluation', sessionId]`를 invalidate 합니다. 응답의 `ReportFeedback`을 캐시에 직접
  써넣지 않습니다(2.4절 규칙) — 서버가 준 `myFeedback`이 단일 진실입니다.
- `PUT`이 멱등이므로 **수정은 언제나 열려 있습니다.** 재제출을 막지 않습니다 — 세션당 1행이라 중복이 생기지 않습니다.
  (중복을 막아야 하는 것은 이의 제기 쪽입니다 — 7.6절.)

### 7.6 이의 제기 UI (지표 5, D4)

- 진입점 **2곳**: ① 각 축 점수 카드 헤더 ② 각 인용 옆 — 둘 다 **"이건 아닌 것 같아요"**.
- `DisputeDialog`에서 사유 코드 4종을 `RadioGroup`으로 고릅니다. **값은 영어 그대로 전송**합니다.

| 값(전송) | 화면 문구(한국어) |
|---|---|
| `transcription_error` | 제 말과 다르게 적혔어요 |
| `misinterpreted` | 제 의도를 잘못 읽었어요 |
| `score_too_low` | 점수가 부당해요 |
| `other` | 그 밖의 이유 |

- 축에서 열면 `citationId: null`, 인용에서 열면 해당 `citationId`를 함께 보냅니다. `scoreId`는 항상 필수
  (`EvaluationAxis.id`가 `evaluation_scores.id`이자 `scoreId`입니다).

**D4 필수 — 접수 확인과 용도 안내 (이것이 없으면 지표 5가 아예 수집되지 않습니다)**

제출 직후 다이얼로그를 닫지 말고 **확인 화면으로 바꿉니다.**

> **의견이 접수되었습니다.**
> 이 의견으로 지금 점수가 다시 계산되지는 않습니다. 남겨 주신 사유는 채점 기준과 질문을
> 다듬는 데 쓰이며, 다음 개선에 반영됩니다.

- 제출한 축·인용에는 **"의견 보냄"** `Badge`를 남겨 사용자가 자기 행동의 흔적을 봅니다.
- **"재평가 중"으로 오해할 수 있는 표현을 쓰지 않습니다.** 스피너·진행률을 띄우지 않습니다.

**접수 상태 복원과 중복 제기 차단 (D20 — 지표 5 오염 방지)**

`evaluation.myDisputes: ScoreDispute[]`로 복원합니다. **빈 값은 `[]`이고 `null`이 아닙니다**(계약 12.3절) —
`?? []` 방어 코드를 두지 마세요. 정렬은 `createdAt` 오름차순으로 서버가 보장합니다.

```ts
// 연결 키: myDisputes[].scoreId ↔ EvaluationAxis.id, myDisputes[].citationId ↔ Citation.id
const disputedScoreIds   = new Set(evaluation.myDisputes.map(d => d.scoreId));
const disputedCitationIds = new Set(
  evaluation.myDisputes.map(d => d.citationId).filter((v): v is string => v !== null),
);
```

| 진입점 | "의견 보냄" 배지 조건 | 버튼 상태 |
|---|---|---|
| 축 카드 헤더 | `disputedScoreIds.has(axis.id)` | **`disabled`** + 툴팁 "이미 의견을 보내셨습니다" |
| 인용 옆 | `disputedCitationIds.has(citation.id)` | **`disabled`** + 같은 툴팁 |

- **새로고침해도 배지가 유지되고, 이미 제기한 항목은 다시 제기할 수 없습니다.** 두 번 세면 지표 5
  ("축 점수 카드 노출 대비 이의 제기 비율")의 분자가 부풀어 **제품 판단의 근거가 오염됩니다.**
- **서버도 같은 `(scoreId, citationId)` 조합을 409로 막습니다**(계약 12.3절). UI의 `disabled`는 1차 방어이고,
  경합으로 409가 오면 **오류 토스트가 아니라** "이미 접수된 의견입니다"를 안내하고 배지를 켭니다.
  사용자가 잘못한 것이 아닙니다.
- **축 단위와 인용 단위는 별개입니다.** 같은 축에서 인용에 대해 이의를 냈어도 축 헤더 버튼은
  `citationId: null`인 이의가 없는 한 열려 있습니다. `disabled` 판정에 두 Set을 섞지 마세요.
- 제출 성공 후 `['evaluation', sessionId]`를 invalidate 합니다. 응답의 `ScoreDispute`를 로컬 상태에만
  쌓아 두면 다른 탭·새로고침에서 다시 벌어집니다.

---

## 8. 평가 대기 UX (비동기 평가)

### 8.1 `completed` — 평가 등록 직후 (**D18로 확정. 미결이 아닙니다**)

```
┌────────────────────────────────────────┐
│  ◐ 답변을 평가하고 있습니다               │
│  보통 1~2분 걸립니다.                     │
│  이 화면을 닫아도 평가는 계속됩니다.       │
│  끝나면 목록에 '새 리포트' 배지가 붙습니다.│
│  ────────────────────────────────────  │
│  [대화 전문 보기]  [세션 목록으로]        │
└────────────────────────────────────────┘
```

> **버튼이 없습니다. 이것이 D18의 결론입니다.**
> **평가는 서버가 `completed` 전이의 부작용으로 등록합니다.** `#15 complete`·`#9`의 종료 조건·
> C1 크론의 `paused → completed` **세 경로 모두**가 같은 요청 안에서 등록합니다(계약 6.2절).
> 클라이언트가 할 일은 **기다리는 것뿐**입니다.

**이 절에서 삭제된 것 (QA F1 대응) — 다시 넣지 마세요.**

| 삭제한 것 | 왜 |
|---|---|
| 리포트 진입 시 `useStartEvaluation` **자동 호출** | 정상 경로에서 **항상 409 `invalid_transition`** 입니다. 서버가 이미 등록했습니다 |
| **[평가 시작하기]** 버튼 | 눌러도 409이므로 **언제나 죽은 버튼**입니다. 사용자에게 "내가 눌러야 시작된다"는 거짓 모델을 심습니다 |
| "아직 평가가 시작되지 않음"이라는 절 제목·문구 | 사실이 아닙니다. `completed`는 **등록된 직후이거나 등록 재시도 중**입니다 |

- **`completed`와 `evaluating`은 같은 화면입니다.** 8.2절의 진행 화면을 그대로 씁니다.
  둘을 시각적으로 구분하면, 사용자는 진행이 뒤로 갔다고 느낍니다(계약 15절 #4의 깜빡임 문제).
- 탭을 닫았다가 돌아온 사용자, 7일 자동 종료(D7)로 크론이 끝낸 세션도 **똑같이 이 화면에 도착합니다.**
  클라이언트가 존재하지 않는 그 경로들이 D18의 결정적 근거였습니다.
- `EvaluationJobAccepted`에는 **`axes`도 `overallScore`도 물리적으로 없습니다**(계약 3절).
  이 타입은 이제 **`useRetryEvaluation`(재시도)에서만** 등장하며, 여기서 점수를 읽으려는 코드는 버그입니다.
  타입을 분리해 뒀으므로 컴파일 단계에서 막힙니다.
- `useRetryEvaluation`이 반환하는 `pollAfterMs`는 **재시도 화면에서만** 폴링 간격 초기값이 됩니다.
  정상 경로에는 이 응답 자체가 없으므로, 기본값 3000ms로 시작합니다(8.3절).

### 8.2 `evaluating`·`completed` — 평가 진행 화면 (두 상태 공용)

```
┌────────────────────────────────────────┐
│  ◐ 답변을 평가하고 있습니다               │
│  보통 1~2분 걸립니다. (재시도 2/3)        │  ← evaluation.status === 'running' && attemptCount > 1
│  이 화면을 닫아도 됩니다.                 │
│  ────────────────────────────────────  │
│  [대화 전문 보기]  [세션 목록으로]        │
└────────────────────────────────────────┘
```

- **불확정 `Progress`**를 씁니다. 남은 시간을 %로 속이지 않습니다.
- `attemptCount > 1`이면 "재시도 {n}/3"을 표시합니다. 계약 15절 #4가 지적한
  `evaluating → completed → evaluating` **깜빡임**을 `evaluation.status === 'running'`으로 흡수합니다.
  즉 **세션 status가 `completed`로 잠깐 돌아가도 화면은 "평가 중"을 유지**합니다.

```ts
// 리포트 화면의 표시 분기 — 세션 status 단독으로 판단하지 않는다
const isEvaluating =
  session.status === 'evaluating' ||
  (session.status === 'completed' && evaluation?.status === 'running');
```

- **대기 중에도 [대화 전문 보기]를 엽니다.** 기다리는 동안 할 일이 있어야 이탈이 줄어듭니다(지표 2).
- **이 화면에는 `useRetryEvaluation`을 호출하는 코드가 한 줄도 없습니다**(D18). 재시도 훅이 등장하는 곳은
  `status === 'failed'` 화면 하나뿐입니다(4.7절 표).
- `evaluation`이 아직 `null`일 수 있습니다(등록 직후 행이 보이기 전). **오류로 처리하지 말고** 같은 대기
  화면을 유지합니다 — `useEvaluation`의 반환 타입이 `Evaluation | null`인 이유입니다(3.1절).

### 8.3 전달 경로 — Realtime 1순위, 폴링 폴백

```
1순위: useSessionRealtime(sessionId)
        → interview_sessions 변경 알림 수신 (페이로드는 읽지 않는다 — E1)
        → queryClient.invalidateQueries(['session', id]) + (['evaluation', id])
        → 재조회 결과의 status가 'evaluated'면 리포트 본문으로 전환

2순위: useEvaluation의 refetchInterval
        Realtime이 connected === false이거나 60초 안에 아무 알림도 없으면 활성화
        간격: pollAfterMs(기본 3000) → 실패·미완료마다 ×1.5, 상한 15000
```

- **`useEvaluation`의 재조회가 서버의 게으른 워치독을 겸합니다**(계약 6.5절). 사용자가 이 화면에 있는 동안
  10분 초과 세션이 자동으로 판정됩니다. 그래서 폴링을 완전히 끄지 않고 **저빈도로라도 유지**합니다.
- 알림은 **앱 내 배지만**입니다(D2). 브라우저 푸시·이메일 경로를 만들지 않습니다.
- `status === 'failed'`가 되면 4.7절 실패 화면 + `failureReason`이 **평가 계열일 때만** [평가 재시도]
  (`useRetryEvaluation`. `failed → evaluating`은 이 훅의 **유일한** 용도입니다 — D18).

### 8.4 "같은 이력서로 다시 하기" + 키 연결 CTA — **같은 카드 안** (북극성 지표 3 · D28)

- 리포트 **하단**에 큰 버튼으로 둡니다. **리포트 본문(점수·인용·개선점)을 가리지 않습니다.**
- `useCreateSession({ sourceSessionId: session.id })` → 새 세션이 직군·페르소나·문서를 복제한 채
  `created`로 생성 → `/sessions/new?sessionId={newId}`.
- 복제 후 설정 화면에서 **무엇이 복제되었는지 요약**을 보여 주고, 페르소나만 바꿔 다시 볼 수 있게 합니다.

**키 연결 CTA는 이 카드 안에 들어갑니다 — 별도 카드·배너·모달로 만들지 마세요 (D28 · 6.5.2절)**

```
┌ Card ────────────────────────────────────────────────────┐
│  다시 해 보실 준비가 되셨나요                              │
│  [ 같은 이력서로 다시 하기 ]        ← 1순위, 큰 버튼        │
│  ─────────────────────────────────────────────────────    │
│  다음 면접부터는 본인 API 키로 진행됩니다.                  │
│  연결하시면 입력하신 이력서와 답변이 Google의 서비스 개선에 │
│  쓰이지 않고, 언제든 바로 시작하실 수 있어요.               │
│  [ 키 연결하기 ]  [ 나중에 ]        ← 2순위, 같은 카드 안   │
└──────────────────────────────────────────────────────────┘
```

| 규칙 | 내용 |
|---|---|
| **경쟁 금지** | 두 CTA를 **다른 카드**에 두거나 키 CTA를 위에 올리면 **북극성 지표가 깎입니다.** "다시 하기"가 1순위, 키 CTA는 같은 카드 안 2순위입니다 |
| 노출 조건 | `capacity.keyStatus !== 'connected'` **그리고** `session.fundingSource === 'trial_shared'`. **키를 이미 연결한 사용자에게는 렌더되지 않습니다** |
| 위치 | 리포트를 **다 읽은 뒤**의 하단. 상단 고정 배너·인터스티셜 모달을 만들지 않습니다 |
| 닫기 | [나중에]로 닫을 수 있고, 닫으면 이 세션에서 다시 뜨지 않습니다(`localStorage`에 세션 id 단위로 기록 — **키가 아니라 "닫았다"는 사실만**) |
| 닫은 뒤 | 대시보드에 **조용한 안내**가 남습니다(4.3절). 리포트에서 닫았다고 경로가 사라지지 않습니다 |
| 문구 | 제약이 아니라 **업그레이드**로 씁니다. "키가 없으면 못 합니다"가 아니라 "연결하면 이렇게 좋아집니다" |
| 금칙어 | 4.14.4절 목록이 그대로 적용됩니다. **체험 잔여 카운터를 여기에 절대 넣지 마세요** — 가장 넣고 싶어지는 자리입니다 |
| 시점 | **면접 도중에는 절대 요구하지 않습니다.** 진행 중인 면접을 인질로 삼는 구조가 됩니다(6.5.2절) |

---

## 9. 마이크 권한 요청 화면 (D16)

`ready` 화면의 3단계(`requesting_permission`)와 `/sessions/new`의 모달리티 선택 지점 **두 곳**에 노출합니다.

```
┌ 음성 면접을 시작하기 전에 ─────────────────────────────────┐
│  · 목소리는 저장되지 않습니다. 기록으로 남는 것은            │
│    받아쓴 텍스트뿐입니다.                                   │
│  · 마이크는 면접이 끝나거나 일시정지하면 즉시 꺼집니다.       │
│  · 음성 인식은 브라우저가 제공하는 기능입니다.               │
│    브라우저에 따라, 인식을 위해 음성이 브라우저 제조사의      │
│    서버로 전송될 수 있습니다.                               │
│  · 받아쓰기가 틀릴 수 있습니다. 직전 답변은 직접 고칠 수      │
│    있습니다.                                               │
│                                                            │
│        [마이크 사용 허용]      [텍스트로 진행]              │
└───────────────────────────────────────────────────────────┘
```

- **세 번째 항목이 D16의 고지입니다. 빠지면 안 됩니다**(U8). 별도 동의 체크박스는 두지 않습니다 —
  D16이 "안내 문구로 고지, 별도 동의 절차 없음"으로 확정했습니다.
- 이 문구는 **접거나 툴팁 뒤에 숨기지 않습니다.** 권한 프롬프트가 뜨기 **전에** 화면에 그대로 보입니다.
- **[텍스트로 진행]이 [마이크 사용 허용]과 같은 크기**입니다. 텍스트는 열화판이 아니라 1급 경로입니다.
- 권한 거부(F3): `Alert` — "마이크 권한이 거부되었습니다" + 브라우저별 재허용 안내(Chrome/Safari/Firefox
  주소창 아이콘 위치) + 자동으로 텍스트 모드 전환. **세션을 막지 않습니다.**
- `requesting_permission` 동안 버튼을 `disabled` + "브라우저의 권한 창에서 허용을 눌러 주세요".

---

## 10. 취소 UI와 삭제 UI — **다른 동작입니다** (D19)

**이 절의 전제: 취소 ≠ 삭제.** 초안은 "폐기"를 실제 삭제에 연결했고 "`created → canceled`는 실제 삭제입니다"라고
적었습니다 — **틀렸습니다.** `canceled`는 **행이 남는 종료 상태**입니다.

| | **취소** (10.1절) | **삭제** (10.2~10.4절) |
|---|---|---|
| 훅 | `useCancelSession` (#33) | `useDeleteSession` / `useDeleteDocument` / `useDeleteAccount` |
| UI 문구 | **"이 면접 그만두기"** | **"이 면접 삭제"** / "이 문서 삭제" / "계정 삭제" |
| 대화 기록 | **남습니다** | 사라집니다 |
| 다이얼로그 | `ConfirmCancelDialog` — 파괴적 스타일 **없음** | `ConfirmDeleteDialog` — `variant="destructive"` |
| "되돌릴 수 없습니다" | **쓰지 않습니다** (사실이 아닙니다 — 기록이 남습니다) | **본문 첫 문장에 씁니다** |
| 되돌리려면 | 새 세션 생성(`sourceSessionId`로 설정 승계) | 불가능 |

- **면접 도중의 "그만두기"는 언제나 취소입니다.** 이 문구를 삭제에 연결하면 사용자가 확인 절차 없이 대화
  기록을 영구히 잃습니다 — D19가 명시적으로 막으려 한 시나리오입니다.
- 두 동작을 **같은 다이얼로그 컴포넌트로 묶지 않습니다**(5절 재사용 규칙 4).

### 10.1 세션 취소 — "이 면접 그만두기" (`useCancelSession`, #33)

노출 지점 **4곳**: `/sessions/new`(설정) · `/sessions/{id}/ready` · `/sessions/{id}/interview`(헤더·재개 패널) ·
`/sessions` 행 메뉴. **`/sessions/{id}/report`에서도 `status === 'failed'`이면 노출합니다**(4.7절).

> **이 면접을 그만둡니다.**
> 지금까지의 대화 기록과 답변은 **그대로 남습니다.** 언제든 세션 이력에서 다시 볼 수 있습니다.
> 다만 이어서 진행하거나 평가받을 수는 없습니다.
> 남는 것: 대화 전문, 이력서·JD 문서
> 나중에 다시 하려면: 같은 설정으로 **새 면접**을 만들 수 있습니다

| 항목 | 규칙 |
|---|---|
| 컴포넌트 | `ConfirmCancelDialog`(shadcn `AlertDialog`). **`variant="destructive"`를 쓰지 않습니다** |
| 버튼 | 확인 = `variant="default"` "그만두기" / 취소 = "계속 진행" (기본 포커스) |
| 확인 입력 | **요구하지 않습니다.** 파괴적이지 않은 동작에 마찰을 더할 이유가 없습니다 |
| 노출 조건 | `status`가 `created` `configuring` `ready` `in_progress` `paused` `failed` `abandoned` **7개일 때만** |
| `completed` 이후 | **버튼을 렌더하지 않습니다.** 평가가 시작된 세션은 취소 대상이 아니라 삭제 대상입니다(409) |
| 진행 중일 때 | 6.6절의 정리 순서(TTS 정지 → SSE abort → 오디오 버퍼 폐기 → 호출) |
| 성공 후 | `/sessions?includeCanceled=true`로 이동 + **토스트** "면접을 그만뒀습니다. 기록은 이력에 남아 있습니다" |
| 낙관적 업데이트 | **하지 않습니다.** 취소된 세션은 사라지는 것이 아니라 토글에 따라 다시 나타납니다 |

- **토스트에 "삭제"라는 단어를 쓰지 않습니다.** 이 문구가 사용자가 무슨 일이 일어났는지 배우는 유일한 지점입니다.
- `abandoned`(7일 경과로 시스템이 정리한 세션)에서도 취소할 수 있습니다. 사용자가 이력을 정리하는 비파괴 수단입니다.

### 10.2 세션 삭제 — "이 면접 삭제" (`useDeleteSession`, #23)

**세 삭제 경로 공통 규칙**

- **"되돌릴 수 없습니다"를 제목이 아니라 본문 첫 문장**에 둡니다.
- 파괴 버튼은 `variant="destructive"`이고 **오른쪽**, 취소가 왼쪽·기본 포커스입니다.
- **잃는 것 / 남는 것을 목록으로** 보여 줍니다. "정말 삭제할까요?"만으로는 사용자가 무엇을 잃는지 모릅니다.

> **이 면접을 완전히 삭제합니다. 되돌릴 수 없습니다.**
> 잃는 것: 대화 전문, 평가 리포트, 점수
> 남는 것: 이 면접에 쓴 이력서와 JD 문서(보관함에 그대로 있습니다)

- 노출 지점은 **`/sessions` 행 메뉴 하나뿐**입니다. **면접 진행 화면에는 삭제 버튼을 두지 않습니다** —
  면접 도중 사용자가 원하는 것은 그만두기(10.1절)이지 기록 파기가 아닙니다.
- 확인 입력은 요구하지 않습니다(세션은 여러 건 중 하나이고, `AlertDialog` 한 겹으로 충분합니다).
- `useDeleteSession` → 목록에서 낙관적 제거. 실패하면 되돌리고 `Alert`.
- 삭제는 **모든 상태에서** 가능합니다. 취소된(`canceled`) 세션도 여기서 지웁니다.

### 10.3 문서 삭제 (`/documents`) — **D6으로 문구가, D21로 시점이 바뀌었습니다**

**건수는 이제 `useDocument`(#34)로 누르기 전에 압니다 (D21 — §2 미결 해소).**

```ts
// 삭제 메뉴를 열 때 refetch. 목록 렌더 시점에 미리 부르지 않는다.
const { data: doc } = useDocument(documentId);   // DocumentDetail
// doc.linkedSessionCount        이 문서를 쓴 세션 수 (canceled·abandoned 포함)
// doc.configuringSessionCount   그중 created·configuring — 이력서를 다시 골라야 하는 세션
```

> **이 문서의 원본 파일을 삭제합니다. 되돌릴 수 없습니다.**
> **남는 것: 이 문서를 사용한 과거 면접 {linkedSessionCount}개의 리포트·대화 전문·질문 근거는 그대로 남습니다.**
> 잃는 것: 원본 파일 열람 / 텍스트 재추출 / "같은 이력서로 다시 하기" 묶음
> **면접 {linkedSessionCount}개에서 이 문서가 출처로 표시되지 않게 됩니다.**
> **아직 설정 중인 면접 {configuringSessionCount}개에서는 이력서를 다시 골라야 합니다.**

**문구 규칙 — 두 숫자는 서로 다른 것을 말합니다.**

| 값 | 무엇을 세나 | 문구의 성격 |
|---|---|---|
| `linkedSessionCount` | 이 문서를 참조한 **모든** 세션(취소·중단 포함) | **정보.** "출처 표시가 사라진다" — 실질 피해는 없습니다 |
| `configuringSessionCount` | 그중 `created`·`configuring` | **경고.** 아직 스냅샷이 없어 사용자가 문서를 다시 골라야 합니다 |

- **"과거 리포트가 손상된다"는 취지의 경고를 쓰지 않습니다. 거짓입니다**(D6 스냅샷 —
  `04_data_layer.md` 9.2절, 계약 12.4절). 지워지는 것은 **출처 표시**이지 리포트가 아닙니다.
- **두 숫자를 합쳐 하나로 보여주지 않습니다.** 합치면 "면접 12개가 영향받습니다"가 되어, 실제로는
  멀쩡한 11개까지 위험해 보입니다. 정보와 경고를 시각적으로도 분리합니다(경고 줄만 `text-destructive`).
- `linkedSessionCount === 0`이면 관련 두 줄을 **통째로 감춥니다.** "면접 0개에서 사라집니다"는 소음입니다.
  마찬가지로 `configuringSessionCount === 0`이면 경고 줄을 감춥니다.
- `configuringSessionCount > 0`일 때 **파괴 버튼 문구를 "그래도 삭제"로 바꿉니다.** 실질 피해가 있는
  경우에만 마찰을 더합니다.
- `useDocument`가 아직 로딩 중이면 **다이얼로그의 삭제 버튼을 `disabled`로 둡니다.** 영향 범위를 모른 채
  누르게 하지 않습니다 — 그것이 D21이 고친 문제입니다. 조회가 실패하면 숫자 줄을 감추고
  "영향 범위를 확인하지 못했습니다"를 표시하되, **숫자를 추측해 채우지 않습니다.**
- 삭제 후 `DELETE` 응답의 `affectedSessionCount` / `configuringSessionCount`는 #34의 값과 **같은 수**입니다
  (계약 12.4절). 사후 토스트는 "문서를 삭제했습니다"로 짧게 끝내고 건수를 다시 읊지 않습니다 —
  사용자는 방금 다이얼로그에서 봤습니다.

### 10.4 계정 삭제 (`/settings/account`)

> **계정과 모든 데이터를 삭제합니다. 되돌릴 수 없고, 복구 요청도 받을 수 없습니다.**
> 삭제되는 것: 면접 {sessionCount}건, 문서 {documentCount}건({storageBytes}), 모든 리포트와 대화 전문
> 남는 것: 없습니다.

- **2단계 확인**: ① 위 내용 확인 ② 비밀번호 재입력(`useDeleteAccount({ password })`).
  숫자는 `useAccount().stats`에서 가져오므로 지어내지 않습니다.
- 진행 중 표시: 1~5초가 걸리므로 `Button`을 `disabled` + "삭제하고 있습니다".
  이 요청은 **취소할 수 없다**고 명시합니다.
- 성공 시 `useSignOut()` 후 `/`로 이동하고 "계정이 삭제되었습니다" 토스트.
- 비밀번호 불일치(401)는 다이얼로그 안 인라인 오류입니다. 다이얼로그를 닫지 않습니다.

---

## 11. 접근성 — 텍스트만으로 완전한 면접

`03_voice_pipeline.md` 10.4절의 7개 보장이 **구현 검증 대상**입니다(U6).

| # | 보장 | UI에서의 구현 |
|---|---|---|
| 1 | **기능 동등** | 텍스트 모드에서 못 쓰는 면접 기능이 하나도 없습니다. 꼬리질문·압박·종료·정정·평가·리포트 전부 동일. `AnswerInputText`가 `AnswerInputVoice`와 같은 액션 집합을 갖습니다 |
| 2 | **평가 동등** | UI가 `modality`로 어떤 표시 차등도 두지 않습니다. "텍스트로 봐서 불리하다"는 인상을 주는 문구를 쓰지 않습니다 |
| 3 | **시작 경로 동등** | `/sessions/new`에서 `text`를 처음부터 고를 수 있고, 라디오 두 항목의 시각 비중이 같습니다 |
| 4 | **상태 표시 동등** | `thinking`·`speaking`을 텍스트 모드에서도 표시합니다 |
| 5 | **스크린리더** | 4상태 변화와 새 발화를 `LiveRegion`(`aria-live="polite"`)으로 알립니다. **색·애니메이션만으로 상태를 표현하지 않고 항상 한국어 텍스트 레이블을 동반**합니다 |
| 6 | **키보드 전용** | "답변 완료" "일시정지" "여기서 마치기" "텍스트로 전환" "정정" "답변 시작"이 전부 Tab으로 도달 가능. 포커스 링을 `ring-ring`으로 유지하고 `outline-none`만 남기는 코드를 금지 |
| 7 | **청각 접근성** | 면접관 발화는 **항상 화면에 텍스트로 먼저** 나타납니다. TTS는 부가물입니다 |

**추가 규칙**

- 루트 레이아웃 최상단에 **Skip to content** 링크(`sr-only focus:not-sr-only`).
- 다이얼로그는 shadcn `Dialog`/`AlertDialog`(Radix)를 씁니다 — 포커스 트랩·`Esc`·`aria-modal`이 내장입니다.
  직접 만든 오버레이를 쓰지 않는 이유가 이것입니다.
- `aria-live` 사용 지점은 **3곳뿐**입니다: ① 4상태 변경 ② 완성된 발화 1건 ③ 오류 배너.
  스트리밍 텍스트 컨테이너 자체는 `aria-live="off"`입니다(글자마다 읽히면 사용할 수 없습니다).
- 모든 아이콘 전용 버튼에 `aria-label`(한국어). `VuMeter`는 `aria-hidden="true"`이고
  상태 텍스트가 실제 정보를 담습니다.
- 대비: 본문 4.5:1, 큰 글자 3:1 이상. 상태 배지는 배경색 + 텍스트 + 아이콘 **3중**으로 구분합니다.
- 한국어 줄바꿈: `word-break: keep-all`을 본문 기본값으로 둡니다(단어 중간 끊김 방지).
  버튼 라벨은 영어 기준으로 크기를 잡지 않고 `min-w`와 `px`로 여유를 둡니다.

**D27~D30이 추가한 접근성 요구 4가지**

1. **키 입력(`Input type="password"`)에 `Label`을 연결**하고, 오류는 `aria-describedby`로 필드에 붙입니다.
   `Alert`만 띄우고 필드와 연결하지 않으면 스크린리더 사용자가 어느 필드의 문제인지 알 수 없습니다.
2. **동의 다이얼로그(4.13절)는 열릴 때 포커스를 본문 첫 문장에 둡니다.** 버튼에 두면 읽기 전에 누르게 됩니다.
   `Checkbox`와 그 설명은 같은 `Label`로 묶어 클릭 영역을 넓힙니다.
3. **안내 3종(4.14절)은 `role="alert"`** 로 두어 화면 갱신 없이도 읽히게 합니다. 단, 대시보드의 상시
   `Alert`(4.3절)는 `role="status"`입니다 — 방금 일어난 사건이 아니라 현재 상태이기 때문입니다.
4. **키 상태를 색·`Badge`로만 구분하지 않습니다.** `none`/`connected`/`invalid` 셋 다 **한국어 텍스트**가
   함께 있어야 합니다(4.11·4.12절 표). 마스킹 `****{keyLast4}`는 시각 기호가 아니라 텍스트로 읽힙니다.

---

## 12. 테마 토큰 사용 방침

- **하드코딩 색 금지.** `#hex`, `rgb()`, `bg-[#...]`, `text-blue-500` 같은 Tailwind 팔레트 직접 사용도
  금지합니다. 쓰는 것은 shadcn 토큰뿐입니다:
  `background` `foreground` `card` `popover` `primary` `secondary` `muted` `accent` `destructive`
  `border` `input` `ring` `chart-1..5`.
- **다크 모드는 `:root` / `.dark` 두 벌 정의**로 처리합니다. 컴포넌트에 `dark:` 분기를 흩뿌리지 않습니다.
- 이 제품에 필요한 **의미 토큰 4개를 `globals.css`에 추가**합니다(라이트·다크 양쪽). 이것은 새 라이브러리가
  아니라 shadcn 테마 확장이며, 규약 안에 있습니다.

```css
/* 음성 4상태 — 색은 보조 신호이고, 판별의 주 수단은 언제나 텍스트 레이블이다 */
--state-listening: …;      --state-listening-foreground: …;
--state-transcribing: …;   --state-transcribing-foreground: …;
--state-thinking: …;       --state-thinking-foreground: …;
--state-speaking: …;       --state-speaking-foreground: …;
```

- 점수 표현에 **빨강/초록 신호등을 쓰지 않습니다.** 색맹 접근성 문제이기도 하지만, 더 큰 이유는
  1~5 척도가 합격/불합격이 아니기 때문입니다(루브릭 2절). `primary` 농도 차이로 표현하고 숫자를 병기합니다.
- `destructive`는 **삭제와 복구 불가 오류에만** 씁니다. 낮은 점수에 쓰지 않습니다.
- 폰트: 시스템 한국어 폰트 스택 + `font-feature-settings` 기본값. 웹폰트를 새로 도입하지 않습니다
  (한국어 웹폰트는 용량이 크고 무료 티어 대역폭을 씁니다).

---

## 13. shadcn에 없어 직접 조립하는 컴포넌트

**전부 Radix 프리미티브 + Tailwind + `cn()`으로 만들고 `components/ui/` 또는 도메인 폴더 규약을 따릅니다.
새 UI 라이브러리를 설치하지 않습니다.**

| 컴포넌트 | 왜 필요한가 | 무엇으로 만드나 |
|---|---|---|
| `VuMeter` | 마이크 입력 레벨 (`listening`) | `div` 막대 + `transform: scaleY()` + `requestAnimationFrame`. Radix 불필요. `aria-hidden` |
| `SilenceCountdownRing` | 침묵 카운트다운 예고 (U4) | 인라인 `<svg>` 원 + `stroke-dasharray` 애니메이션. `role="timer"` |
| `StreamingCursor` | 스트리밍 진행 표시 | `span` + `animate-pulse`(Tailwind 내장) |
| `FileDropzone` | 문서 드래그 앤 드롭 | `<input type="file">` + `onDragOver`/`onDrop` + Tailwind. **드롭존 라이브러리 금지** |
| `LiveRegion` | 스크린리더 공지 | `div` + `aria-live` + `sr-only` |
| `QuoteHighlight` | 인용 강조 | `<mark>` + `bg-accent`. `quoteText` 문자열 매칭 |
| `AxisScoreMeter` | 축 점수 시각화 | shadcn `Progress`를 **그대로 사용**합니다(별도 조립 불필요) |
| `EmptyState` / `ErrorState` / `NotFoundState` | 상태 화면 | shadcn `Card` + `Button` 조합. 새 프리미티브 없음 |
| `ConfirmDeleteDialog` | 삭제 확인 | shadcn `AlertDialog` + `Input` 조합 |
| `ConfirmCancelDialog` | **취소** 확인 (D19 — 삭제와 별개) | shadcn `AlertDialog` 조합. **`variant="destructive"`를 쓰지 않는 것이 이 컴포넌트의 존재 이유**입니다(10.1절) |

**`npx shadcn@latest add`로 가져오는 것** (설치 대상 목록):
`button card input textarea label form select radio-group checkbox switch toggle
 dialog alert-dialog alert badge tabs accordion separator skeleton progress
 tooltip popover dropdown-menu scroll-area breadcrumb sonner`

**토스트는 `sonner`로 확정 (D22 — 미결 해소).**

`npx shadcn@latest add sonner`로 들어오는 것은 **shadcn 컴포넌트 그 자체**입니다. shadcn/ui가 자체 `toast`를
폐기하고 공식 채택한 컴포넌트이므로 "다른 UI 라이브러리 도입 금지" 제약에 걸리지 않습니다.
Radix `Toast`를 직접 조립하는 쪽은 접근성 처리를 스스로 떠안게 되어 이득이 없습니다.

- 루트 `layout.tsx`에 `<Toaster />` **1개**를 둡니다. 화면마다 두지 않습니다.
- 호출은 `import { toast } from 'sonner'` 한 경로로만. 자체 래퍼를 만들지 않습니다.
- **이 예외는 `sonner` 하나뿐입니다.** 차트·드롭존·아이콘팩·애니메이션·날짜 피커 라이브러리는 여전히
  금지이며, 위 표의 **직접 조립 6종 결정은 그대로 유지**됩니다(`VuMeter` `SilenceCountdownRing`
  `StreamingCursor` `FileDropzone` `LiveRegion` `QuoteHighlight`).
- QA 판정 기준: `package.json`의 UI 의존성은 `sonner` · Radix 프리미티브 · `lucide-react` ·
  `tailwindcss`(+ `class-variance-authority` `clsx` `tailwind-merge`) · `react-hook-form` `zod` ·
  `@tanstack/react-query`뿐이어야 합니다. **`sonner` 외에 새 UI 패키지가 보이면 위반입니다.**

**절대 도입하지 않는 것**: 차트 라이브러리(recharts 포함 — MVP에 차트가 없습니다),
드롭존, 아이콘 팩, 애니메이션 라이브러리, 날짜 피커(입력할 날짜가 없습니다).

---

## 14. API 추가 요청 (`vercel-platform-engineer`)

**프론트에서 없는 데이터를 지어내지 않습니다.** 아래는 화면 요구사항이 계약에 대응물을 갖지 못했던 지점이며, **§1·§2는 계약 2차 갱신(D20·D21)으로 해소됐습니다.**

| # | 무엇이 없나 | 왜 필요한가 | 제안 | 없을 때의 잠정 동작 |
|---|---|---|---|---|
| ~~1~~ | ~~기존 피드백·이의 제기 조회 경로~~ | — | **✅ 해소(D20).** `Evaluation`에 `myFeedback: ReportFeedback \| null` / `myDisputes: ScoreDispute[]`가 추가됐습니다(계약 12.3절). 별도 조회 훅을 만들지 않습니다 → 7.5·7.6절 | — |
| ~~2~~ | ~~문서 삭제 전 영향 건수~~ | — | **✅ 해소(D21).** `GET /api/documents/[documentId]`(#34) + `useDocument`가 신설되어 `linkedSessionCount` / `configuringSessionCount`를 **누르기 전에** 읽습니다 → 10.3절 | — |
| 3 | 리포트의 **꼬리질문 요약** 파생 필드 | 루브릭 5절이 리포트 `[MVP]` 구성으로 요구 | (선택) `Evaluation`에 `followUpSummary: { mainQuestionId, questionText, maxDepth }[]` | **`useTranscript`로 계산 가능**하므로 차단 요인이 아닙니다. 리포트 화면에서 왕복이 1회 늘어납니다 |
| 4 | **프로필 수정** (`PATCH /api/account`) | `displayName` / `defaultJobRole`을 사용자가 바꿀 수 없습니다 | MVP 범위 밖이면 그대로 두어도 됩니다 | 4.11절대로 **읽기 전용 표시**. 편집 UI를 만들지 않습니다 |

**1·2번은 계약 2차 갱신에서, 5번은 계약 3차 갱신에서 해소됐습니다.** 3·4번은 없어도 화면이 성립하므로
**남은 요청은 없습니다.** 3번(꼬리질문 요약)은 `useTranscript`로 파생 계산하고(7.4절),
4번(프로필 수정)은 읽기 전용으로 둡니다(4.11절).

| ~~5~~ | ~~D30(체험 예약 1건 제한)의 오류 `code`와 `details`~~ | — | **✅ 해소(계약 3차 갱신).** 13절에 **409 `trial_reservation_exists`** 가 추가되고 `details.existingSessionId`가 **항상 채워진다고** 확정됐습니다(`05_api_contract.md` **13절 오류 표 · 13절 응답 예시 · 4.7.6절**). 요청한 (a)·(b) 둘 다 그대로 반영됐습니다 | **잠정 동작 폐기.** 소거법과 `activeSessions` 폴백을 4.4절에서 **삭제**하고 `error.code` 직접 분기로 바꿨습니다 |

**신설 엔드포인트 3개를 받았습니다 — 회신 완료.** `#33 cancel`(D19) · `#34 GET 문서 단건`(D21) ·
`#35 abandon-preparation`(F8). 대응 훅 `useCancelSession` · `useDocument` · `useAbandonPreparation`을
3절 표에 넣었고, 응답 봉투와 **언랩 여부를 계약 4절 표와 다시 대조했습니다**(전부 `{ 리소스 }` 단일 키 → **언랩 예**).

**신설 엔드포인트 6개(#36~#41)도 회신 완료 — 2026-09-10, D27·D28·D29.**
대응 훅 `useCapacity` · `useApiKeyStatus` · `useConnectApiKey` · `useDisconnectApiKey` · `useVerifyApiKey` ·
`useGrantTrialConsent`를 3.1·3.2절에 등록했습니다. **6개 전부 단일 키 봉투(`{ capacity }` / `{ apiKey }` /
`{ consent }`)이므로 언랩 = 예**이며, 특히 **#39 `DELETE`가 `{ ok: true }`가 아니라 `{ apiKey }`** 라는
점을 3.2절 경고로 못박았습니다. 훅 총계는 **37개 → 43개**입니다.

---

## 15. 남은 결정

**이 절에 있던 4건이 확정 결정(현재 30건)으로 모두 해소됐습니다. 남은 `[결정 필요]`는 없습니다.**

| 초안의 미결 | 결과 |
|---|---|
| 평가 시작 주체 (`completed`에서 누가 시작하나) | **✅ D18로 해소.** 서버가 `completed` 전이의 부작용으로 등록합니다. 자동 호출·[평가 시작하기] 버튼을 8.1절에서 삭제했고, 훅을 `useRetryEvaluation`으로 개명했습니다 |
| 토스트를 `sonner`로 쓸지 Radix Toast로 조립할지 | **✅ D22로 해소.** `sonner`를 씁니다. shadcn 공식 채택 컴포넌트이며, **이 예외는 하나뿐**입니다(13절) |
| `canceled` 세션을 `/sessions`에 보여줄지 | **✅ D19로 해소.** 행이 남는 종료 상태이며, 기본 숨김 + **"취소된 세션 보기" 토글**(`includeCanceled`)로 노출합니다(4.9절) |
| `/login`에 비밀번호 재설정 링크를 노출할지 | **열려 있습니다** — 아래 |

```
[결정 완료 D23] `/login`에 비밀번호 재설정 링크를 정상 노출한다.
  근거: 재설정은 사용자가 드물게 명시적으로 요청할 때만 발송되어 무료 SMTP 한도와 충돌하지 않고,
        막으면 계정 복구의 유일한 경로가 사라진다.
  D2·D8로 이 서비스에는 이메일 발송 경로가 하나도 없습니다. 링크를 두면 눌러도 메일이 오지 않고,
  감추면 사용자는 복구 수단이 없다는 사실조차 모릅니다.
  이 문서의 잠정값: **감추고, 로그인 실패 안내에 "확인 메일을 보내지 않으므로 계정 복구 경로가 없습니다"를
  명시.** 회원가입 화면의 이메일 재확인 문구(D8)와 짝을 이룹니다.
  영향: 이 문서 4.2절, 04_data_layer.md 6.1절
```

**2026-09-10 D27~D30은 새로운 `[결정 필요]`를 만들지 않았습니다.** 넷 다 확정 결정이며 이 문서는 따르기만 합니다.
**D30의 오류 `code` 대기 항목(14절 §5 / 16절 #10)도 계약 3차 갱신으로 해소됐습니다** — `trial_reservation_exists`와
`details.existingSessionId`가 확정되어 이 문서에 반영을 마쳤습니다.

**남은 1건은 이 문서 단독으로 정할 수 없습니다** — 인증 흐름(`04_data_layer.md` 6.1절)과 짝을 이루므로
`supabase-engineer`·리더의 확정이 필요합니다. 잠정값대로 구현해도 화면은 성립합니다.

---

## 16. 다른 문서와의 불일치 (**고치지 않고 나열** — 리더 조정 대상)

| # | 지점 | 내용 | 제안 |
|---|---|---|---|
| ~~1~~ | ~~기존 피드백·이의 조회 경로 없음~~ | **✅ 해소(D20).** `Evaluation.myFeedback` / `myDisputes`로 `GET .../evaluation` 응답에 실려 옵니다 | 7.5·7.6절에 반영 완료 |
| ~~2~~ | ~~문서 삭제 전 영향 건수를 알 수 없음~~ | **✅ 해소(D21).** `#34` + `useDocument`가 `linkedSessionCount` / `configuringSessionCount`를 사전 제공 | 10.3절에 반영 완료 |
| ~~3~~ | ~~평가 시작 주체가 서버인지 클라이언트인지~~ | **✅ 해소(D18).** 서버가 `completed` 전이의 부작용으로 등록합니다 | 8.1절에서 자동 호출 삭제, 훅을 `useRetryEvaluation`으로 개명 |
| ~~4~~ | ~~`canceled`가 "실제 삭제"인지 남는 상태인지~~ | **✅ 해소(D19).** 행이 남는 종료 상태입니다. `01_state_machine.md` 2절의 "실제 삭제" 서술은 `product-architect`가 정정할 대상입니다 | 4.9절 토글 + 10.1절 취소 UI로 반영 완료 |
| 5 | `01_state_machine.md` 2절 104행 (하트비트 90초 → `paused(connection_lost)`) | `05_api_contract.md` 15절 #2가 이미 지적했듯 서버가 90초 단위로 판정할 수단이 없습니다 | UI는 이 값을 **재개 패널 문구의 기준으로만** 씁니다. `sendBeacon`으로 #13을 최선 노력 호출합니다. 계약 16절의 `[결정 필요]`가 확정되면 따릅니다 |
| 6 | `03_voice_pipeline.md` 11.3절 (보조 4상태는 "UI 소유, 이름 조정 시 알릴 것") | 조정 요청 **없음**. `idle` `requesting_permission` `error` `text_fallback`을 그대로 채택했고, `error`를 4상태와 배타적으로 만들지 않도록 **필드를 분리**했습니다(6.1절) | 회신 완료. `03_voice_pipeline.md` 11.3절의 "별도 합의 필요"를 "합의됨"으로 갱신해 주세요 |
| 7 | `01_rubric.md` 5절 (리포트 `[MVP]` 구성에 "꼬리질문 요약") vs `05_api_contract.md` 12절 `Evaluation` | `Evaluation`에 대응 필드가 없습니다 | `useTranscript`로 파생 계산합니다(7.4절). 차단 요인 아님. 14절 §3에 선택 요청으로 기록 |
| **8** ✅신규 | `01_product_spec.md` 7절 `/sessions` 화면 요구 vs 이 문서 4.9절 | 제품 스펙의 `/sessions` 요구에 **"취소된 세션 보기" 토글이 없습니다**(QA F12 — `canceled`·"취소"라는 단어가 `01_product_spec.md`·`01_domain_model.md` 어디에도 없음). UI는 D19에 따라 토글을 만듭니다 | `product-architect`가 스펙에 토글 요구를 추가해 주세요. **UI 쪽은 계약 4.3절(`includeCanceled`)에 이미 맞춰 두었으므로 차단 요인은 아닙니다** |
| **9** ✅신규 | `01_state_machine.md` 2절 전이 표 95행 (`configuring → failed` 트리거) vs `05_api_contract.md` #35 | 전이 표의 트리거 문구가 "사용자가 재시도 포기"라고만 적혀 있고 **진입점이 #35라는 사실이 없습니다.** UI는 추출 실패 배너 안의 [이 세션 준비 포기]를 그 진입점으로 구현합니다(4.4절) | `product-architect`가 트리거 문구에 진입점을 반영해 주세요(문구 변경일 뿐 전이는 그대로). 계약 4.4절이 이미 같은 요청을 냈습니다 |

| ~~10~~ | ~~`00_input/decisions.md` **D30** vs `05_api_contract.md` **13절 오류 표**~~ | **✅ 해소(계약 3차 갱신).** 13절에 **409 `trial_reservation_exists`** 가 추가되고 `details.existingSessionId`가 **항상 채워진다**고 확정됐습니다(`05_api_contract.md` **13절 오류 표 · 13절 응답 예시 · 4.7.6절**) | **4.4절에 반영 완료.** 소거법과 `useDashboard`의 `activeSessions` 폴백을 **삭제**하고 `error.code` 직접 분기로 바꿨으며, `[이어서 하기]`의 목적지를 `details.existingSessionId`로 고정하고 `[이전 면접 취소하기]`(#33)를 함께 두었습니다 |
| ~~11~~ | ~~`02_ai_architecture.md` **13.6.3절 금칙어 목록** vs `01_product_spec.md` **6.5.6절**~~ | **✅ 해소.** `02_ai_architecture.md` 13.6.3절이 금칙어 목록에 **"API 키"·"한도" 예외를 명문화**했습니다. 세 문서가 더 이상 충돌하지 않습니다 | **UI 방침 변경 없음.** "한도"는 여전히 **4.14.3절 한 곳에서만** 쓰고 4.14.1·4.14.2에는 쓰지 않습니다(4.14.4절). QA는 이제 이 두 단어의 grep 히트를 **오탐이 아니라 명문화된 예외**로 처리하면 됩니다 |
| **12** ★신규 | `02_ai_architecture.md` **13.6.3절 ①②의 문구** vs `01_product_spec.md` **6.5.5절** | 13.6.3절 ①②의 문안은 **D27 시점**의 것이라 키 연결 CTA가 없고 "{availableAtIso} 이후에 다시 시작할 수 있어요"가 본문에 고정돼 있습니다. D28 이후 `availableAtIso`는 **체험 소진 시 `null`** 이므로 그대로 쓰면 빈 문장이 남습니다 | 13.7.3절이 이미 "1순위 버튼을 키 연결하기로 바꾸라"고 지시했으므로 **UI는 6.5.5절 + 13.7.3절 문안을 채택**했습니다(4.14.1절). 13.6.3절 ①②의 본문도 같은 문안으로 갱신되면 세 문서가 한 문장을 말하게 됩니다 |

---

## 17. 다른 팀에 전달할 사항

| 대상 | 내용 |
|---|---|
| `vercel-platform-engineer` | **회신 완료 — 추가 요청 없음.** 14절 §1·§2가 계약 2차 갱신(D20·D21)으로 해소됐고, 신설 3개(`#33` `#34` `#35`)에 대응 훅 `useCancelSession` · `useDocument` · `useAbandonPreparation`을 3절에 등록했습니다. **언랩 여부를 계약 4절 표와 전수 대조했고 37개 전부 일치합니다.** 남은 §3·§4는 없어도 화면이 성립하므로 MVP 범위 밖으로 둡니다. 한 가지만 확인 부탁드립니다 — `#34`를 **삭제 다이얼로그를 열 때만** 호출하도록 `enabled: false`로 두었습니다(목록 렌더 시 문서 수만큼 집계 쿼리가 나가는 것을 피하려는 것). 이 사용 패턴이 맞다면 그대로 갑니다 |
| `voice-pipeline-engineer` | U1~U10 **전부 수용**했습니다. 보조 4상태는 이름 변경 없이 채택했고(6.1절), `error`는 4상태와 **다른 필드**에 두어 배타를 구조적으로 막았습니다. `src/lib/voice/*`가 노출해야 할 훅 인터페이스는 3.4절 `useVoiceSession`이며, 반환 타입에 `Blob`·`ArrayBuffer`·`AudioBuffer`가 등장하지 않는 S3 계약을 UI 쪽에서도 그대로 지킵니다 |
| `product-architect` | **요청 2건**(16절 #8·#9). (1) `01_product_spec.md` `/sessions` 화면 요구에 **"취소된 세션 보기" 토글**을 넣어 주세요(QA F12). D19로 `canceled`는 행이 남는 종료 상태가 됐는데 제품 스펙에는 "취소"라는 단어 자체가 없습니다. (2) `01_state_machine.md` 전이 표 95행(`configuring → failed`)의 트리거 문구에 진입점이 **#35 `abandon-preparation`** 이라는 사실을 반영해 주세요. 그리고 같은 문서 2절의 `* → canceled` 부작용 "실제 삭제" 서술은 **D19로 폐기된 내용**이라 정정 대상입니다 |
| `supabase-engineer` | **스키마 변경 요청 없음.** 다만 4.9절의 "취소된 세션 보기" 토글이 `includeCanceled=true`로 `canceled` 행을 조회합니다 — 세션 목록 부분 인덱스가 `canceled`를 **제외하도록** 잡혀 있으면 이 조회가 인덱스를 못 탑니다(계약 14.1절 R-B와 같은 건). 그 경우 알려 주세요 |
| `ai-interview-architect` | **F7 회신 완료.** `02_ai_contracts.md` 3.5절에 `sessionStatus`가 추가되어 `02`·`05`·`06` 세 문서가 같은 `utterance_done` 페이로드를 말합니다. UI는 `sessionStatus === 'completed'`에서 입력창을 닫고 리포트 대기로 보냅니다(3.3절). `action`이 `InterviewerAction` 5개 값 유니온으로 좁혀진 것도 반영했습니다 |
| `qa-inspector` (**2차 / QA 대응 회신**) | **F1**(8.1절 자동 호출·[평가 시작하기] 삭제, `useRetryEvaluation` 개명) · **F2**(10절 재편 — 취소 10.1절 신설, "폐기"를 `useCancelSession`으로 이동, 4.9절 토글) · **F3**(7.5·7.6절 `myFeedback`/`myDisputes` 복원 + 중복 제기 차단) · **F4**(10.3절 `useDocument` 사전 건수) · **F11**(15·16절의 D18·D19 미결을 확정 서술로 교체) · **F13**(머리말 22건) · **F14**(7.2절 축 5개 식별자 매핑 표) 전부 반영했습니다. **`sonner`는 D22로 확정**이므로 5절 "미검증"의 `[확인 필요]`가 해소됩니다 — 판정 기준은 13절 마지막 항목에 적어 두었습니다 |
| `qa-inspector` | 대조 기준선: (1) **3절 훅 표의 "언랩" 열 ↔ 실제 훅 코드** — 언랩 여부가 가장 흔한 불일치 지점입니다, (2) 1절 라우트 표 ↔ 실제 `src/app/**/page.tsx` 존재 여부(모든 `href`·`router.push`가 이 표의 URL과 일치하는지), (3) 4상태 문자열이 `src/lib/voice/*`와 `src/components/interview/*`에서 **문자 단위로 일치**하는지(Q3), (4) `coachPayload`·`improvements` 내부 키가 **snake_case 그대로**인지(camelCase로 고친 코드가 있으면 런타임 `undefined`), (5) `EvaluationJobAccepted`에서 `axes`/`overallScore`를 읽는 코드가 없는지, (6) 하드코딩 색(`#`, `rgb(`, `bg-[`, Tailwind 팔레트 직접 사용)이 없는지 전역 grep, (7) `useEvaluation` 호출이 리포트 화면에서 생략되지 않는지(생략하면 `report_first_viewed_at`이 안 찍혀 지표 2가 빔), (8) `score_card_viewed` 이벤트가 축당 1회 전송되는지(지표 5의 분모), (9) `persona-meta.ts`의 주질문 수·깊이가 `01_state_machine.md` 3절 표와 같은지, (10) **"폐기"·"그만두기" 문구가 `useDeleteSession`이 아니라 `useCancelSession`에 연결됐는지**(D19 — 여기가 틀리면 사용자가 확인 없이 기록을 잃습니다), (11) **리포트 화면에 `useRetryEvaluation` 호출이 `status === 'failed'` 분기 밖에 있지 않은지**(D18 — 그 밖의 호출은 전부 409), (12) `axis-meta.ts`의 축 5개 식별자가 7.2절 표와 문자 단위로 같은지, (13) `package.json`에 `sonner` 외 UI 라이브러리가 없는지 |

| `vercel-platform-engineer` (**3차 / D27·D28·D29·D30 회신**) | **신설 6개(#36~#41) 전부 훅으로 받았습니다** — 3.1·3.2절. 봉투가 모두 단일 키라 **언랩 = 예**이며, **#39 `DELETE`가 `{ apiKey }`를 돌려준다는 점**을 다른 DELETE 훅과 다르다고 명시해 두었습니다. `Session.fundingSource`와 `PauseReason` 5종도 반영했고(4.6.1절), 신규 오류 4종의 화면을 4.14절에 고정 문안으로 두었습니다. **14절 §5 요청은 회신 수령 — 추가 요청 없음.** `trial_reservation_exists` + `details.existingSessionId`를 받아 4.4절의 소거법과 `activeSessions` 폴백을 **삭제**했고, `[이어서 하기]`는 `existingSessionId`로만, `[이전 면접 취소하기]`는 #33으로 연결했습니다. 확인 1건: `useCapacity`를 `staleTime` 30초로 화면 4곳에서 공유하고, **권위 있는 판정은 `#3`/`#6` 응답으로만** 받습니다(4.7.1절의 비원자성을 UI가 메우려 하지 않습니다). 이 사용 패턴이 맞다면 그대로 갑니다 |
| `ai-interview-architect` (**3차**) | 13.7.3절 4개 지시를 **전부 반영**했습니다 — (1) 여력 부족 화면의 1순위 버튼을 **[키 연결하기]** 로(4.14.1절), (2) 키 오류 문구를 `code`로 조회하는 **고정 문안**으로(4.14.2·4.14.3절, `blocked-copy.ts` 단일 사본), (3) "API 키" 허용 예외 유지(4.14.4절), (4) 체험 잔여 카운터 **미노출**. **요청 1건(16절 #12).** #11(금칙어 "한도" 예외)은 13.6.3절에 **"API 키"·"한도" 예외가 명문화되어 해소**됐습니다 — 감사합니다. 남은 것은 13.6.3절 ①②의 본문 문안을 `01_product_spec.md` 6.5.5절 문안으로 갱신해 주세요 — 현재 문안은 D27 시점의 것이라 키 연결 CTA가 없고, `availableAtIso`가 `null`일 수 있다는 사실(D28)이 반영돼 있지 않습니다 |
| `voice-pipeline-engineer` (**3차**) | **`pause_reason` 5종을 재개 패널이 전부 분기합니다**(4.6.1절). 음성 UI가 일시정지 사유를 표시한다면 신규 2종(`byok_key_invalid`·`byok_quota_exhausted`)에 **재개 가능 시각·카운트다운을 렌더하지 마세요** — `resumableAfter`가 `null`입니다. `stream_error.code`에 2종이 늘어난 것도 3.3절에 반영했고, **두 사유에서 [이어서 하기]를 `disabled`로 두지 않습니다.** 폴백 사다리 1·2단계는 `byok` 세션에서도 그대로 동작한다는 판단을 UI 쪽에서도 동일하게 전제합니다 |
| `product-architect` (**3차**) | **요청 없음.** `01_product_spec.md` 6.5·7·10절을 그대로 따랐습니다 — `/settings/api-key` 신설과 근거 4항, 온보딩 순서(가치 → 요구), 리포트 CTA를 "같은 이력서로 다시 하기"와 **같은 카드 안**에 둔 것, 여력 부족 화면의 1순위 버튼, 체험 잔여 카운터 금지, 키 마스킹 4자리까지 반영했습니다. 동의 문안은 6.5.4절 초안을 **한 글자도 바꾸지 않고** 썼습니다(4.13절) |
| `supabase-engineer` (**3차**) | **스키마 변경 요청 없음.** UI는 키 원문을 어떤 경로로도 받지 않으며(`ApiKeyStatus`에 자리가 없습니다), 키를 `localStorage`·URL·쿼리에 넣지 않습니다. 확인 1건: 계정 삭제 확인 문구에 **"연결하신 AI 키도 함께 삭제됩니다"** 를 넣었습니다(4.11절) — 실제 동작(cascade + Vault 삭제)과 일치하는지만 봐 주세요 |
| `qa-inspector` (**3차 대조 기준선 — D27·D28·D29·D30**) | (1) **키 원문이 클라이언트 코드 어디에도 저장되지 않는지** — `localStorage`/`sessionStorage`/`indexedDB`/`document.cookie`에 대한 전역 grep, 그리고 `router.push`·`href`·`?next=`에 키가 실리는 경로가 없는지. (2) **키 입력 폼(`ApiKeyForm`)이 `/settings/api-key` 외의 페이지에서 import 되지 않는지.** (3) **"보기" 토글·복사 버튼이 없는지** — 있으면 존재하지 않는 값을 읽는 코드입니다. (4) **금칙어 grep**(4.14.4절 목록) — 유일한 허용 예외는 "API 키" 전역과 **4.14.3절의 "한도"** 뿐입니다. (5) **체험 잔여 카운터가 없는지** — `trialStatus`가 분기 조건 외에 렌더에 쓰이면 위반입니다. (6) **재개 패널이 `PauseReason` 5종을 전부 분기하는지**, 신규 2종에 **시각·카운트다운·`disabled`가 없는지**. (7) **503을 받았을 때 `keyStatus === 'invalid'` 분기가 있는지** — 없으면 무효한 키 사용자에게 "내일 오세요"를 말하게 됩니다. (8) **리포트의 키 CTA가 "같은 이력서로 다시 하기"와 같은 카드 안**이고 `keyStatus === 'connected'`에서 렌더되지 않는지. (9) **여력 부족 안내의 1순위 버튼이 [키 연결하기]** 인지 — D28의 유일한 이득입니다. (10) **`useDisconnectApiKey`가 `{ apiKey }`를 언랩하는지**(`void`로 선언하면 화면이 갱신되지 않습니다). (11) **`consentVersion`이 하드코딩돼 있지 않은지** — `useCapacity` 응답에서 와야 합니다. (12) **동의 문구가 `src/lib/consent/trial-consent.ts` 단일 상수인지**(사본이 있으면 서버 해시와 갈라집니다). (13) **`useGrantTrialConsent` 성공 전에 `usePrepareSession`이 호출되지 않는지.** (14) **D30 409 안내에 기존 세션으로 가는 링크가 실제로 있는지** |

> 전체 결정 기록: [`00_input/decisions.md`](00_input/decisions.md)
