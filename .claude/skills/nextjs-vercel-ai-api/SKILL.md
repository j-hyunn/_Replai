---
name: nextjs-vercel-ai-api
description: "Design and build the Next.js App Router server layer and Vercel deployment. Covers API routes and server actions, AI response streaming, asynchronous handling of long-running work, runtime and maxDuration selection, environment variable separation, auth middleware, and deployment configuration. Use this skill for any design, implementation, or revision request involving 'build an API', 'endpoint', 'server action', 'streaming', 'timeout', 'deployment', 'environment variables', or 'Vercel'."
---

# Next.js + Vercel AI API — Building the Server Layer

AI calls are slow, expensive, and failure-prone. Design the API on that premise.

## Required deliverable: the API contract table

Update this table in `_workspace/05_api_contract.md` every time you add an endpoint. **The matching-hook column is QA's cross-check baseline.**

| Method | Path | Request | Response shape | Streaming | Est. latency | Matching hook |
|--------|------|---------|---------------|-----------|--------------|---------------|
| POST | `/api/sessions` | `{ jobRole, modality }` | `{ session: Session }` | no | ~200ms | `useCreateSession` |
| POST | `/api/sessions/[id]/turns` | `{ transcript }` | text/event-stream | yes | first token ~800ms | `useInterviewStream` |
| POST | `/api/sessions/[id]/evaluate` | — | `202 { status: "evaluating" }` | no | ~200ms | `useStartEvaluation` |
| GET | `/api/sessions/[id]/evaluation` | — | `{ evaluation: Evaluation \| null }` | no | ~150ms | `useEvaluation` |

## Match response shapes to the frontend

This is where the most expensive bugs in this project come from. The classic pattern:

```ts
// API
return NextResponse.json({ sessions });          // { sessions: Session[] }

// hook — compiles fine, then "sessions.filter is not a function" at runtime
const sessions = await fetchJson<Session[]>("/api/sessions");
```

A generic type parameter is **a claim, not a check.** Rules:
- Always wrap responses in an object (`{ sessions: [...] }`). A top-level array cannot gain fields later.
- If you wrapped it, the frontend must unwrap it. Write the exact shape in the contract table and send the full text to `shadcn-ui-engineer`.
- Convert snake_case → camelCase **once, in the API route.** Converting again in the frontend or the DB layer means nobody knows where the change happens.

## Separate the immediate response from the final result

Overall evaluation takes a long time. Holding the request open hits the function execution ceiling.

```
POST /api/sessions/[id]/evaluate
  → set status to 'evaluating'
  → start the evaluation work in the background
  → return 202 { status: "evaluating" } immediately

Result delivery: Realtime subscription (preferred) or polling GET /api/sessions/[id]/evaluation
```

**Define the immediate response type and the final result type as separate types.** Merging them lets the frontend read `evaluation.axes` off the immediate response and crash. List both responses in the contract table.

If work must continue after the response is sent, use the platform's `waitUntil`-style API. A promise you never awaited can be cut off when the function terminates.

## Streaming

Stream the interviewer's response. Getting the first token out early sharply reduces perceived latency.

- Server: return the AI SDK's stream response directly, or pipe it through a `ReadableStream`.
- Frontend: consume it as a stream. **Never call `res.json()` on a streaming response.** The "Streaming" column of the contract table exists to prevent this.
- Surface mid-stream errors to the client in a form it can detect (an error event or a termination marker).

## Runtime and execution time

- Track each route's execution profile in the "Est. latency" column, and design anything approaching the ceiling as asynchronous from the start.
- Explicitly select the Node runtime for routes that need long streaming or Node APIs.
- Set `maxDuration` per route and record why you chose that value in `_workspace/05_deploy.md`.
- The platform's exact limits vary by plan, so do not write them from memory — record the value you confirmed and its source.

## Environment variables

| Variable | Exposure | Note |
|----------|----------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | client | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | assumes RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | bypasses RLS. Never expose |
| `ANTHROPIC_API_KEY` | **server only** | never expose |
| STT/TTS provider keys | **server only** | issue short-lived tokens if the browser needs direct access |

A variable prefixed with `NEXT_PUBLIC_` is **baked into the browser bundle as a string at build time.** Giving that prefix to an AI key is an immediate, irreversible leak. Never call an AI provider directly from a client component.

## Authentication

- Define protected routes in `middleware.ts` and refresh the Supabase session there. Skipping the cookie refresh causes sessions to expire silently.
- **Re-check the user in every API route.** Passing middleware does not prove resource ownership. `/api/sessions/[id]` must confirm the session belongs to the requester (verify in code even with RLS in place, since service_role paths bypass it).

## AI call failure handling

- Apply exponential backoff retries for rate limits and transient errors. Distinguish retryable errors from ones that should fail immediately (auth failure, invalid model name).
- When retries are exhausted, move the session into the failure state defined in the state machine and record the reason. Swallowing the error silently leaves the user waiting forever.
- If a model ID or API parameter is uncertain, consult the `claude-api` skill rather than guessing.

## Do not paper over type errors with casts

A passing build is not a passing runtime. Any place you punched through with `any` or a forced cast is usually a real contract mismatch — and the first place QA looks.

## Deliverables

- `_workspace/05_api_contract.md` — the contract table above plus the full text of each response shape
- `_workspace/05_deploy.md` — environment variables (server vs public), runtime and maxDuration rationale, deployment procedure
- Implementation: `src/app/api/**/route.ts`, `src/lib/ai/`, `middleware.ts`

The moment an endpoint is finished, send its response shape to `shadcn-ui-engineer` and a verification request to `qa-inspector`. Do not wait for everything to be done.

---

## Output language

Write this skill's deliverables in **Korean**. Code identifiers stay English — table and column names, status enum values, type and field names, route paths, hook names, file names. Never translate a status value or a field name; that breaks the CHECK constraints and the API contract.

This skill file is written in English because harness instruction files are English. Do not mirror that into your output — the deliverables are Korean.

---

## Where this skill sits

This skill covers one layer of the mock interview harness team. If a request spans multiple layers (spec, DB, API, UI, voice, QA), do not handle it with this skill alone — use `mock-interview-orchestrator` first and run it as a team. If the work is confined to a single layer, this skill alone is fine.
