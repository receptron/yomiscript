// The Supertonic 3 ONNX engine (text encoder, duration predictor, flow-matching vector estimator, vocoder), as its
// Python SDK runs it (supertonic 1.3.1, core.py Supertonic and pipeline.py TTS.synthesize). It takes the onnxruntime
// module and a byte loader, so the same code runs on onnxruntime-web (browser) and onnxruntime-node (CLI, MCP).
import type { InferenceSession, Tensor } from "onnxruntime-common";
import { chunkText, preprocess, textIds, unsupported, type Indexer } from "./preprocess.ts";

/** the parts of onnxruntime this engine uses (onnxruntime-web and onnxruntime-node both have them) */
export interface Ort {
  InferenceSession: { create(model: Uint8Array | ArrayBuffer, options?: InferenceSession.SessionOptions): Promise<InferenceSession> };
  Tensor: new (type: "float32" | "int64", data: Float32Array | BigInt64Array, dims: readonly number[]) => Tensor;
}
/** reads a file of the model directory (onnx/…, voice_styles/…) as bytes */
export type LoadBytes = (path: string) => Promise<Uint8Array | ArrayBuffer>;
export interface EngineOptions {
  executionProviders?: string[];
}
export interface Style {
  ttl: Tensor;
  dp: Tensor;
}
export interface SynthesisOptions {
  /** a Supertonic language code (SUPERTONIC_LANGUAGES, or "na") */
  lang: string;
  /** a voice style in voice_styles/ (F1–F5, M1–M5) */
  voice?: string;
  /** flow-matching steps (the SDK's total_steps, 1–100) */
  steps?: number;
  /** speech speed (0.7–2.0) */
  speed?: number;
  /** characters per chunk; the SDK's default is 300, 120 for Korean */
  maxChunkLength?: number;
  /** silence between chunks, in seconds */
  silence?: number;
  /** the initial noise of a chunk: n standard-normal values (default: crypto random, Box–Muller); for reproducible output */
  noise?: (n: number, chunk: number) => Float32Array;
}
export interface SupertonicSynthesis {
  samples: Float32Array;
  sampleRate: number;
  /** the predicted duration of each chunk in seconds, after speed */
  durations: number[];
  /** the chunks of text that were synthesized */
  chunks: string[];
}
export const DEFAULTS = { voice: "F1", steps: 8, speed: 1.05, silence: 0.3 } as const;

interface Config {
  sampleRate: number;
  baseChunkSize: number;
  chunkCompressFactor: number;
  latentDim: number;
}
const f32 = Math.fround;
const decode = (b: Uint8Array | ArrayBuffer): unknown => JSON.parse(new TextDecoder().decode(b));

// uniform in (0, 1) from the platform's random source (crypto, in Node and in browsers)
function uniforms(n: number): Float64Array {
  const u = crypto.getRandomValues(new Uint32Array(n));
  return Float64Array.from(u, (x) => (x + 0.5) / 2 ** 32);
}
/** standard-normal values, Box–Muller */
export function gaussian(n: number): Float32Array {
  const out = new Float32Array(n),
    u = uniforms(n + (n % 2));
  for (let i = 0; i < n; i += 2) {
    const r = Math.sqrt(-2 * Math.log(u[i]));
    out[i] = r * Math.cos(2 * Math.PI * u[i + 1]);
    if (i + 1 < n) out[i + 1] = r * Math.sin(2 * Math.PI * u[i + 1]);
  }
  return out;
}

/** latent sizes from a duration, in float32 as numpy computes them (dur, wav length, latent length) */
export function latentSize(dur: number, cfg: Config): { wavLength: number; latentLength: number; maskLength: number } {
  const chunk = cfg.baseChunkSize * cfg.chunkCompressFactor,
    wav = f32(dur * cfg.sampleRate),
    wavLength = Math.trunc(wav);
  return { wavLength, latentLength: Math.trunc(f32(f32(wav + chunk - 1) / chunk)), maskLength: Math.floor((wavLength + chunk - 1) / chunk) };
}

export class SupertonicEngine {
  private ort: Ort;
  private load: LoadBytes;
  private sessions!: Record<"dp" | "enc" | "vec" | "voc", InferenceSession>;
  private styles: Record<string, Style> = {};
  private indexer!: Indexer;
  cfg!: Config;
  constructor(ort: Ort, load: LoadBytes) {
    this.ort = ort;
    this.load = load;
  }
  async init(opts: EngineOptions = {}): Promise<this> {
    const tts = decode(await this.load("onnx/tts.json")) as {
      ae: { sample_rate: number; base_chunk_size: number };
      ttl: { chunk_compress_factor: number; latent_dim: number };
    };
    this.cfg = {
      sampleRate: tts.ae.sample_rate,
      baseChunkSize: tts.ae.base_chunk_size,
      chunkCompressFactor: tts.ttl.chunk_compress_factor,
      latentDim: tts.ttl.latent_dim,
    };
    this.indexer = decode(await this.load("onnx/unicode_indexer.json")) as Indexer;
    const options: InferenceSession.SessionOptions = {
      executionProviders: opts.executionProviders ?? ["wasm"],
      graphOptimizationLevel: "all",
      executionMode: "sequential",
    };
    const mk = async (f: string) => this.ort.InferenceSession.create(await this.load(`onnx/${f}.onnx`), options);
    this.sessions = { dp: await mk("duration_predictor"), enc: await mk("text_encoder"), vec: await mk("vector_estimator"), voc: await mk("vocoder") };
    return this;
  }
  async style(name: string): Promise<Style> {
    if (this.styles[name]) return this.styles[name];
    const j = decode(await this.load(`voice_styles/${name}.json`)) as Record<"style_ttl" | "style_dp", { dims: number[]; data: unknown }>;
    const t = (x: { dims: number[]; data: unknown }) =>
      new this.ort.Tensor("float32", Float32Array.from((x.data as number[]).flat(Infinity) as number[]), x.dims);
    this.styles[name] = { ttl: t(j.style_ttl), dp: t(j.style_dp) };
    return this.styles[name];
  }
  /** the characters of text the model cannot read */
  unsupported(text: string): string[] {
    return unsupported(text, this.indexer);
  }
  async synthesize(text: string, opts: SynthesisOptions): Promise<SupertonicSynthesis> {
    const o = { ...DEFAULTS, ...opts };
    if (!text.trim()) throw new Error("Text cannot be empty");
    const bad = this.unsupported(text);
    if (bad.length) throw new Error(`Supertonic cannot read ${bad.length} character(s): ${bad.join(" ")}`);
    const style = await this.style(o.voice),
      chunks = chunkText(text, o.maxChunkLength ?? (o.lang === "ko" ? 120 : 300));
    const parts: Float32Array[] = [],
      durations: number[] = [];
    for (const [i, chunk] of chunks.entries()) {
      const r = await this.infer(chunk, style, o, (n) => (o.noise ? o.noise(n, i) : gaussian(n)));
      parts.push(r.wav);
      durations.push(r.dur);
    }
    return { samples: concatenate(parts, Math.trunc(o.silence * this.cfg.sampleRate)), sampleRate: this.cfg.sampleRate, durations, chunks };
  }
  /** one chunk: text ids -> duration -> noisy latent -> denoised in `steps` steps -> waveform */
  async infer(
    chunk: string,
    style: Style,
    o: Required<Pick<SynthesisOptions, "lang" | "steps" | "speed">>,
    noise: (n: number) => Float32Array,
  ): Promise<{ wav: Float32Array; dur: number }> {
    const T = this.ort.Tensor,
      S = this.sessions;
    const ids = textIds(preprocess(chunk, o.lang), this.indexer);
    const text_ids = new T("int64", BigInt64Array.from(ids, BigInt), [1, ids.length]),
      text_mask = new T("float32", new Float32Array(ids.length).fill(1), [1, 1, ids.length]);
    const dp = await S.dp.run({ text_ids, style_dp: style.dp, text_mask });
    const dur = f32((dp[S.dp.outputNames[0]].data as Float32Array)[0] / f32(o.speed));
    const enc = await S.enc.run({ text_ids, style_ttl: style.ttl, text_mask });
    const text_emb = enc[S.enc.outputNames[0]];
    const { latentLength, maskLength } = latentSize(dur, this.cfg),
      dim = this.cfg.latentDim * this.cfg.chunkCompressFactor;
    const mask = Float32Array.from({ length: latentLength }, (_, t) => (t < maskLength ? 1 : 0));
    let x = noise(dim * latentLength).map((v, i) => v * mask[i % latentLength]);
    const latent_mask = new T("float32", mask, [1, 1, latentLength]),
      total_step = new T("float32", Float32Array.of(o.steps), [1]);
    for (let step = 0; step < o.steps; step++) {
      const r = await S.vec.run({
        noisy_latent: new T("float32", x, [1, dim, latentLength]),
        text_emb,
        style_ttl: style.ttl,
        text_mask,
        latent_mask,
        current_step: new T("float32", Float32Array.of(step), [1]),
        total_step,
      });
      x = Float32Array.from(r[S.vec.outputNames[0]].data as Float32Array);
    }
    const voc = await S.voc.run({ latent: new T("float32", x, [1, dim, latentLength]) });
    return { wav: Float32Array.from(voc[S.voc.outputNames[0]].data as Float32Array), dur };
  }
}

function concatenate(parts: Float32Array[], gap: number): Float32Array {
  // the chunks with `gap` zero samples between them
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0) + gap * (parts.length - 1));
  let at = 0;
  for (const [i, p] of parts.entries()) {
    out.set(p, at);
    at += p.length + (i < parts.length - 1 ? gap : 0);
  }
  return out;
}
