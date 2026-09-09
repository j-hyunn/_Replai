---
name: voice-text-dual-modality
description: "Design and build the audio pipeline for voice-based mock interviews together with the text chat fallback. Covers microphone capture, STT, TTS, turn detection (VAD), barge-in, latency budget, modality switching, and audio storage. Use this skill for any design, implementation, or revision request involving 'voice interview', 'microphone', 'recording', 'STT', 'TTS', 'real-time conversation', 'speech recognition', 'speech synthesis', 'text fallback', or 'modality switching'."
---

# Voice + Text Dual Modality — The Conversation Pipeline

Build an interview conversation pipeline where voice is the default and text is both a fallback and an equal input method.

## Guiding principle: text is the source of truth

```
[voice input] ──STT──┐
                     ├──> normalized utterance text ──> conversation log (canonical) ──> evaluation pipeline
[text input] ────────┘

[interviewer text] ──TTS──> audio playback (voice mode only)
```

Every utterance is normalized to text for storage. Audio files are attached as links. Only this structure lets both modalities share one evaluation pipeline and makes mid-session switching possible.

## Pipeline stages

```
1. Microphone permission & device selection  (getUserMedia)
2. Audio capture                             (MediaRecorder chunks or AudioWorklet PCM)
3. Turn detection                            (VAD silence detection + explicit "done answering" button)
4. STT                                       (streaming interim transcript → final transcript)
5. Utterance commit & storage                (canonical text + audio upload)
6. Interviewer response generation           (streamed text)
7. TTS                                       (sentence-level chunk synthesis → sequential playback)
8. Barge-in                                  (stop playback when the user speaks over it)
```

## Turn detection — what is special about interviews

Do not use default conversational VAD settings as-is. In an interview, **thinking silences are long.** Cutting a turn after one second of silence chops the user off mid-sentence.

- Set a generous silence threshold (2–3 seconds) and expose it as a constant so it can be tuned
- **Always offer an explicit "done answering" button.** Automatic detection is the assist, not the mechanism
- Show a visible countdown so the user can predict what will happen

## Latency budget (required deliverable)

Set a target for end-of-speech → start of interviewer audio and allocate it across stages.

| Stage | Target | Note |
|-------|--------|------|
| final transcript committed | ~300ms | with streaming STT most of this happens during speech |
| LLM first token | ~800ms | driven by model choice |
| TTS first audio | ~400ms | synthesize only the first sentence and start playback immediately |
| **Total target** | **under ~2s** | beyond this, a "thinking" indicator is mandatory |

The key technique is **sentence-level pipelining.** Waiting for the full LLM response before starting TTS doubles the latency. Hand the first sentence to TTS the moment it is complete, start playback, and append the rest behind it.

Send this table to `ai-interview-architect` (model selection) and `vercel-platform-engineer` (runtime selection).

## Fallback matrix (required deliverable)

Voice will fail. Define a path for every failure point.

| Failure point | Detection | Status shown to user | Alternate path |
|--------------|-----------|---------------------|----------------|
| microphone permission denied | `getUserMedia` rejects | "Microphone unavailable" + guidance | offer switch to text mode |
| no microphone / device busy | device enumeration result | same | text mode |
| STT connection dropped | socket/request error | "Reconnecting speech recognition" | retry → text mode on failure |
| empty STT result | blank transcript | "I couldn't hear that" | ask for the answer again |
| TTS failure | request error | show text without audio | continue the session with text only |
| unstable network | timeout | "Your connection is unstable" | move the session into the paused state |

**Never kill the session.** No failure may destroy an interview in progress. In the worst case, continue in text mode.

## UI state list (shared with the frontend)

Send these names verbatim to `shadcn-ui-engineer` and have the UI branch on the same names:

```
idle | requesting_permission | listening | transcribing | thinking | speaking | error | text_fallback
```

## Architecture choice: through the server vs direct from the browser

Serverless functions are ill-suited to long-lived bidirectional audio streams (execution ceilings, hard to hold state).

- **If real-time bidirectional streaming is required**: prefer a browser ↔ STT/TTS provider direct connection, with the server providing only a **short-lived token issuance endpoint**.
- **If the flow is turn-based (process after the utterance ends)**: going through the server is simpler and safer. Upload the audio chunk → transcribe → LLM → return a TTS URL.

Either way, **never put an API key in the client bundle.** If a direct connection is needed, send only a server-issued short-lived token to the browser.

Record the reason for your choice — it becomes the basis for judgment when providers change later.

## Audio storage

- Agree the bucket and path convention with `supabase-engineer` (e.g. `interview-audio/{userId}/{sessionId}/{turnId}.webm`)
- Access policy: only the owner may read. Do not put these in a public bucket
- State the retention policy (duration, handling deletion requests) in the spec — voice is personal data
- Tell the user recordings are stored and obtain consent before recording begins

## Deliverables

- `_workspace/03_voice_pipeline.md` — pipeline diagram, provider selection rationale, latency budget table, fallback matrix, UI state list
- During implementation: `src/lib/voice/`, voice hooks, token issuance route

When you swap providers, update the latency budget table and fallback matrix with it and notify the affected teammates.

---

## Output language

Write this skill's deliverables in **Korean**. Code identifiers stay English — table and column names, status enum values, type and field names, route paths, hook names, file names. Never translate a status value or a field name; that breaks the CHECK constraints and the API contract.

This skill file is written in English because harness instruction files are English. Do not mirror that into your output — the deliverables are Korean.

**Language affects provider selection.** The service runs in Korean, so evaluate STT and TTS providers on Korean quality — Korean recognition accuracy, handling of English technical terms mixed into Korean speech (a constant in engineering interviews), and natural Korean prosody. Set the recognition language explicitly rather than relying on auto-detection, which mis-fires on code-switched speech. Every status message shown to the user is Korean; the state names themselves (`listening`, `thinking`) are code identifiers and stay English.

---

## Where this skill sits

This skill covers one layer of the mock interview harness team. If a request spans multiple layers (spec, DB, API, UI, voice, QA), do not handle it with this skill alone — use `mock-interview-orchestrator` first and run it as a team. If the work is confined to a single layer, this skill alone is fine.
