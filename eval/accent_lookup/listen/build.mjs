// The listening set of eval/accent_lookup: each text whose marks the prototype changes (results/compare.json), the
// marked YomiScript of ja-accent and of the prototype, rendered by Kokoro as the tools render it (the rules at
// ACCENT_SCALE on the marked phrases only). Of the LLM runs of a text, the pair of outputs that occurs most often;
// of a text with several sentences, only the sentences that differ. The two clips of an item get opaque ids and an
// order fixed by the seed, so the page cannot tell which is which.
// usage: node build.mjs [--seed S]   -> audio/<id>.wav and set.json (with the key: not served). renderSet makes such a
// set from other pairs (eval/jsut_accent/listen.mjs), which serve.mjs and score.mjs take with --dir.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse, realize } from "@yomiscript/core";
import { ACCENT_SCALE } from "@yomiscript/ja-accent";
import * as K from "@yomiscript/kokoro";
import { nodeEngine } from "@yomiscript/kokoro/node";
import { hash, shuffled } from "../../tts_readings/listen/shuffle.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SET = path.join(HERE, "set.json"),
  AUDIO = path.join(HERE, "audio");
const COMPARE = path.join(HERE, "../results/compare.json");

/** the sentences of a one-section YomiScript (each ending with ↘ or ↗), or null for several sections */
function sentencesOf(ys) {
  if (parse(ys).sections.length !== 1) return null;
  const a = ys.indexOf("/"),
    b = ys.lastIndexOf("/");
  return { lang: ys.slice(0, a).trim(), body: ys.slice(a + 1, b).split(/(?<=[↘↗])\s+/) };
}
/** the two YomiScripts cut down to the sentences where they differ */
function differing(a, b) {
  const A = sentencesOf(a),
    B = sentencesOf(b);
  if (!A || !B || A.body.length !== B.body.length) return [a, b];
  const keep = A.body.map((s, i) => s !== B.body[i]);
  const join = (S) => `${S.lang} /${S.body.filter((_, i) => keep[i]).join(" ")}/`;
  return [join(A), join(B)];
}
/** the reading of each word (<t:...>) as written, marks included */
const segments = (ys) =>
  ys
    .split(/<t:[^>]*>/)
    .slice(0, -1)
    .map((x) => x.split(/[\s/]/).pop());
/** the text as shown: the words whose marks differ are flagged, with each method's reading */
function shown(a, b, [ma, mb]) {
  const texts = parse(a).texts,
    sa = segments(a),
    sb = segments(b);
  return texts.map((t, i) => ({ t: t.replace(/\n/g, " "), changed: sa[i] !== sb[i], [ma]: sa[i], [mb]: sb[i] }));
}
/** of each text's runs, the pair of outputs that occurs most often */
function pairs() {
  const by = new Map();
  for (const d of JSON.parse(fs.readFileSync(COMPARE, "utf8")).diffs) {
    const m = by.get(d.text) ?? new Map(),
      k = JSON.stringify([d.analysis, d.lookup]);
    m.set(k, (m.get(k) ?? 0) + 1);
    by.set(d.text, m);
  }
  return [...by].map(([text, m]) => ({ text, pair: JSON.parse([...m].sort((x, y) => y[1] - x[1])[0][0]), runs: [...m.values()].reduce((s, n) => s + n, 0) }));
}

/** renders a listening set into dir (audio/<id>.wav and set.json): `pairs` ({ text, pair: [ys of methods[0], ys of
 * methods[1]], runs }), each item's two clips in an order fixed by the seed (shared with other sets, e.g.
 * eval/jsut_accent/listen.mjs) */
export async function renderSet({ pairs: P, methods, seed, dir }) {
  const E = await nodeEngine({ dir: path.join(process.env.HOME, ".cache/yomiscript/kokoro") }),
    audio = path.join(dir, "audio");
  fs.mkdirSync(audio, { recursive: true });
  const items = [];
  for (const [k, p] of P.entries()) {
    const [a, b] = differing(...p.pair),
      sides = shuffled(
        [
          { method: methods[0], ys: a },
          { method: methods[1], ys: b },
        ],
        `${seed} ${p.text}`,
      ),
      clips = [];
    for (const s of sides) {
      const id = "c" + (hash(`${seed} ${k} ${s.method}`) % 1e6).toString().padStart(6, "0"),
        y = realize(s.ys, { markedOnly: true, jaScale: ACCENT_SCALE });
      fs.writeFileSync(path.join(audio, `${id}.wav`), Buffer.from(K.wav((await E.synth(y, "values")).audio)));
      clips.push({ id, method: s.method, ys: s.ys });
    }
    items.push({ item: `i${String(k + 1).padStart(2, "0")}`, words: shown(a, b, methods), runs: p.runs, x: clips[0], y: clips[1] });
    console.log(`${items.length}: ${p.text.slice(0, 30).replace(/\n/g, " ")}`);
  }
  const set = { seed, built: new Date().toISOString().slice(0, 10), methods, items };
  fs.writeFileSync(path.join(dir, "set.json"), JSON.stringify(set, null, 1));
  return set;
}
/** this directory's set: the texts whose marks D31 changes (ja-accent's analysis, the YomiScript's own words) */
export const build = (seed = "accent-lookup-1") => renderSet({ pairs: pairs(), methods: ["analysis", "lookup"], seed, dir: HERE });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--seed");
  await build(i > 0 ? process.argv[i + 1] : undefined);
}
