// Japanese Yomite (Kokoro-based): Japanese text -> YomiScript with pitch values.
//   1. g2p.py (misaki Cutlet, Kokoro's Japanese G2P): IPA morae, words, boundaries
//   2. Kokoro's prosody predictor: <f0:…> values per mora (yomite/kokoro_yomite.mjs)
// usage: node yomite_ja.mjs "text" ...             prints one JSON object per line: {"text", "marked", "ys"}
// needs: the demo's ONNX models and voices in demo/ys_web/web (see demo/ys_web/README.md)
import path from "path";
import { fileURLToPath } from "url";
import { isMain, yomite } from "../kokoro_yomite.mjs";

const G2P = path.join(path.dirname(fileURLToPath(import.meta.url)), "g2p.py");
export const yomiteJa = (texts) => yomite(G2P, texts);

if (isMain(import.meta.url)) for (const r of await yomiteJa(process.argv.slice(2))) console.log(JSON.stringify(r));
