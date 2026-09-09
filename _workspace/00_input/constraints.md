# 고정 제약 (모든 에이전트 필독)

> 출처: `CLAUDE.md`, `docs/00_brief.md` 7절. 이 파일과 브리프가 충돌하면 브리프가 우선한다.
> `docs/`는 사람 소유이며 **읽기 전용**이다. 절대 수정·이동·재생성하지 않는다.

## 기술
- 프레임워크: Next.js (App Router) + React
- UI: **shadcn/ui 단독**. 다른 UI 라이브러리 도입 금지 (Radix + Tailwind 조합까지만 허용)
- 데이터: Supabase (Postgres + Auth + Storage + Realtime). 사용자 데이터를 담는 모든 테이블은 **예외 없이 RLS 활성화**
- 배포: Vercel
- 네이밍: DB는 snake_case, API 응답과 프론트 타입은 camelCase. 변환은 **API 라우트에서 단 한 번**
- 시크릿: AI 프로바이더 키와 Supabase service_role 키에 `NEXT_PUBLIC_` 접두사 금지

## 제품
- 모달리티: **음성이 주, 텍스트 채팅은 동등한 1급 시민.** 대화 로그의 진실의 원천은 **텍스트 전사**
- 음성 원본은 저장하지 않는다. 오디오 버퍼는 세션 종료 시 폐기
- 지연시간: 답변 종료 → 다음 질문 발화까지 **최대 5초**. STT→LLM→TTS 직렬 구성
- 예산: **각 프로바이더 무료 티어 한도 내.** 세션당 유료 과금 상한 $0. Realtime 계열 음성 API 제외
- 보존: 무기한 보관, 사용자 삭제 시에만 **실제 삭제**(소프트 삭제 아님)
- MVP 페르소나: 심층 압박형 + 기술 검증형 2종. 경험 탐색형은 후속
- 직군 분화: 공통 루브릭 + 직군별 질문 풀

## 언어 정책 (가장 자주 잊히는 제약)
- 이 워크스페이스의 **모든 산출물은 한국어로 작성**한다.
- 런타임 AI 프롬프트, UI 카피, 평가 피드백도 **한국어**. 면접은 한국어로 진행된다.
- **코드 식별자는 영어를 유지**한다: 테이블/컬럼명, status enum 값, 타입·필드명, 라우트 경로,
  훅 이름, 파일명. status 값이나 필드명을 한국어로 번역하면 CHECK 제약과 API 계약이 깨진다.
- 영어로 쓰는 것은 `.claude/` 아래 하네스 지시 파일과 커밋 메시지뿐이다.
  (PR 제목·본문은 한국어)

## 산출물 경로
```
_workspace/
├── 00_input/constraints.md
├── 01_product_spec.md / 01_state_machine.md / 01_domain_model.md / 01_rubric.md
├── 02_ai_architecture.md / 02_ai_contracts.md / 02_prompts/{interviewer,evaluator,coach,planner}.md
├── 03_voice_pipeline.md
├── 04_data_layer.md
├── 05_api_contract.md / 05_deploy.md
├── 06_ui_plan.md
└── 07_qa_report.md
```

## 브리프의 열린 질문 (9절) — 설계에서 해소해야 할 것
| # | 질문 | 1차 담당 |
|---|---|---|
| 1 | 직군별 질문 풀 확보·검증 방식 | ai-interview-architect |
| 2 | 심층 압박형의 압박 상한 정의와 강제 | ai-interview-architect (+ product-architect 루브릭) |
| 3 | 전사 오류를 사용자가 정정할 수 있어야 하나 | product-architect (→ 스키마·UI 전파) |
| 5 | 이력서 PDF 텍스트 추출 위치 | product-architect 초안 → vercel-platform-engineer 확정 |
| 6 | "면접관이 생각 중" 상태 표현 | product-architect(요구) → voice-pipeline-engineer |
| 7 | 페르소나별 질문 수·종료 조건 차이 | product-architect (상태 머신) |
| 8 | 무료 티어 레이트 리밋 도중 도달 시 동작 | product-architect (상태 머신) → voice/vercel |

각 담당은 결정을 산출물에 **결정과 근거를 함께** 남기고, 확정할 수 없으면
`[결정 필요: ...]`로 명시해 리더가 사용자에게 올릴 수 있게 한다.
