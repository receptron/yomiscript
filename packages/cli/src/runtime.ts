// What the Node apps (this CLI, the MCP server) share: where the models are, the Katarites by name, WAV files and
// local playback. Each Katarite is loaded on demand, so a YomiScript error is reported before any model is read.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse, type Katarite, type Speech } from "@mulmovoice/core";
import { wav } from "@mulmovoice/katarite-kokoro";

export type ModelPrecision = "fp32" | "w16";
export interface KatariteOptions {
  /** directory with models/ and voices/; default: $MULMOVOICE_MODELS, then ~/.cache/mulmovoice/kokoro */
  models?: string;
  /** fp32 (identical to the original Kokoro, the default in Node) or w16 (fp16 weights, as in the browser) */
  model?: ModelPrecision;
  /** a voice for every section (Kokoro: e.g. jm_kumo), instead of each language's default */
  voice?: string;
}
export type KatariteFactory = (opts: KatariteOptions) => Promise<Katarite>;

export function modelsDir(opt?: string, env: NodeJS.ProcessEnv = process.env): string {
  return opt ?? env.MULMOVOICE_MODELS ?? path.join(os.homedir(), ".cache", "mulmovoice", "kokoro");
}

async function kokoro(opts: KatariteOptions): Promise<Katarite> {
  // loaded here, not at the top: onnxruntime-node is only needed once something is spoken
  const { nodeEngine } = await import("@mulmovoice/katarite-kokoro/node");
  const { KokoroKatarite } = await import("@mulmovoice/katarite-kokoro");
  const dir = modelsDir(opts.models);
  try {
    await fs.access(path.join(dir, "models"));
  } catch {
    throw new Error(`no Kokoro models in ${dir} (expected models/ and voices/; set MULMOVOICE_MODELS or --models)`);
  }
  return new KokoroKatarite(await nodeEngine({ dir, model: opts.model ?? "fp32" }), { voice: opts.voice });
}
/** Supertonic's models: $MULMOVOICE_SUPERTONIC, then ~/.cache/supertonic3 (where its Python SDK caches them) */
export function supertonicDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.MULMOVOICE_SUPERTONIC ?? path.join(os.homedir(), ".cache", "supertonic3");
}

async function supertonic(): Promise<Katarite> {
  const { nodeSupertonic } = await import("@mulmovoice/katarite-supertonic/node");
  const dir = supertonicDir();
  try {
    await fs.access(path.join(dir, "onnx"));
  } catch {
    throw new Error(`no Supertonic models in ${dir} (expected onnx/ and voice_styles/ from Supertone/supertonic-3; set MULMOVOICE_SUPERTONIC)`);
  }
  return nodeSupertonic({ dir });
}
/** the Katarites by name; a new one plugs in here */
export const KATARITES: Readonly<Record<string, KatariteFactory>> = { kokoro, supertonic };

const cache = new Map<string, Promise<Katarite>>();
export function openKatarite(name: string, opts: KatariteOptions = {}, factories = KATARITES): Promise<Katarite> {
  const make = factories[name];
  if (!make) throw new Error(`unknown Katarite "${name}" (available: ${Object.keys(factories).join(", ")})`);
  const key = JSON.stringify([name, modelsDir(opts.models), opts.model ?? "fp32"]);
  let k = cache.get(key);
  if (!k) {
    k = make(opts);
    cache.set(key, k);
    k.catch(() => cache.delete(key)); // a failed load can be retried
  }
  return k;
}

/** the original text of a YomiScript (its <t:…> values joined, D23); throws the parser's error */
export const originalText = (ys: string): string => parse(ys).texts.join("");
export const durationOf = (s: Speech): number => s.samples.length / s.sampleRate;
export const toWav = (s: Speech): Buffer => Buffer.from(wav(s.samples, s.sampleRate));

export async function writeWav(s: Speech, file?: string): Promise<string> {
  const out = file ?? path.join(os.tmpdir(), `mulmovoice-${process.pid}-${Date.now()}.wav`);
  await fs.writeFile(out, toWav(s));
  return out;
}

/** a command that plays a WAV file here, or null (macOS afplay; Linux paplay or aplay) */
export function player(platform: NodeJS.Platform = process.platform): string[] | null {
  if (platform === "darwin") return ["afplay"];
  if (platform === "linux") return ["paplay"];
  return null;
}
function run(cmd: string[], file: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(cmd[0], [...cmd.slice(1), file], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
}
/** plays the file; false when nothing here can play it */
export async function playWav(file: string, platform: NodeJS.Platform = process.platform): Promise<boolean> {
  const cmd = player(platform);
  if (!cmd) return false;
  if (await run(cmd, file)) return true;
  return platform === "linux" ? run(["aplay", "-q"], file) : false;
}
