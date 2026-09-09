---
name: git-github-workflow
description: "Git and GitHub conventions for this repository: branch strategy, commit message format, how to split work into pull requests, PR descriptions, CI expectations, and merge order. Use this skill whenever work is being committed, a branch is created, a pull request is opened or updated, CI fails, or changes need to reach main — and whenever a teammate finishes a unit of work that should land in the repository. Applies to 'commit', 'push', 'PR', 'pull request', 'merge', 'branch', 'CI failed', 'deploy to main'."
---

# Git & GitHub Workflow

How work leaves an agent's hands and lands in the repository. This repo is developed solo, so the conventions optimize for a reviewable history rather than for gatekeeping.

## Branch strategy

```
main                    always deployable. Vercel production builds from it
└── claude/{topic}      one branch per unit of work
```

- Branch from the latest `main`. Never branch from another feature branch — it makes the eventual merge order ambiguous.
- One branch does one thing. "Add evaluation API" is a branch; "build the whole service" is not.
- `main` is never committed to directly. Even solo, going through a PR gives you the CI run and the Vercel preview, which is the entire point.

## Commit messages

```
<type>(<scope>): <subject in the imperative>

<body: why, not what — the diff already says what>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`.
Scopes for this project: `interview`, `evaluation`, `voice`, `auth`, `db`, `api`, `ui`, `harness`, `ci`.

```
feat(voice): add text fallback when microphone permission is denied

A denied permission previously left the session stuck in requesting_permission
with no way forward. The session now transitions to text_fallback and continues,
since losing an in-progress interview is worse than losing the voice modality.
```

Write the body whenever the reason is not obvious from the diff. A commit that changes a threshold, a model choice, or a fallback path always needs one — those are the commits you will interrogate months later.

## What belongs in one commit

Commit at the boundary of a working change, not at the end of a session. A commit that touches a migration, three API routes, two hooks, and the report screen cannot be reverted or bisected.

Split when: the migration is one commit and its consumers are another; a refactor is separate from the behavior change riding on it; a fix is separate from the feature that exposed it.

**Never commit:** `.env*` files, Supabase service_role keys, AI provider keys, generated `node_modules`, `.next/`, audio recordings or transcripts used in testing (they are personal data). If a secret is ever committed, rotating the key is mandatory — removing it from history is not sufficient, because the value was already pushed.

## Pull requests

One PR per coherent change. Reviewing your own PR is still worth it: the diff view catches leftover debug code, stray `any` casts, and files you did not mean to stage.

The PR description follows `.github/pull_request_template.md`. Fill in the boundary section honestly — it is the part that matters. When a PR changes an API response shape, a DB column, a status value, or an AI contract schema, say so explicitly, because those are the changes that break something on the other side of a boundary.

Open the PR as a draft while work is in progress. Mark it ready when CI is green and the Vercel preview renders.

## CI

`.github/workflows/ci.yml` runs on every PR and on pushes to `main`:

| Job | What it checks |
|-----|---------------|
| `harness-check` | every agent and skill file has valid frontmatter, and CLAUDE.md still points at the change log |
| `app-check` | typecheck, lint, and build — skipped automatically until the app is scaffolded |

When CI fails, read the failing step's log before changing anything. The failure modes to expect here:

- **Type error at a boundary** — usually a real contract mismatch, not a typing nuisance. Fix the contract, do not add a cast to make it pass. Silencing it here is exactly the bug `qa-inspector` exists to catch.
- **Build succeeds locally but fails in CI** — almost always an environment variable that exists in your shell and not in the CI environment, or a case-sensitive import path that macOS forgave.
- **harness-check fails** — a skill or agent file lost its frontmatter, usually from an edit that clipped the leading `---`.

Never merge with CI red, and never disable a check to get a merge through. If a check is wrong, fix the check in its own commit and say why.

## Vercel previews

Every PR gets a preview deployment. Use it — for this service, the things that break are voice permissions, streaming, and auth redirects, none of which are visible in a diff. Check the preview before merging anything that touches the session screen or the auth flow.

Preview deployments run against the same Supabase project unless you configured a separate one, so treat data written from a preview as real.

## Merge

Squash merge. The branch's intermediate commits are working notes; `main` should read as one deliberate change per entry. Keep the squash subject in the commit format above rather than accepting the default "Merge pull request #N".

Delete the branch after merging. Stale branches accumulate quickly when each unit of work gets its own.

## Merge order under boundary changes

When several branches are in flight, merge in dependency order: migration first, then the API that reads it, then the UI that calls the API. Merging the consumer first puts `main` in a state where the deployed app queries a column that does not exist yet.

If that order is impossible, the change must be backward compatible — add the new column before removing the old one, and keep the API accepting both shapes for one merge cycle.

---

## Output language

Commit messages, PR titles, and PR descriptions are written in **English**, matching the harness instruction files and the conventional-commit format. Everything else follows the project language policy: `_workspace/` deliverables, runtime prompts, and UI copy are Korean.

Code identifiers stay English everywhere — branch names, scopes, and status values included.

---

## Where this skill sits

Every teammate uses this skill; it is not owned by one member. Whoever produces a change that should land in the repository follows these conventions. If a request spans multiple layers of the service itself, use `mock-interview-orchestrator` first and run it as a team.
