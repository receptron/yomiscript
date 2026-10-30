// What the Node apps (this CLI, the MCP server) share: where the models are, the Katarites by name, WAV files and
// local playback. Each Katarite is loaded on demand, so a YomiScript error is reported before any model is read.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse, type Katarite, type Speech } from "@yomiscript/core";
import { DICT_URL, DICT_VERSION, withAccent } from "@yomiscript/ja-accent";
import { KOKORO_MODELS_URL, wav } from "@yomiscript/kokoro";
import { SUPERTONIC_MODELS_URL } from "@yomiscript/supertonic";

export type ModelPrecision = "fp32" | "w16";
export interface KatariteOptions {
  /** directory with models/ and voices/; default: $YOMISCRIPT_MODELS, then ~/.cache/yomiscript/kokoro */
  models?: string;
  /** fp32 (identical to the original Kokoro, the default in Node) or w16 (fp16 weights, as in the browser) */
  model?: ModelPrecision;
  /** a voice for every section (Kokoro: e.g. jm_kumo), instead of each language's default */
  voice?: string;
  /** Kokoro: the Japanese dictionary accent (D25); true by default */
  accent?: boolean;
}
export type KatariteFactory = (opts: KatariteOptions) => Promise<Katarite>;

export function modelsDir(opt?: string, env: NodeJS.ProcessEnv = process.env): string {
  return opt ?? env.YOMISCRIPT_MODELS ?? path.join(os.homedir(), ".cache", "yomiscript", "kokoro");
}

/** where a Katarite's models are read from, and where missing ones are downloaded from (none: all must be there) */
export interface ModelSource {
  dir: string;
  download?: string;
}
const exists = (p: string) =>
  fs.access(p).then(
    () => true,
    () => false,
  );
// a download is printed on stderr: stdout is the MCP protocol
const tell = (url: string) => process.stderr.write(`yomiscript: downloading ${url}\n`);

/** Kokoro: a directory the user named is used as it is; the default cache downloads what is missing */
export function kokoroSource(opt?: string, env: NodeJS.ProcessEnv = process.env, url = KOKORO_MODELS_URL): ModelSource {
  const named = opt ?? env.YOMISCRIPT_MODELS;
  return named ? { dir: named } : { dir: modelsDir(undefined, env), download: url };
}
/** the Japanese accent dictionary: $YOMISCRIPT_JA_DICT as it is, else the yomiscript cache, which downloads it */
export function jaDictSource(env: NodeJS.ProcessEnv = process.env, home = os.homedir(), url = DICT_URL): ModelSource {
  if (env.YOMISCRIPT_JA_DICT) return { dir: env.YOMISCRIPT_JA_DICT };
  return { dir: path.join(home, ".cache", "yomiscript", "ja-dict", DICT_VERSION), download: url };
}
async function accentStep(): Promise<(ys: string) => string> {
  const { nodeAnalyzer } = await import("@yomiscript/ja-accent/node");
  const { accentYomite } = await import("@yomiscript/ja-accent");
  return accentYomite(await nodeAnalyzer({ ...jaDictSource(), onDownload: tell }));
}
const accentFailed = (e: unknown) => process.stderr.write(`yomiscript: no Japanese dictionary accent (${(e as Error).message}); Kokoro's own pitch is used\n`);

/** Supertonic: $YOMISCRIPT_SUPERTONIC as it is, then the Python SDK's cache if it has the models, then the yomiscript
 * cache, which downloads what is missing from Supertone/supertonic-3 */
export async function supertonicSource(env: NodeJS.ProcessEnv = process.env, home = os.homedir(), url = SUPERTONIC_MODELS_URL): Promise<ModelSource> {
  if (env.YOMISCRIPT_SUPERTONIC) return { dir: env.YOMISCRIPT_SUPERTONIC };
  const sdk = path.join(home, ".cache", "supertonic3");
  if (await exists(path.join(sdk, "onnx"))) return { dir: sdk };
  return { dir: path.join(home, ".cache", "yomiscript", "supertonic"), download: url };
}

async function kokoro(opts: KatariteOptions): Promise<Katarite> {
  // loaded here, not at the top: onnxruntime-node is only needed once something is spoken
  const { nodeEngine } = await import("@yomiscript/kokoro/node");
  const { KokoroKatarite } = await import("@yomiscript/kokoro");
  const { dir, download } = kokoroSource(opts.models);
  if (!download && !(await exists(path.join(dir, "models")))) {
    throw new Error(`no Kokoro models in ${dir} (expected models/ and voices/; unset YOMISCRIPT_MODELS and --models to download them)`);
  }
  const k = new KokoroKatarite(await nodeEngine({ dir, model: opts.model ?? "fp32", download, onDownload: tell }), { voice: opts.voice });
  return opts.accent === false ? k : withAccent(k, accentStep, accentFailed);
}

async function supertonic(): Promise<Katarite> {
  const { nodeSupertonic } = await import("@yomiscript/supertonic/node");
  const { dir, download } = await supertonicSource();
  if (!download && !(await exists(path.join(dir, "onnx")))) {
    throw new Error(
      `no Supertonic models in ${dir} (expected onnx/ and voice_styles/ from Supertone/supertonic-3; unset YOMISCRIPT_SUPERTONIC to download them)`,
    );
  }
  let told = false;
  const onDownload = (url: string) => {
    if (!told) process.stderr.write("yomiscript: Supertonic 3's weights are under OpenRAIL-M (https://huggingface.co/Supertone/supertonic-3)\n");
    told = true;
    tell(url);
  };
  return nodeSupertonic({ dir, download, onDownload });
}
/** the Katarites by name; a new one plugs in here */
export const KATARITES: Readonly<Record<string, KatariteFactory>> = { kokoro, supertonic };

const cache = new Map<string, Promise<Katarite>>();
export function openKatarite(name: string, opts: KatariteOptions = {}, factories = KATARITES): Promise<Katarite> {
  const make = factories[name];
  if (!make) throw new Error(`unknown Katarite "${name}" (available: ${Object.keys(factories).join(", ")})`);
  const key = JSON.stringify([name, modelsDir(opts.models), opts.model ?? "fp32", opts.accent !== false]);
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
  const out = file ?? path.join(os.tmpdir(), `yomiscript-${process.pid}-${Date.now()}.wav`);
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
