// The Kokoro Katarite in the browser: onnxruntime-web with the w16 models (D24), loaded once and shared by every
// tool result. Where the models, voices and onnxruntime's wasm files are served from is set with configureSpeaker().
import * as ort from "onnxruntime-web";
import type { Speech } from "@yomiscript/core";
import { Engine, KokoroKatarite, W16, type Ort } from "@yomiscript/kokoro";

export interface SpeakerOptions {
  /** URL of the directory with models/<part>_w16.onnx and voices/<voice>.bin */
  modelBase: string;
  /** URL of onnxruntime-web's dist/ (its .wasm and .mjs files); unset: onnxruntime-web's own default */
  ortWasmBase?: string;
  /** onnxruntime execution providers, ["wasm"] by default (["webgpu", "wasm"] to try WebGPU first) */
  executionProviders?: string[];
}
let options: SpeakerOptions = { modelBase: "/kokoro/" };
let katarite: Promise<KokoroKatarite> | null = null;
const cache = new Map<string, Promise<Speech>>();

export function configureSpeaker(o: Partial<SpeakerOptions>): void {
  options = { ...options, ...o };
  katarite = null;
  cache.clear();
}
export function speakerOptions(): Readonly<SpeakerOptions> {
  return options;
}
const absolute = (base: string): URL => new URL(base.endsWith("/") ? base : base + "/", globalThis.location?.href ?? "http://localhost/");

/** the Katarite, created on first use (downloads about 165 MB of models the first time; the browser caches them) */
export function loadKatarite(): Promise<KokoroKatarite> {
  katarite ??= (async () => {
    if (options.ortWasmBase) ort.env.wasm.wasmPaths = absolute(options.ortWasmBase).href;
    ort.env.wasm.numThreads = 1; // no cross-origin isolation needed
    const base = absolute(options.modelBase);
    const load = async (p: string): Promise<Uint8Array> => {
      const r = await fetch(new URL(p, base));
      if (!r.ok) throw new Error(`cannot load ${p}: HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    };
    const engine = await new Engine(ort as unknown as Ort, load).init({ suffix: W16, executionProviders: options.executionProviders ?? ["wasm"] });
    return new KokoroKatarite(engine);
  })();
  katarite.catch(() => (katarite = null)); // a failed load can be retried
  return katarite;
}

/** the speech for a YomiScript, synthesized once and kept for replays */
export function synthesize(ys: string): Promise<Speech> {
  let s = cache.get(ys);
  if (!s) {
    s = loadKatarite().then((k) => k.speak(ys));
    cache.set(ys, s);
    s.catch(() => cache.delete(ys));
  }
  return s;
}

let ctx: AudioContext | null = null;
export interface Playback {
  /** AudioContext time when the audio started */
  startedAt: number;
  context: AudioContext;
  stop(): void;
  ended: Promise<void>;
}
/** plays the speech; throws when the browser does not allow audio yet (no user gesture) */
export async function play(speech: Speech): Promise<Playback> {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  if (ctx.state !== "running") throw new Error("audio is not allowed yet: press play");
  const buf = ctx.createBuffer(1, speech.samples.length, speech.sampleRate);
  buf.copyToChannel(Float32Array.from(speech.samples), 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  const ended = new Promise<void>((resolve) => (src.onended = () => resolve()));
  const startedAt = ctx.currentTime + 0.05;
  src.start(startedAt);
  return { startedAt, context: ctx, stop: () => src.stop(), ended };
}
