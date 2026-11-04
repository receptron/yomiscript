// Qwen's accent by analysis by synthesis: for each accent phrase of the tools' YomiScript (the D31 marks), the nucleus
// whose pitch, rendered by the pitch model, is closest to what Qwen spoke. A phrase of n morae can be flat (0: ꜛ
// after its first mora), fall after its first (1: ꜜ there) or after its k-th (k: ꜛ after the first, ꜜ after the
// k-th), the last included (n: the fall is heard in the next phrase, and counts for downstep). Each phrase in turn
// takes the candidate that makes the whole sentence closest to Qwen's three values per mora (root mean square, both
// sides centred on the valued morae), the others held, until no phrase changes (at most 20 passes); a candidate
// replaces the one held only when it is closer by more than 1e-10, so ties keep the start. Phrases of one mora
// keep D31's marks. The model is the one fitted to Qwen (fit.py's work/fit.json), so the marks are read in the
// terms the Katarite will render them in. Only the sentences Qwen read from the text (from kana its accent is worse).
// usage: node abs.mjs [--phrased]   -> work/abs.json ({ name: { ys (the marks read from Qwen), d31, abs (nuclei per
//        phrase), before, after (rmse) } }); --phrased: in the LLM's accent phrases (phrase_corpus.mjs, D32), only the
//        sentences that have them -> work/abs_phrased.json; --wiki: the Wikipedia sentences (wiki_items.mjs, written
//        with the LLM's phrases) -> work/abs_wiki.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyEdits, jaContour, parse } from "@yomiscript/core";
import { accentMarks, phraseEdits, startPhrases } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PASSES = 20;

/** the YomiScript with the nucleus chosen for every phrase (null: keep the marks it had) */
const marked = (bare, G, nuclei, kept) => applyEdits(bare, phraseEdits(G, nuclei, kept));
export function distance(ys, target, model) {
  const sec = parse(ys).sections[0],
    V = jaContour(sec, model),
    morae = sec.toks.filter((t) => t.kind === "unit");
  return contourDistance(
    morae.map((m) => V.get(m)),
    target,
  );
}
/** the same distance for any values per mora (null where there are none) */
export function contourDistance(values, target) {
  const pairs = values.flatMap((v, i) => (target[i] && v ? [[v, target[i]]] : []));
  const mean = (k) => pairs.reduce((s, p) => s + p[k].reduce((a, b) => a + b, 0), 0) / (3 * pairs.length);
  const [mv, mt] = [mean(0), mean(1)];
  return Math.sqrt(pairs.reduce((s, [v, t]) => s + v.reduce((a, x, j) => a + (x - mv - (t[j] - mt)) ** 2, 0), 0) / (3 * pairs.length));
}

/** D31's marks of a sentence, taken apart */
function d31Phrases(ys, analyzer) {
  const { bare, sections } = startPhrases(accentMarks(ys, analyzer));
  return { bare, ...sections[0] };
}

/** the YomiScript of a sentence with the given nucleus for each D31 phrase of two or more morae (in order) */
export function withNucleiOf(ys, nuclei, analyzer) {
  const { bare, G, kept } = d31Phrases(ys, analyzer),
    it = nuclei[Symbol.iterator]();
  return marked(
    bare,
    G,
    G.map((P) => (P.length > 1 ? it.next().value : null)),
    kept,
  );
}

/** one sentence: the nuclei closest to Qwen, starting from D31's */
export function readAccent(ys, target, model, analyzer) {
  const { bare, G, start, kept } = d31Phrases(ys, analyzer),
    nuclei = [...start];
  const evaluate = () => distance(marked(bare, G, nuclei, kept), target, model),
    before = evaluate();
  let passes = 0,
    moved = true;
  while (moved && passes < PASSES) {
    passes++;
    moved = false;
    G.forEach((P, i) => {
      if (nuclei[i] === null) return;
      const held = nuclei[i];
      let best = [evaluate(), held];
      for (let k = 0; k <= P.length; k++) {
        nuclei[i] = k;
        const d = evaluate();
        if (d < best[0] - 1e-10) best = [d, k];
      }
      nuclei[i] = best[1];
      moved ||= best[1] !== held;
    });
  }
  return { ys: marked(bare, G, nuclei, kept), d31: start, abs: nuclei, before, after: evaluate(), passes, converged: !moved };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict"),
    A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) }),
    model = JSON.parse(fs.readFileSync(path.join(HERE, "work/fit.json"), "utf8")),
    wiki = process.argv.includes("--wiki"),
    phrased = process.argv.includes("--phrased") && JSON.parse(fs.readFileSync(path.join(HERE, "work/phrased.json"), "utf8")),
    out = {};
  const lines = fs
    .readFileSync(path.join(HERE, wiki ? "work/wiki/qwen_clone.jsonl" : "data/jsut_qwen_clone.jsonl"), "utf8")
    .trim()
    .split("\n");
  let changed = 0,
    total = 0,
    b = 0,
    a = 0;
  for (const l of lines) {
    const r = JSON.parse(l);
    if (r.given !== "text" || (phrased && !phrased[r.name])) continue;
    const x = readAccent(phrased ? phrased[r.name] : r.ys, r.f0, model, A);
    out[r.name] = x;
    x.abs.forEach((k, i) => {
      if (k === null) return;
      total++;
      changed += k !== x.d31[i];
    });
    b += x.before;
    a += x.after;
  }
  const suffix = (wiki && "_wiki") || (phrased && "_phrased") || "";
  fs.writeFileSync(path.join(HERE, `work/abs${suffix}.json`), JSON.stringify(out));
  const n = Object.keys(out).length;
  console.log(`${n} sentences: ${changed} of ${total} phrases take another nucleus than D31's; rmse to Qwen ${(b / n).toFixed(3)} -> ${(a / n).toFixed(3)}`);
}
