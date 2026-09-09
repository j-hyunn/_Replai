---
name: shadcn-only-ui
description: "Build the frontend using shadcn/ui exclusively. Covers screens, components, data-fetching hooks, streaming response display, voice state UI, the evaluation report screen, accessibility, and theme token usage. This project's UI is shadcn-only and no other UI library may be introduced. Use this skill for any implementation or revision request involving 'build a screen', 'component', 'UI', 'page', 'hook', 'design', or 'shadcn'."
---

# Shadcn-Only UI — Building the Frontend

Every UI in this project is built with shadcn/ui only. This is an absolute constraint set by the user.

## Absolute constraint

| Allowed | Prohibited |
|---------|-----------|
| Components added via `npx shadcn@latest add <component>` | MUI, Ant Design, Chakra, Mantine, DaisyUI, Bootstrap, and every other replacement UI library |
| Composing directly from Radix primitives + Tailwind + `cn()` | Installing a new UI library |
| shadcn theme tokens (CSS variables) | Hardcoded color values (`#3b82f6`, `bg-[#fff]`) |
| lucide-react icons | Installing another icon pack |

If shadcn does not have a component you need, **do not install a library** — build it from Radix + Tailwind following the `components/ui/` convention. shadcn itself is built that way, so consistency is preserved.

Hardcoded colors are banned because dark mode and theming break immediately and the whole app has to be recolored later. Use tokens like `bg-background`, `text-muted-foreground`, `border-border`.

If you believe the constraint makes something impossible, report it to the leader rather than working around it.

## Never guess an API response type

```ts
// Prohibited — this only declares the type you want; it says nothing about the actual response
const sessions = await fetchJson<Session[]>("/api/sessions");

// Correct — reflects the real shape recorded in the contract table
const { sessions } = await fetchJson<{ sessions: Session[] }>("/api/sessions");
```

Read `_workspace/05_api_contract.md` and match the types. When it is unclear, confirm with `vercel-platform-engineer` via SendMessage. A generic is a claim rather than a check, so a wrong one still compiles and breaks at runtime.

Maintain the hook table in `_workspace/06_ui_plan.md`:

| Hook | Endpoint called | Expected response type |
|------|----------------|------------------------|
| `useSessions` | `GET /api/sessions` | `{ sessions: Session[] }` |

## Check links against real routes

Values in `href` and `router.push()` must match the URLs produced by real page files under `src/app/`.

- A route group `(dashboard)` does **not** appear in the URL
- Nested directories add prefixes: `app/dashboard/sessions/[id]/page.tsx` → `/dashboard/sessions/{id}`
- Every time you write a link, confirm the matching page file actually exists. A link that skips this check silently 404s while the build passes

## Displaying streamed responses

The interviewer's response is streamed:
- Consume it as a stream. Never call `res.json()` on it
- Render tokens as they arrive, with a cursor or indicator showing it is in progress
- Show mid-stream errors and offer a retry path
- Do not force auto-scroll if the user has scrolled up

## Voice UI states

Use the state names defined by `voice-pipeline-engineer` **verbatim**:

```
idle | requesting_permission | listening | transcribing | thinking | speaking | error | text_fallback
```

Give every state a visible representation. A user who cannot tell whether the microphone is listening or the AI is thinking gets anxious and stops talking.

- `listening`: input level visualization + "done answering" button + silence countdown
- `transcribing`: show the interim transcript, dimmed
- `thinking` / `speaking`: clearly distinguished
- `error` / `text_fallback`: explain in a sentence what failed and how things are proceeding now

## Text mode and voice mode share one tree

The conversation log must render identically regardless of modality. **Build it so only the input area is swappable.** Splitting the two modes into separate pages makes mid-session switching impossible and doubles maintenance.

## Loading and error states from the start

AI responses take seconds and do fail. Include skeletons, indicators, error states, and retry buttons in the component design rather than bolting them on later — bolting them on means redesigning the state structure.

## The evaluation report screen

- **Always show scores together with their evidence quotes.** A bare score is unconvincing and gives the user nothing to act on
- Present per-axis scores as a table or visualization, and improvement suggestions as an actionable list
- Provide a path back to the original answer

## Accessibility

- Every interaction must be possible via keyboard. Even a voice UI must be fully usable without a microphone
- Announce state changes to screen readers, not just visually (live region)
- Audio content always has a text alternative — which this service satisfies naturally, since the transcript is canonical

## Deliverables

- `_workspace/06_ui_plan.md` — route tree, shadcn components per screen, hook ↔ endpoint mapping table
- Implementation: `src/app/**/page.tsx`, `src/components/`, `src/hooks/`

Request verification from `qa-inspector` as soon as a screen is finished. Do not cover type errors with `any` — they usually signal a real contract mismatch.

---

## Output language

Write this skill's deliverables in **Korean**. Code identifiers stay English — table and column names, status enum values, type and field names, route paths, hook names, file names. Never translate a status value or a field name; that breaks the CHECK constraints and the API contract.

This skill file is written in English because harness instruction files are English. Do not mirror that into your output — the deliverables are Korean.

**All UI copy is Korean** — labels, buttons, empty states, error messages, and voice status text. Component names, prop names, hook names, and route paths stay English. Check that Korean text does not break layouts: it wraps differently from English, and buttons sized for English labels overflow.

---

## Where this skill sits

This skill covers one layer of the mock interview harness team. If a request spans multiple layers (spec, DB, API, UI, voice, QA), do not handle it with this skill alone — use `mock-interview-orchestrator` first and run it as a team. If the work is confined to a single layer, this skill alone is fine.
