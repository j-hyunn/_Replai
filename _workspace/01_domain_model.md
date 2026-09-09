# 도메인 모델 초안

> 소유: `product-architect` · 상태: **초안(draft)**
> 이 문서는 **개념 모델**입니다. DDL·인덱스·RLS 정책의 확정은 `supabase-engineer`가 `04_data_layer.md`에서 합니다.
> 상태 값과 enum의 원본은 `01_state_machine.md`입니다. 이 문서와 충돌하면 상태 머신 문서가 우선합니다.

## 변경 로그
- 2026-09-09 최초 작성. 지표 6(꼬리질문 깊이)용 `questions.parent_question_id`, 지표 4·5용 피드백·이의 엔티티, 전사 정정용 `transcript_raw` 포함.

---

## 1. 네이밍 규칙

```
DB (Postgres)  : snake_case   예) session_id, created_at, main_question_budget
API 응답        : camelCase    예) sessionId, createdAt, mainQuestionBudget
프론트 타입      : camelCase (API 응답과 동일)
변환 시점        : API 라우트에서 단 한 번
```

- 테이블명은 복수형 snake_case, 기본 키는 `id`(uuid), 외래 키는 `<단수형>_id`.
- 시각 컬럼은 `_at` 접미사(timestamptz, UTC 저장).
- enum 성격 컬럼은 텍스트 + `CHECK` 제약으로 두고, 허용값은 상태 머신 문서의 목록을 문자 단위로 복사합니다.
- **status 값과 축 식별자는 한국어로 번역하지 않습니다.** 표시 문구만 한국어입니다.

---

## 2. 엔티티 관계 (카디널리티)

```
auth.users 1 ─ 1 profiles
profiles   1 ─ N documents
profiles   1 ─ N interview_sessions
documents  1 ─ N interview_sessions   (resume_document_id / jd_document_id 각각)
interview_sessions 1 ─ N questions
questions          1 ─ N questions    (parent_question_id, 자기 참조 = 꼬리질문 트리)
questions          1 ─ N turns
interview_sessions 1 ─ N turns
interview_sessions 1 ─ N session_events
interview_sessions 1 ─ N evaluations  (MVP는 실질적으로 1건, 재평가 대비 N)
evaluations        1 ─ N evaluation_scores
evaluation_scores  1 ─ N evaluation_citations
evaluation_citations N ─ 1 turns      (인용의 출처 발화)
interview_sessions 1 ─ 0..1 report_feedback
evaluation_scores  1 ─ N score_disputes
```

모든 테이블은 사용자 데이터를 담으므로 **예외 없이 RLS 활성화**하며, 소유자는
`profiles.id`(= `auth.users.id`)를 따라 판별합니다. 조인 테이블도 `user_id`를 비정규화해
정책을 단순하게 유지할지는 `supabase-engineer`가 정합니다.

---

## 3. 엔티티

### 3.1 `profiles`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | `auth.users.id`와 동일 |
| `display_name` | text | 표시 이름 |
| `default_job_role` | text | 마지막으로 고른 직군. 설정 화면 기본값 |
| `created_at` / `updated_at` | timestamptz | |

계정 삭제 시 이 행과 하위 전부, Storage 객체까지 **실제 삭제**합니다(소프트 삭제 아님).

### 3.2 `documents` — 이력서·JD
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → profiles | |
| `doc_type` | text | `resume` \| `job_description` |
| `source_type` | text | `file` \| `text` — 브리프의 두 입력 방식 |
| `title` | text | 사용자가 붙인 이름 |
| `storage_path` | text NULL | `source_type = 'file'`일 때 Storage 객체 경로 |
| `mime_type` / `byte_size` | text / bigint | 파일일 때만 |
| `extracted_text` | text | 추출 또는 직접 입력된 본문. **질문 생성의 실제 입력** |
| `extraction_status` | text | `pending` \| `running` \| `succeeded` \| `failed` \| `not_required`(직접 입력) |
| `extraction_error` | text NULL | 실패 사유(스캔 PDF 등) |
| `is_edited_by_user` | boolean | 추출 텍스트를 사용자가 손봤는지 |
| `created_at` / `updated_at` | timestamptz | |

### 3.3 `interview_sessions`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → profiles | |
| `status` | text | 상태 머신의 11개 값. CHECK 제약의 원본은 `01_state_machine.md` |
| `job_role` | text | `pm` \| `pd` \| `security` \| `ai` \| `engineer` |
| `persona` | text | `deep_pressure` \| `technical_probe` |
| `modality` | text | 시작 시 고른 모드 `voice` \| `text` |
| `current_modality` | text | 진행 중 실제 모드. 전환 시 갱신 |
| `resume_document_id` | uuid FK → documents | |
| `jd_document_id` | uuid FK → documents | |
| `main_question_budget` | int | 페르소나 기본값 4 / 6 |
| `max_follow_up_depth` | int | 페르소나 기본값 4 / 2 |
| `max_turns` | int | 20 / 18 |
| `max_duration_min` | int | 30 |
| `pause_reason` | text NULL | `user_requested` \| `rate_limited` \| `connection_lost` |
| `resumable_after` | timestamptz NULL | `pause_reason = 'rate_limited'`일 때 재개 가능 시각 |
| `failure_reason` | text NULL | `failed`일 때만 |
| `context_summary` | text NULL | 이력서·JD를 압축한 면접관 컨텍스트 |
| `started_at` / `ended_at` / `paused_at` | timestamptz NULL | 지표 1·3 계산에 사용 |
| `report_first_viewed_at` | timestamptz NULL | **지표 2(리포트 도달률)의 측정 지점** |
| `source_session_id` | uuid NULL FK → interview_sessions | "같은 이력서로 다시 하기"로 복제된 원본. **지표 3(재시도율)** |
| `created_at` / `updated_at` | timestamptz | |

### 3.4 `questions` — 질문 트리 (지표 6의 원천)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK → interview_sessions | |
| `parent_question_id` | uuid NULL FK → questions | **NULL이면 주질문, 값이 있으면 그 질문의 꼬리질문** |
| `depth` | int | 주질문 0, 꼬리질문은 부모 + 1. `max_follow_up_depth`로 상한 |
| `order_index` | int | 세션 내 발화 순서 |
| `question_kind` | text | `main` \| `follow_up` |
| `question_text` | text | 한국어 질문 원문 |
| `source_span` | text NULL | 이 질문이 파고든 이력서·직전 답변의 근거 구절 |
| `target_axis` | text NULL | 노린 루브릭 축 식별자(`job_knowledge` 등) |
| `asked_at` | timestamptz NULL | |
| `created_at` | timestamptz | |

> **지표 6(꼬리질문 깊이) 계산:** 세션별 `count(question_kind='follow_up') / count(question_kind='main')`의
> 중앙값, 그리고 `max(depth)`의 분포. 이 두 컬럼이 없으면 제품의 정체성 지표를 셀 수 없습니다.

### 3.5 `turns` — 대화 로그 (진실의 원천)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK → interview_sessions | |
| `question_id` | uuid NULL FK → questions | 후보 발화는 답한 질문, 면접관 발화는 자기 질문 |
| `seq` | int | 세션 내 순번 |
| `role` | text | `interviewer` \| `candidate` |
| `transcript_text` | text | **평가·인용이 참조하는 정본.** 정정 시 수정본이 들어감 |
| `transcript_raw` | text NULL | STT 원문. 정정 전 값 보존 |
| `is_corrected` | boolean | 사용자가 정정했는지 |
| `modality` | text | `voice` \| `text` — 이 발화가 나온 모드 |
| `stt_confidence` | numeric NULL | 있으면 저장. 전달력 축 신뢰도 판단용 |
| `started_at` / `ended_at` | timestamptz | 발화 길이(전달력 축·침묵 분석용) |
| `created_at` | timestamptz | |

오디오 원본은 저장하지 않습니다. `turns`에 오디오 경로 컬럼을 두지 않습니다.

### 3.6 `session_events` — 상태 전이 감사 로그
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK | |
| `from_status` / `to_status` | text NULL / text | 전이. 모달리티 전환처럼 상태가 안 바뀌면 두 값이 같음 |
| `trigger` | text | `user_action` \| `ai_completion` \| `timeout` \| `system_error` \| `scheduler` |
| `event_name` | text | `modality_switched`, `rate_limit_fallback`, `resumed` 등 |
| `detail` | jsonb NULL | |
| `occurred_at` | timestamptz | |

지표 1(완주율)과 2(리포트 도달률)는 이 표와 `interview_sessions`로 계산합니다.

### 3.7 `evaluations`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK | |
| `status` | text | `running` \| `succeeded` \| `failed` |
| `model_name` | text | 채점에 쓴 모델 |
| `rubric_version` | text | 루브릭 버전. 회차 비교의 전제 |
| `overall_score` | numeric NULL | 가중 합산 점수(1.00–5.00) |
| `summary` | text NULL | 한국어 총평 |
| `improvements` | jsonb NULL | 개선점 3가지 |
| `attempt_count` | int | 재시도 횟수(최대 3) |
| `error_message` | text NULL | |
| `started_at` / `finished_at` | timestamptz | |

### 3.8 `evaluation_scores`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `evaluation_id` | uuid FK | |
| `axis` | text | 루브릭 축 식별자. `01_rubric.md`의 5개 값 |
| `score` | int NULL | 1–5. 근거 부족이면 NULL |
| `is_insufficient_evidence` | boolean | 근거 부족으로 채점하지 않음 |
| `weight` | numeric | 이 세션 페르소나의 가중치 |
| `rationale` | text | 한국어 채점 근거 |
| `improvement` | text | 이 축의 개선 제안 |

### 3.9 `evaluation_citations` — 점수마다 붙는 원문 인용
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `score_id` | uuid FK → evaluation_scores | |
| `turn_id` | uuid FK → turns | 인용의 출처 발화 |
| `quote_text` | text | `turns.transcript_text`의 부분 문자열 |
| `quote_start` / `quote_end` | int | 원문 내 문자 오프셋. 리포트에서 하이라이트 |
| `comment` | text NULL | 이 인용이 왜 근거인지 |

각 `evaluation_scores` 행은 `is_insufficient_evidence = false`인 한 최소 1건의 인용을 가져야 합니다.

### 3.10 `report_feedback` — 지표 4
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK UNIQUE | 세션당 1건 |
| `user_id` | uuid FK | |
| `is_helpful` | boolean | "도움이 되었나요" |
| `comment` | text NULL | |
| `created_at` / `updated_at` | timestamptz | 수정 가능 |

### 3.11 `score_disputes` — 지표 5
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `score_id` | uuid FK → evaluation_scores | |
| `citation_id` | uuid NULL FK → evaluation_citations | 특정 인용에 대한 이의면 지정 |
| `user_id` | uuid FK | |
| `reason_code` | text | `transcription_error` \| `misinterpreted` \| `score_too_low` \| `other` |
| `comment` | text NULL | |
| `created_at` | timestamptz | |

지표 5는 "축 점수 카드 노출 대비 이의 클릭 비율"이므로, 노출 이벤트는 `session_events`에
`event_name = 'score_card_viewed'`로 남깁니다.

---

## 4. 삭제 규칙

- 세션 삭제: `interview_sessions` 행과 하위(`questions`·`turns`·`session_events`·`evaluations`·
  `evaluation_scores`·`evaluation_citations`·`report_feedback`·`score_disputes`)를 CASCADE로 **실제 삭제**.
  `documents`는 다른 세션이 참조할 수 있으므로 함께 지우지 않습니다.
- 문서 삭제: 참조 중인 세션이 있으면 경고 후, 진행자가 확인하면 `documents` 행과 Storage 객체를 삭제하고
  참조 컬럼은 NULL로 둡니다(과거 리포트는 남되 원본 문서는 사라짐).
- 계정 삭제: `profiles` 이하 전부와 Storage 사용자 폴더 전체를 삭제하고 `auth.users`를 제거합니다.
- 어디에도 `deleted_at` 소프트 삭제 컬럼을 두지 않습니다(브리프 7절 확정 사항).

---

## 5. 남은 결정

```
[결정 필요] documents를 세션이 참조만 할 것인가, 세션 시작 시 스냅샷을 복사할 것인가
  옵션 A: 참조만 — 저장 용량이 작고 모델이 단순. 사용자가 이력서를 고치면 과거 리포트의 근거 문서가 달라짐
  옵션 B: 세션 생성 시 extracted_text를 세션에 스냅샷 복사 — 회차 간 비교의 근거가 고정되지만
          무기한 보존 정책과 겹쳐 Storage/DB 용량이 세션 수만큼 증가(무료 티어 압박)
  영향: 스키마, 회차 비교 기능(핵심 가치 3번), 무료 티어 용량
  현재 문서는 A를 잠정값으로 사용
```
