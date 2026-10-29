// English Yomite (Kokoro-based): English text -> YomiScript with pitch values.
//   1. g2p.py (misaki, Kokoro's English G2P): IPA, stress, syllables, boundaries
//   2. Kokoro's prosody predictor: <f0:…> values per syllable (yomite/kokoro_yomite.mjs)
// usage: node yomite_en.mjs [--gb] "text" ...      prints one JSON object per line: {"text", "marked", "ys"}
// needs: the demo's ONNX models and voices in demo/ys_web/web (see demo/ys_web/README.md)
import path from "path";
import { fileURLToPath } from "url";
import { isMain, yomite } from "../kokoro_yomite.mjs";

const G2P = path.join(path.dirname(fileURLToPath(import.meta.url)), "g2p.py");
export const yomiteEn = (texts, { gb = false } = {}) => yomite(G2P, [...(gb ? ["--gb"] : []), ...texts]);

if (isMain(import.meta.url)) {
  const a = process.argv.slice(2);
  for (const r of await yomiteEn(
    a.filter((x) => x !== "--gb"),
    { gb: a.includes("--gb") },
  ))
    console.log(JSON.stringify(r));
}
