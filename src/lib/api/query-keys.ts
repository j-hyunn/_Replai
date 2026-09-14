/**
 * 쿼리 키 규칙 (06_ui_plan.md 2.4절).
 *
 * `['capacity']`와 `['apiKey']`는 **같은 서버 사실의 두 창**입니다(계약 4.7.5절).
 * 키를 바꾸는 뮤테이션 3종(#38·#39·#40)은 성공 시 **두 키를 모두** invalidate 합니다.
 */

export const queryKeys = {
  dashboard: () => ["dashboard"] as const,
  sessions: (filters: { status?: string; includeCanceled?: boolean } = {}) =>
    ["sessions", filters] as const,
  /** 목록 전체를 무효화할 때 쓰는 접두사. */
  sessionsRoot: () => ["sessions"] as const,
  session: (sessionId: string) => ["session", sessionId] as const,
  turns: (sessionId: string) => ["turns", sessionId] as const,
  evaluation: (sessionId: string) => ["evaluation", sessionId] as const,
  transcript: (sessionId: string) => ["transcript", sessionId] as const,
  documents: (filters: { docType?: string } = {}) => ["documents", filters] as const,
  documentsRoot: () => ["documents"] as const,
  document: (documentId: string) => ["document", documentId] as const,
  account: () => ["account"] as const,
  capacity: () => ["capacity"] as const,
  apiKey: () => ["apiKey"] as const,
} as const;
