// What the Kokoro-based Yomites (en_kokoro, ja_kokoro) share: run a g2p.py (Kokoro's own front end, text -> YomiScript),
// then Kokoro's prosody predictor (demo/ys_web/web/kokoro_prosody.js, ONNX enc + f0n) for <f0:…> values.
// env: YOMITE_PY  python with kokoro (and misaki[ja] for Japanese) installed (default: python3)
import { spawnSync } from "child_process";
import { pathToFileURL } from "url";
import { engine, K } from "../demo/ys_web/node.mjs";

const { KokoroProsody } = K;

// one JSON object per chunk of the original pipeline: {"index", "text", "ys", "kokoro"}
export function runG2p(script, args) {
  const r = spawnSync(process.env.YOMITE_PY || "python3", [script, ...args], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) {
    const err = r.stderr.split("\n").filter((l) => !/warn/i.test(l));
    throw new Error(`${script} failed: ${err.slice(-5).join("\n")}`);
  }
  return r.stdout
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l));
}
let KP = null;
export async function predictor() {
  KP ??= new KokoroProsody(await engine("w16"));
  return KP;
}
// -> [{text, marked (without pitch values), ys (with them)}]
export async function yomite(script, args) {
  const G = runG2p(script, args),
    P = await predictor();
  const out = [];
  for (const g of G) out.push({ text: g.text, marked: g.ys, ys: await P.realize(g.ys) });
  return out;
}
export const isMain = (url) => process.argv[1] && url === pathToFileURL(process.argv[1]).href;
