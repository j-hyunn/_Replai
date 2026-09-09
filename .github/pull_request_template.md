## What this changes

<!-- One or two sentences. Why, not just what. -->

## Boundary impact

Check anything this PR changes. These are the changes that break the other side of a
boundary, so be honest here even when the change looks small.

- [ ] API response shape (an endpoint's returned object changed)
- [ ] DB schema (table, column, or CHECK constraint)
- [ ] Session status values or allowed transitions
- [ ] AI contract schema (`_workspace/02_ai_contracts.md`)
- [ ] Voice pipeline state names
- [ ] Route paths (a page moved, was added, or was removed)
- [ ] Environment variables (added, renamed, or removed)
- [ ] None of the above

If any box above is checked, list what has to change on the other side:

<!-- e.g. useEvaluation now unwraps { evaluation }; migration 004 adds evaluations.total_score -->

## Verification

- [ ] CI is green
- [ ] Vercel preview renders and the changed screens work
- [ ] Voice path checked in the preview (only if this touches the session screen or voice)
- [ ] Auth redirect checked in the preview (only if this touches auth or middleware)

## Notes

<!-- Anything left undone, a follow-up needed, or a decision that should be revisited. -->
