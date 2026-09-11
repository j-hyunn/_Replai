import "server-only";

import { z } from "zod";

import { AXES, QUESTION_KINDS } from "@/lib/api/serialize";

/**
 * `<<<META>>>` 스트림 처리 — M1~M8 (`02_ai_contracts.md` 3.2절 · `05_api_contract.md` 5.3절).
 *
 * 면접관만 자유 텍스트 스트리밍입니다. 출력은 두 구역으로 나뉘고, **센티널 이후의 텍스트는
 * TTS로도 화면으로도 절대 나가지 않습니다**(M3).
 *
 * 이 파일의 핵심은 **보류(hold)** 입니다. 델타 경계에서 `<<<M` 같은 조각이 발화로 새면
 * 되돌릴 방법이 없으므로, 버퍼 끝의 최대 9자(`'<<<META>>>'.length - 1`)를 **항상 보류**했다가
 * 다음 델타와 합쳐 판정합니다. **보류분을 버리는 경로는 존재하지 않습니다**(M8).
 */

const SENTINEL = "<<<META>>>";
const MAX_HOLD = SENTINEL.length - 1;

/** 청크는 문장 단위 10~80자입니다. 종결 문자 기준으로 끊습니다. */
const MIN_CHUNK = 10;
const MAX_CHUNK = 80;
const SENTENCE_END = /[.!?。！？…]["')\]]?\s*/u;

export const INTERVIEWER_ACTIONS = [
  "follow_up",
  "next_main",
  "neutral_transition",
  "comfort",
  "wrap_up",
] as const;
export type InterviewerAction = (typeof INTERVIEWER_ACTIONS)[number];

const PROBE_KINDS = [
  "evidence",
  "counterexample",
  "alternative",
  "contradiction",
  "clarify",
  "none",
] as const;

/** `<<<META>>>` JSON 스키마 (`02_ai_contracts.md` 3.3절). 값은 영어 그대로입니다. */
export const interviewerMetaSchema = z.object({
  action: z.enum(INTERVIEWER_ACTIONS),
  question_kind: z.enum(QUESTION_KINDS).nullable().default(null),
  parent_question_id: z.uuid().nullable().default(null),
  target_question_id: z.uuid().nullable().default(null),
  target_axis: z.enum(AXES).nullable().default(null),
  probe_target: z.string().max(60).nullable().default(null),
  probe_kind: z.enum(PROBE_KINDS).default("none"),
  distress_detected: z.boolean().default(false),
  flags: z
    .object({
      injection_attempt_detected: z.boolean().default(false),
      injection_note: z.string().nullable().default(null),
    })
    .default({ injection_attempt_detected: false, injection_note: null }),
});

export type InterviewerMeta = z.infer<typeof interviewerMetaSchema>;

export type MetaParseResult = {
  meta: InterviewerMeta | null;
  /** M6 — 센티널이 끝내 오지 않았거나 JSON이 깨진 경우. **대화는 멈추지 않습니다.** */
  missing: boolean;
};

/**
 * 델타를 받아 확정된 발화 청크만 내보내는 상태 기계.
 *
 * 사용법:
 * ```ts
 * const parser = new MetaStreamParser();
 * for await (const delta of stream) for (const chunk of parser.push(delta)) emit(chunk);
 * for (const chunk of parser.finish()) emit(chunk);   // M8 — flush 후에 utterance_done
 * const { meta, missing } = parser.parseMeta();
 * ```
 */
export class MetaStreamParser {
  /** 아직 청크로 확정되지 않은 발화 텍스트. */
  private buffer = "";
  /** 센티널 부분 일치 방어용 보류분 (최대 9자). */
  private held = "";
  /** 센티널 통과 후에는 true. 이후 모든 텍스트는 제어 블록입니다(M3). */
  private metaMode = false;
  private metaRaw = "";
  /** 화면·TTS로 나간 발화 전문. `turns.transcript_text`의 원천입니다. */
  private spoken = "";

  push(delta: string): string[] {
    // M3 — 센티널을 이미 지났으면 어떤 것도 발화로 나가지 않습니다.
    if (this.metaMode) {
      this.metaRaw += delta;
      return [];
    }

    const s = this.held + delta;
    const index = s.indexOf(SENTINEL);

    // M1·M2 — 첫 번째 센티널만 유효합니다. 통과 후에는 재탐색하지 않습니다.
    if (index >= 0) {
      this.buffer += s.slice(0, index);
      this.metaMode = true;
      this.metaRaw = s.slice(index + SENTINEL.length);
      this.held = "";
      // 센티널 앞 텍스트는 남김없이 내보냅니다.
      return this.flush(true);
    }

    this.held = longestSentinelPrefixSuffix(s);
    this.buffer += s.slice(0, s.length - this.held.length);
    return this.flush(false);
  }

  /**
   * M8 — 스트림 종료 시의 보류분 처리. 중단(abort)으로 끊긴 경우도 동일합니다.
   *
   * 보류분이 센티널의 **진부분 문자열**이어도 **그대로 발화로 flush 합니다** — 스트림이 끝난
   * 이상 뒤에 붙을 델타가 없어 완성될 가능성이 0이고, 버리면 답변 마지막 글자가 조용히
   * 사라집니다. (`03_voice_pipeline.md` 7.2절 표의 "접두사이면 버린다"와 정반대이며,
   * **D17이 확정 결정이므로 M8을 구현합니다**.)
   */
  finish(): string[] {
    if (this.metaMode) return [];

    const index = this.held.indexOf(SENTINEL);
    if (index >= 0) {
      this.buffer += this.held.slice(0, index);
      this.metaMode = true;
      this.metaRaw = this.held.slice(index + SENTINEL.length);
    } else {
      this.buffer += this.held;
    }
    this.held = "";
    return this.flush(true);
  }

  /** 지금까지 확정된 발화 전문. 0자면 `turns` INSERT를 하지 않습니다(not null · 1자 이상). */
  spokenText(): string {
    return this.spoken;
  }

  /** M4 — `metaRaw.trim()`을 JSON으로 읽습니다. 코드펜스가 있으면 벗겨서 1회 재시도합니다. */
  parseMeta(): MetaParseResult {
    const raw = stripCodeFence(this.metaRaw.trim());
    if (raw.length === 0) return { meta: null, missing: true };

    try {
      const parsed = interviewerMetaSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) return { meta: null, missing: true };
      return { meta: parsed.data, missing: false };
    } catch {
      return { meta: null, missing: true };
    }
  }

  /**
   * 문장 종결 기준으로 청크를 끊습니다.
   *
   * **보류분을 포함한 상태로 종결을 판정하지 않습니다** — `...했습니다.<<<M` 상태에서
   * `...했습니다.`를 먼저 확정해 버리면, 다음 델타에서 센티널이 완성돼도 **이미 발화된
   * 텍스트를 되돌릴 수 없습니다.** `push()`가 `held`를 떼어 낸 뒤에만 이 함수를 부릅니다.
   */
  private flush(force: boolean): string[] {
    const chunks: string[] = [];

    for (;;) {
      const cut = findCut(this.buffer, force);
      if (cut === null) break;
      const chunk = this.buffer.slice(0, cut).trim();
      this.buffer = this.buffer.slice(cut);
      if (chunk.length > 0) {
        chunks.push(chunk);
        this.spoken += (this.spoken.length > 0 ? " " : "") + chunk;
      }
      if (this.buffer.length === 0) break;
    }

    return chunks;
  }
}

/** 종결 문자를 찾되, 10자 미만이면 더 모으고 80자를 넘으면 강제로 끊습니다. */
function findCut(buffer: string, force: boolean): number | null {
  if (buffer.length === 0) return null;

  const match = SENTENCE_END.exec(buffer);
  if (match && match.index + match[0].length >= MIN_CHUNK) {
    return match.index + match[0].length;
  }

  if (buffer.length >= MAX_CHUNK) {
    // 종결 문자가 없어도 80자에서는 끊습니다 — TTS가 한 덩어리를 너무 오래 기다리지 않게.
    const space = buffer.lastIndexOf(" ", MAX_CHUNK);
    return space > MIN_CHUNK ? space + 1 : MAX_CHUNK;
  }

  return force ? buffer.length : null;
}

/** `s`의 접미사 중 센티널의 **진부분 문자열**이 될 수 있는 가장 긴 것 (길이 ≤ 9). */
function longestSentinelPrefixSuffix(s: string): string {
  const max = Math.min(MAX_HOLD, s.length);
  for (let length = max; length > 0; length -= 1) {
    const suffix = s.slice(s.length - length);
    if (SENTINEL.startsWith(suffix)) return suffix;
  }
  return "";
}

function stripCodeFence(raw: string): string {
  if (!raw.startsWith("```")) return raw;
  const withoutOpen = raw.replace(/^```[a-zA-Z]*\s*/u, "");
  return withoutOpen.replace(/```\s*$/u, "").trim();
}
