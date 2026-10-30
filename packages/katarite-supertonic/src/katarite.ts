// The Supertonic Katarite behind the shared interface (core's Katarite): YomiScript in, audio out. The engine reads
// text, so it is given the original text of each span with kana where the reading could go wrong (text.ts, D23).
import { parse, type Katarite, type Speech } from "@mulmovoice/core";
import { DEFAULTS, type SupertonicEngine } from "./engine.ts";
import { SUPERTONIC_LANGUAGES, UNKNOWN_LANGUAGE } from "./preprocess.ts";
import { toText, type HintRule } from "./text.ts";

export interface KatariteOptions {
  voice?: string;
  steps?: number;
  speed?: number;
  rule?: HintRule;
}
const SUPPORTED = new Set<string>(SUPERTONIC_LANGUAGES);

export class SupertonicKatarite implements Katarite {
  readonly name = "supertonic";
  readonly languages = SUPERTONIC_LANGUAGES;
  private E: SupertonicEngine;
  private ambiguous: ReadonlySet<string>;
  private opts: KatariteOptions;
  constructor(engine: SupertonicEngine, ambiguous: ReadonlySet<string>, opts: KatariteOptions = {}) {
    this.E = engine;
    this.ambiguous = ambiguous;
    this.opts = opts;
  }
  /** the text the engine is given for a YomiScript */
  text(ys: string): string {
    return toText(ys, this.ambiguous, this.opts.rule);
  }
  async speak(ys: string): Promise<Speech> {
    const u = parse(ys),
      primary = u.top.split("-")[0];
    const r = await this.E.synthesize(this.text(ys), {
      lang: SUPPORTED.has(primary) ? primary : UNKNOWN_LANGUAGE,
      voice: this.opts.voice ?? DEFAULTS.voice,
      steps: this.opts.steps ?? DEFAULTS.steps,
      speed: this.opts.speed ?? DEFAULTS.speed,
    });
    // times: none. Supertonic predicts only the length of the whole utterance and aligns text and speech inside the
    // model by attention, so there is no reliable time for each span.
    return { samples: r.samples, sampleRate: r.sampleRate, texts: u.texts, times: [] };
  }
}
