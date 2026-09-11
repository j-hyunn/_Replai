# Replai

이력서와 채용공고를 읽고 **꼬리질문**을 던지는 AI 모의면접 서비스.
면접이 끝나면 대화에서 인용한 근거가 붙은 리포트를 받습니다.

- 프레임워크: Next.js (App Router) + React + TypeScript
- UI: **shadcn/ui 단독** (+ `sonner`)
- 데이터: Supabase (Postgres + Auth + Storage + Realtime)
- 배포: Vercel

## 시작하기

```bash
npm install
cp .env.example .env.local   # 값을 채웁니다
npm run dev
```

`.env.local`은 커밋하지 않습니다. 각 변수의 의미와 공개/비공개 구분은 `.env.example`의 주석과
`_workspace/05_deploy.md` 1절에 있습니다.

## 스크립트

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run typecheck` | 라우트 타입 생성 후 `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run typegen` | Next.js 라우트 타입만 생성 |

`typecheck`가 `next typegen`을 먼저 부르는 이유는 `PageProps` / `LayoutProps` 전역 타입이
`.next/types`에 생성되기 때문입니다. 깨끗한 체크아웃에서 `tsc`만 돌리면 그 타입이 없어 실패합니다.

## 문서

설계 문서는 소유자 기준으로 두 곳에 나뉩니다. 자세한 규약은 [CLAUDE.md](CLAUDE.md)를 보세요.

| 경로 | 소유 | 내용 |
|---|---|---|
| `docs/` | 사람 | 서비스 브리프 |
| `_workspace/` | 에이전트 | 스펙·상태 머신·AI 계약·데이터 레이어·API 계약·UI 플랜·QA 리포트 |
