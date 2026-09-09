# 면접 세션 상태 머신

> 소유: `product-architect` · 상태: **초안(draft)** — 확정 전까지 하위 산출물은 이 문서를 잠정 입력으로 사용
> 이 파일의 상태 값 목록이 DB `CHECK` 제약과 코드 문자열 비교의 **원본**입니다.
> 값은 영어 snake_case이며, 문자 단위로 그대로 복사해야 합니다. 한국어로 번역 금지.

## 변경 로그
- 2026-09-09 최초 작성. 브리프 9절 #7(페르소나별 질문 수·종료 조건), #8(레이트 리밋) 반영.

---

## 1. 상태 값 목록 (원본 — 기계적 대조용)

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

`interview_sessions.status`의 허용값은 위 11개가 전부입니다.

### 부속 enum

`interview_sessions.pause_reason` — `status = 'paused'`일 때만 값이 있고, 그 외에는 `NULL`.

```
user_requested
rate_limited
connection_lost
```

`interview_sessions.modality` / `current_modality`

```
voice
text
```

`interview_sessions.persona`

```
deep_pressure
technical_probe
```

`interview_sessions.job_role`

```
pm
pd
security
ai
engineer
```

### 상태별 한국어 설명과 사용자에게 보이는 화면

| 상태 | 설명 | 최종 상태 | 사용자가 보는 화면 |
|---|---|---|---|
| `created` | 세션 행만 생성됨. 설정 미입력 | 아니오 | `/sessions/new` |
| `configuring` | 직군·페르소나·모달리티·이력서·JD 입력 중 | 아니오 | `/sessions/new` |
| `ready` | 컨텍스트 준비와 오프닝 질문 생성 완료. 시작 대기 | 아니오 | `/sessions/[sessionId]/ready` |
| `in_progress` | 질문↔답변 루프 진행 중 | 아니오 | `/sessions/[sessionId]/interview` |
| `paused` | 일시정지. 재개 가능 (사유는 `pause_reason`) | 아니오 | `/sessions/[sessionId]/interview` (재개 패널) |
| `completed` | 대화 종료. 평가 대기 | 아니오 | `/sessions/[sessionId]/report` (평가 대기 화면) |
| `evaluating` | 평가 작업 실행 중 | 아니오 | `/sessions/[sessionId]/report` (평가 진행 화면) |
| `evaluated` | 리포트 생성 완료 | **예** | `/sessions/[sessionId]/report` |
| `failed` | 복구 불가 오류로 종료. 재시도 진입점 제공 | **예** | `/sessions/[sessionId]/report` (실패 화면) |
| `abandoned` | 재개 시한(7일) 초과로 자동 종료 | **예** | `/sessions` 목록에서 "중단됨" 표시 |
| `canceled` | 사용자가 세션을 폐기(종료 상태, **행은 남는다**) | **예** | `/sessions` 기본 목록에서는 숨김. "취소된 세션 보기" 토글에서 "취소됨"으로 표시 |

> `evaluating → evaluated` 전이는 **반드시 구현되어야 합니다.** 이 전이가 빠지면 사용자는 리포트를
> 영원히 기다립니다. 평가 워커는 성공 시 `evaluated`, 실패 시 `failed`로 **항상** 상태를 옮겨야 하며,
> 어느 쪽도 일어나지 않은 채 `evaluating`에 10분 이상 머문 세션은 워치독이 `failed`로 내립니다.

---

## 2. 전이 표

| 현재 상태 | 다음 상태 | 트리거 | 가드(전제 조건) | 부작용 |
|---|---|---|---|---|
| (없음) | `created` | 사용자가 "새 면접 시작" 클릭 | 인증됨 | `interview_sessions` 행 삽입, `session_events` 기록 |
| `created` | `configuring` | 설정 화면에서 첫 입력 저장 | — | 부분 설정 저장 |
| `created` | `canceled` | 사용자가 설정을 떠나며 폐기 | — | `ended_at` 기록. **행은 유지**(삭제하지 않음) |
| `configuring` | `configuring` | 설정 항목 변경 | — | 부분 설정 갱신 |
| `configuring` | `ready` | 사용자가 "면접 준비" 클릭 → 컨텍스트 준비 완료 | 직군·페르소나·모달리티·이력서·JD가 모두 있고 이력서/JD의 `extraction_status = 'succeeded'` | 이력서·JD 요약 컨텍스트 생성, 오프닝 주질문 1개 생성 후 `questions` 삽입, `question_budget` 확정 |
| `configuring` | `failed` | 이력서 텍스트 추출 실패(스캔 PDF 등) 후 사용자가 재시도 포기 (진입점: `POST .../abandon-preparation`, `05_api_contract.md` #35) | — | `failure_reason = 'document_extraction_failed'` 기록. 사용자에게 텍스트 직접 입력 경로 안내 |
| `configuring` | `canceled` | 사용자가 폐기 | — | `ended_at` 기록. 첨부 관계 유지. **행은 유지** |
| `ready` | `in_progress` | 사용자가 "면접 시작" 클릭 | 음성 모드면 마이크 권한 확인 완료 | `started_at` 기록, 오프닝 질문 발화 |
| `ready` | `configuring` | 사용자가 "설정 변경" 클릭 | — | 생성된 `questions` 폐기(실제 삭제) |
| `ready` | `canceled` | 사용자가 폐기 | — | `ended_at` 기록. **행은 유지** |
| `in_progress` | `in_progress` | 답변 제출 → 다음 질문 생성 | 종료 조건(3절) 미충족 | `turns` 삽입, 꼬리질문이면 `questions.parent_question_id` 설정, `depth` 증가 |
| `in_progress` | `in_progress` | 모달리티 전환(음성↔텍스트) | — | `current_modality` 갱신, `session_events`에 `modality_switched` 기록. **상태는 바뀌지 않음** |
| `in_progress` | `paused` | 사용자가 "일시정지" 클릭 | — | `pause_reason = 'user_requested'`, `paused_at` 기록, 오디오 버퍼 폐기 |
| `in_progress` | `paused` | LLM 레이트 리밋 도달 + 백오프 대기 60초 초과 | 4절 폴백 사다리의 3단계 | `pause_reason = 'rate_limited'`, 재개 가능 시각 안내 |
| `in_progress` | `paused` | 네트워크 단절·탭 종료. **클라이언트가 감지하면 `sendBeacon`으로 즉시**(최선 노력), 감지하지 못하면 일 1회 워치독 또는 사용자가 다시 열었을 때의 지연 판정으로 회수 (D25) | — | `pause_reason = 'connection_lost'` |
| `in_progress` | `completed` | 종료 조건 충족(3절) 또는 사용자가 "면접 종료" 클릭 | 답변한 주질문 ≥ 1 | `ended_at` 기록, 오디오 버퍼 폐기, 평가 작업 큐 등록 |
| `in_progress` | `canceled` | 사용자가 "이 세션 버리기" 클릭 | — | `ended_at` 기록. 턴·질문 **유지**. 평가는 등록하지 않음 |
| `in_progress` | `failed` | 복구 불가 오류(프로바이더 영구 오류, 컨텍스트 손상) | — | `failure_reason` 기록, 오디오 버퍼 폐기 |
| `paused` | `in_progress` | 사용자가 "이어서 하기" 클릭 | 마지막 갱신 후 7일 이내, `rate_limited`면 재개 가능 시각 경과 | `pause_reason = NULL`, 직전 질문 재발화 |
| `paused` | `completed` | 사용자가 "여기서 끝내기" 클릭 | 답변한 주질문 ≥ 1 | `ended_at` 기록, 평가 큐 등록 |
| `paused` | `abandoned` | 7일 경과(스케줄러) | 답변한 주질문 = 0 이거나 사용자가 재개하지 않음 | `ended_at` 기록. 답변한 주질문 ≥ 1이면 `completed`로 보내 평가(아래 행 참조) |
| `paused` | `completed` | 7일 경과(스케줄러) | 답변한 주질문 ≥ 1 | 자동 종료 후 평가 큐 등록. 리포트에 "중단된 세션" 배지 |
| `paused` | `canceled` | 사용자가 폐기 | — | `ended_at` 기록. **행은 유지** |
| `completed` | `evaluating` | 평가 워커가 작업을 집음 | 평가 작업이 큐에 있음 | `evaluations` 행 삽입(`status = 'running'`), `evaluation_started_at` 기록 |
| `completed` | `failed` | 평가 큐 등록 자체가 실패하고 재시도 3회 소진 | — | `failure_reason = 'evaluation_enqueue_failed'` |
| `evaluating` | `evaluated` | 평가 결과 저장 완료 | 모든 축의 점수와 인용이 저장됨 | `evaluation_scores`·`evaluation_citations` 삽입, 리포트 열람 가능, 알림 표시 |
| `evaluating` | `completed` | 평가 실패 + 재시도 잔여(최대 3회) | 재시도 횟수 < 3 | 지수 백오프 후 큐 재등록 |
| `evaluating` | `failed` | 평가 재시도 3회 소진 또는 10분 워치독 타임아웃 | — | `failure_reason = 'evaluation_failed'`, 리포트 화면에 재시도 버튼 노출 |
| `evaluated` | `evaluating` | 사용자가 "평가 다시 실행" 클릭 | MVP 범위 밖 — `[later]` | 기존 평가는 보존하고 새 `evaluations` 행 생성 |
| `failed` | `evaluating` | 사용자가 리포트 화면에서 "평가 재시도" 클릭 | `failure_reason`이 평가 계열이고 `turns`가 남아 있음 | 재시도 카운터 초기화 후 평가 큐 재등록 |
| `failed` | `canceled` | 사용자가 폐기 | — | `ended_at` 기록. **행은 유지** |
| `abandoned` | `canceled` | 사용자가 폐기 | — | `ended_at` 기록. **행은 유지** |
| 모든 상태 | (행 삭제) | 사용자가 세션 삭제 / 계정 삭제 | — | DB 행과 Storage 객체 **실제 삭제**(소프트 삭제 아님) |

### 전이 표에 없는 조합은 금지

API 라우트는 전이 시도 시 위 표를 검사해 허용되지 않으면 `409 Conflict`를 반환합니다.
모든 성공 전이는 `session_events`에 `from_status` / `to_status` / `trigger` / `occurred_at`으로 남깁니다.
(지표 1 세션 완주율과 지표 2 리포트 도달률이 이 로그로 계산됩니다.)

---

## 3. 종료 조건 — 페르소나별 차이 (브리프 9절 #7 결정)

**결정: 두 페르소나는 세션당 주질문 수와 꼬리질문 최대 깊이를 다르게 갖는다. 종료 판정 규칙 자체는 동일하다.**

| 항목 (컬럼명) | `deep_pressure` (심층 압박형) | `technical_probe` (기술 검증형) |
|---|---|---|
| 주질문 수 `main_question_budget` | 4 | 6 |
| 주질문당 꼬리질문 최대 깊이 `max_follow_up_depth` | 4 | 2 |
| 세션 턴 상한 `max_turns` (후보 발화 기준) | 20 | 18 |
| 세션 시간 상한 `max_duration_min` | 30 | 30 |
| 평가 가능 최소선 | 답변한 주질문 ≥ 2 | 답변한 주질문 ≥ 2 |

**종료 판정(공통):** 다음 중 **하나라도** 먼저 충족되면 `in_progress → completed`.
1. 답변한 주질문 수 = `main_question_budget`이고 마지막 주질문의 꼬리질문이 끝남
2. 후보 발화 수 = `max_turns`
3. `started_at` 이후 경과 시간 = `max_duration_min`
4. 사용자가 "면접 종료"를 누름

**근거.** 심층 압박형의 제품 가치는 깊이(브리프 2절 "세 번째 꼬리질문")이므로 주질문을 줄이고 깊이를 늘립니다.
기술 검증형은 설계·CS·성능이라는 넓은 표면을 검증해야 하므로 주질문을 늘리고 깊이를 줄입니다.
두 값의 곱이 비슷해(4×5=20, 6×3=18) 세션 길이와 토큰 소모가 균형을 이루고, 무료 티어 한도 안에 들어옵니다.
`max_turns`와 시간 상한은 무한 루프와 비용 폭주를 막는 안전 상한이며 정상 세션에서는 걸리지 않습니다.

답변한 주질문이 1개뿐인 채 종료되면 `completed`로 가되, 평가는 "근거 부족" 리포트를 생성합니다
(루브릭 문서의 `insufficient_evidence` 규칙). 0개면 `abandoned`로 보내 평가하지 않습니다.

**지표 6(꼬리질문 깊이) 연결:** `questions.parent_question_id`와 `questions.depth`로 계산합니다.
`max_follow_up_depth`가 상한을 정하므로, 실제 중앙값이 상한에 붙어 있으면 상한을 올릴 근거가 됩니다.

---

## 4. 레이트 리밋 도달 시 동작 (브리프 9절 #8 결정)

**결정: 세션을 끊지 않는다. "폴백 사다리"를 순서대로 내려가고, 마지막에만 `paused`로 보존한다.
별도의 `rate_limited` 상태를 만들지 않고 `paused` + `pause_reason = 'rate_limited'`로 표현한다.**

**근거.** 리밋 주체마다 영향이 다릅니다. STT/TTS가 막히면 대화는 텍스트로 계속할 수 있고(텍스트는 1급 시민),
LLM이 막히면 면접 자체가 진행 불가입니다. 이 둘을 한 상태로 뭉치면 UI가 잘못된 안내를 하게 됩니다.
반대로 상태를 새로 만들면 "재개 대기 중"이라는 `paused`의 의미와 중복되고, DB CHECK·RLS·화면 분기가 모두 늘어납니다.
사유 컬럼으로 구분하면 화면은 정확한 안내를, 상태 머신은 최소 크기를 유지합니다.

| 단계 | 리밋 주체 | 동작 | 상태 변화 | 사용자에게 보이는 것 |
|---|---|---|---|---|
| 1 | TTS | 면접관 발화를 텍스트로만 출력. 사용자 입력은 음성 유지 | 없음 | "지금은 면접관 목소리 없이 텍스트로 진행합니다" |
| 2 | STT | 사용자 입력을 텍스트 입력창으로 전환. `current_modality = 'text'` | 없음 (`in_progress` 유지) | "마이크 인식이 잠시 불가합니다. 텍스트로 이어서 답변해 주세요" |
| 3 | LLM (일시적, 백오프 60초 이내) | 지수 백오프 재시도. 이 동안 "면접관이 생각 중" 표시를 유지하되 3초 초과 시 지연 안내로 전환 | 없음 | "면접관이 답변을 정리하고 있습니다 (잠시만요)" |
| 4 | LLM (60초 초과 또는 일일 한도 소진) | 세션 보존 후 일시정지 | `in_progress → paused`, `pause_reason = 'rate_limited'` | "지금은 이어갈 수 없습니다. {재개 가능 시각} 이후 '이어서 하기'를 누르면 마지막 질문부터 계속됩니다" |

- 3단계에서 사용자는 언제든 직접 "일시정지"를 눌러 4단계로 갈 수 있습니다.
- 4단계에서 7일 안에 재개하지 않으면 3절의 자동 종료 규칙을 따릅니다(답변 ≥ 1이면 `completed`, 아니면 `abandoned`).
- 1·2단계는 상태를 바꾸지 않으므로 **완주율 지표를 왜곡하지 않습니다.** 이것도 이 설계를 택한 이유입니다.

---

## 5. 모달리티 분기

- 세션 생성 시 `modality`(사용자가 고른 기본값)를 정하고, 진행 중 실제 모드는 `current_modality`가 들고 있습니다.
- **세션 중 전환은 언제나 허용**됩니다. 마이크 실패, STT 리밋, 사용자의 수동 전환 어느 경우든 세션과 대화 로그는 끊기지 않습니다.
- 전환은 상태 전이가 아니라 `in_progress` 안의 자기 전이이며, `session_events`에 `modality_switched`로 남습니다.
- 대화 로그의 진실의 원천은 **텍스트 전사**입니다. 오디오 원본은 저장하지 않고 세션 종료·일시정지·실패 시 버퍼를 폐기합니다.
- 각 `turns` 행은 그 발화가 어느 모드에서 나왔는지 `modality`로 기록합니다. 평가의 전달력 축 신뢰도 판단에 쓰입니다.

---

## 6. "면접관이 생각 중" 상태 요구사항 (브리프 9절 #6 결정 — 제품 요구사항)

**결정: MVP는 시각 인디케이터 + 상태 문구를 필수로 하고, 필러 음성은 후속으로 미룬다.**
구현 방식(오디오 처리·타이밍)은 `voice-pipeline-engineer`가 정합니다.

- 면접 화면은 항상 다음 4개 중 하나를 명시적으로 표시합니다(식별자는 영어, 표시는 한국어):
  `listening`(듣는 중) · `transcribing`(받아쓰는 중) · `thinking`(생각 중) · `speaking`(말하는 중)
- 사용자 발화 종료 감지 후 **400ms 이내**에 `transcribing` 또는 `thinking` 표시가 떠야 합니다. 무표시 침묵 금지.
- `thinking`이 **3초**를 넘기면 "조금만 기다려 주세요" 보조 문구를 덧붙입니다.
- `thinking`이 **8초**를 넘기면 지연 안내와 함께 "텍스트로 전환" 버튼을 노출합니다(4절 2단계와 동일 경로).
- 필러 음성("음, 그러면...") `[later]` — 무료 티어 TTS 호출 수를 늘리므로 MVP에서 제외.

---

## 7. 이탈 지점별 세션이 남는 상태

| 사용자가 여기서 이탈하면 | 세션이 남는 상태 | 복구 경로 |
|---|---|---|
| 설정 화면 | `created` 또는 `configuring` | `/dashboard`의 "작성 중인 세션"에서 이어서 설정 |
| 준비 화면 | `ready` | 목록에서 "면접 시작" |
| 면접 도중 탭을 닫음 | `paused` (`connection_lost`) | 7일 안에 "이어서 하기" |
| 평가 대기 중 나감 | `completed` / `evaluating` | 평가는 서버에서 계속. 완료 시 목록·리포트에서 확인 |
| 리포트를 안 봄 | `evaluated` | 목록에 "새 리포트" 배지 (지표 2 측정 지점) |

---

## 8. 결정 완료

남은 미결 없음. (2026-09-09)

**D19 — `canceled`는 삭제가 아니라 행을 남기는 종료 상태입니다.** 초안은 모든 `→ canceled` 전이의
부작용을 "실제 삭제"로 적었는데, 행이 지워지면 `status = 'canceled'`는 어떤 행에도 존재할 수 없는
값이 되어 CHECK에만 있고 관측 불가능한 유령 상태였습니다. 3절이 목록에 "취소됨"으로 보인다고
적은 것과도 어긋났습니다.

취소와 삭제를 분리합니다 — 취소는 종료 상태이고, **삭제는 `DELETE /api/sessions/[sessionId]` 경로에서
되돌릴 수 없다는 확인을 거쳐서만** 일어납니다. 면접 도중 "이 세션 버리기"를 누른 사용자가 확인 없이
대화 기록을 영구 파괴당할 이유가 없습니다. **상태 목록 11개와 CHECK 제약은 그대로이며 값의 의미만
정정되었습니다.**

**D18 — 평가 시작은 서버가 합니다.** `completed`로 가는 모든 경로의 부작용으로 서버가 평가를
등록합니다. `paused` 7일 자동 종료처럼 클라이언트가 존재하지 않는 경로가 있기 때문입니다.
`POST .../evaluate`는 `failed` 상태의 재시도 전용입니다.

**D7 — `paused` 자동 종료 시한은 7일입니다.** 초안의 24시간에서 뒤집혔습니다.
무료 티어는 분당뿐 아니라 **일당(RPD) 한도**가 걸리고, `pause_reason = 'rate_limited'`로 멈춘 세션은
구조적으로 다음 날에야 재개할 수 있습니다. 24시간 시한은 그 재개 창과 겹쳐, 예산 제약이 만든 중단을
사용자 이탈로 기록하게 됩니다 — 완주율(지표 1)이 압박 강도가 아니라 무료 티어 한도를 재게 됩니다.
부수적으로 브리프 3절의 "D-7 집중 연습" 창과 7일이 정확히 겹칩니다.
스케줄러는 일 1회 그대로입니다.

> 전체 결정 기록: [`00_input/decisions.md`](00_input/decisions.md)
