// Kokoro (the Katarite, demo models w16 = the browser default) on every set, for listening: audio/<system>/<set>.<name>.wav
//   kokoro  the original front end's YomiScript (refs.json, one utterance per original chunk)
//   claude, codex  the LLM's YomiScript (results/<llm>.<set>.json)
// usage: node audio_kokoro.mjs
import fs from "fs";
import path from "path";
import { engine, K } from "../../demo/ys_web/node.mjs";
import { HERE, SETS } from "./sets.mjs";

const REFS = JSON.parse(fs.readFileSync(path.join(HERE, "refs.json"), "utf8"));
const E = await engine("w16");
const silence = new Float32Array(K.SR * 0.2);

async function speak(utterances) {
  const parts = [];
  for (const ys of utterances) parts.push((await E.synth(ys, "engine")).audio, silence);
  const a = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((o, p) => (a.set(p, o), o + p.length), 0);
  return a;
}
function sources(set) {
  const S = { kokoro: REFS[set].map((r) => r.ys) };
  for (const llm of ["claude", "codex"]) {
    const R = JSON.parse(fs.readFileSync(path.join(HERE, "results", `${llm}.${set}.json`), "utf8"));
    S[llm] = SETS[set].map((x) => (R.output?.[x.name] ? [R.output[x.name]] : null));
  }
  return S;
}
const times = [];
for (const set of Object.keys(SETS))
  for (const [sys, list] of Object.entries(sources(set))) {
    const dir = path.join(HERE, "audio", sys);
    fs.mkdirSync(dir, { recursive: true });
    for (const [i, x] of SETS[set].entries()) {
      if (!list[i]) continue;
      const t0 = Date.now();
      try {
        const a = await speak(list[i]);
        times.push((Date.now() - t0) / 1000);
        fs.writeFileSync(path.join(dir, `${set}.${x.name}.wav`), Buffer.from(K.wav(a)));
      } catch (e) {
        console.log(`${sys} ${set} ${x.name}: ${e.message.slice(0, 120)}`);
      }
    }
  }
times.sort((a, b) => a - b);
console.log(`${times.length} texts, median ${times[times.length >> 1].toFixed(2)} s per text (WASM, 1 thread)`);
