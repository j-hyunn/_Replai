---
name: Bug report
about: Something behaves incorrectly at runtime
labels: bug
---

## What happened

## What should have happened

## Where

- [ ] Voice pipeline (mic, STT, TTS, turn detection)
- [ ] Interview session (streaming, conversation flow)
- [ ] Evaluation (scoring, report generation)
- [ ] Auth / session
- [ ] Database / RLS
- [ ] UI / routing
- [ ] Not sure

## Reproduction

1.
2.
3.

## Boundary suspicion

Most runtime bugs in this project live at a boundary. If you know which, note it —
API response vs frontend hook type, link vs real route, state transition missing in code,
DB field vs API field name.

## Environment

- Where: local / Vercel preview / production
- Modality: voice / text
- Browser:
