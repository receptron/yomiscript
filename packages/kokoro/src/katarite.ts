// The Kokoro Katarite behind the shared interface (core's Katarite): YomiScript in, audio and span times out.
import { parse, type Katarite, type SpanTime, type Speech } from "@yomiscript/core";
import type { Engine } from "./engine.ts";
import { plan, SR, type PlannedSection } from "./plan.ts";
import { join } from "./render.ts";

/** audio samples per duration step of Kokoro's predictor (24 kHz, 2 frames of 300 samples) */
export const SAMPLES_PER_STEP = 600;

function spanTimes(sec: PlannedSection, dur: number[], offset: number): SpanTime[] {
  // a unit lasts as long as its ids; a span from its first unit's start to its last unit's end
  const T = new Map<number, SpanTime>();
  let t = offset;
  sec.uid.forEach((k, i) => {
    const d = (dur[i] * SAMPLES_PER_STEP) / SR,
      span = k >= 0 ? sec.toks[k]?.span : undefined;
    if (span !== undefined) {
      const x = T.get(span);
      if (x) x.end = t + d;
      else T.set(span, { span, start: t, end: t + d });
    }
    t += d;
  });
  return [...T.values()];
}

export interface KokoroOptions {
  /** a voice (e.g. jm_kumo, or a blend a+b@0.3) for every section instead of each language's default */
  voice?: string;
}
export class KokoroKatarite implements Katarite {
  readonly name = "kokoro";
  readonly languages = ["ja", "en", "fr", "zh"] as const;
  private E: Engine;
  private voice?: string;
  constructor(engine: Engine, options: KokoroOptions = {}) {
    this.E = engine;
    this.voice = options.voice;
  }
  async speak(ys: string): Promise<Speech> {
    const P = plan(ys),
      audio: Float32Array[] = [],
      times: SpanTime[] = [];
    let offset = 0;
    for (const sec of P) {
      if (this.voice) sec.voice = this.voice;
      const r = await this.E.synthSection(sec);
      audio.push(r.audio);
      times.push(...spanTimes(sec, r.dur, offset)); // several sections: approximate, join() trims and adds a gap
      offset += r.audio.length / SR;
    }
    return { samples: audio.length === 1 ? audio[0] : join(audio), sampleRate: SR, texts: parse(ys).texts, times };
  }
}
