// Qwen's accent by analysis by synthesis: for each accent phrase of the tools' YomiScript (the D31 marks), the nucleus
// whose pitch, rendered by the pitch model, is closest to what Qwen spoke. A phrase of n morae can be flat (0: ꜛ
// after its first mora), fall after its first (1: ꜜ there) or after its k-th (k: ꜛ after the first, ꜜ after the
// k-th). Each phrase in turn takes the candidate that makes the whole sentence closest to Qwen's three values per
// mora (root mean square, both sides centred on the valued morae), the others held; two passes. Phrases of one mora
// keep D31's marks. The model is the one fitted to Qwen (fit.py's work/fit.json), so the marks are read in the
// terms the Katarite will render them in. Only the sentences Qwen read from the text (from kana its accent is worse).
// usage: node abs.mjs   -> work/abs.json ({ name: { ys (the marks read from Qwen), d31, abs (nuclei per phrase),
//        before, after (rmse) } })
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyEdits, jaContour, parse } from "@yomiscript/core";
import { accentMarks } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PASSES = 2;

/** the units of each accent phrase of a YomiScript whose marks are stripped */
function phrases(bare) {
  const units = parse(bare).sections[0].toks.filter((t) => t.kind === "unit");
  return { units, groups: Object.values(Object.groupBy(units, (t) => t.ph)) };
}
/** D31's nucleus of a phrase in the same terms (0 flat or no fall inside, k: falls after its k-th mora) */
function nucleusOf(P) {
  const f = P.findIndex((t) => t.fall);
  return f < 0 || f === P.length - 1 ? 0 : f + 1;
}
/** the marks of one phrase for nucleus k */
function marksFor(P, k) {
  if (k === 1) return [{ at: P[0].end, ins: "ꜜ" }];
  const E = [{ at: P[0].end, ins: "ꜛ" }];
  if (k > 1) E.push({ at: P[k - 1].end, ins: "ꜜ" });
  return E;
}
/** the YomiScript with the nucleus chosen for every phrase (null: keep the marks it had) */
function marked(bare, G, nuclei, kept) {
  return applyEdits(
    bare,
    G.flatMap((P, i) => (nuclei[i] === null ? kept[i] : marksFor(P, nuclei[i]))),
  );
}
function distance(ys, target, model) {
  const sec = parse(ys).sections[0],
    V = jaContour(sec, model),
    morae = sec.toks.filter((t) => t.kind === "unit"),
    pairs = morae.flatMap((m, i) => (target[i] && V.get(m) ? [[V.get(m), target[i]]] : []));
  const mean = (k) => pairs.reduce((s, p) => s + p[k].reduce((a, b) => a + b, 0), 0) / (3 * pairs.length);
  const [mv, mt] = [mean(0), mean(1)];
  return Math.sqrt(pairs.reduce((s, [v, t]) => s + v.reduce((a, x, j) => a + (x - mv - (t[j] - mt)) ** 2, 0), 0) / (3 * pairs.length));
}

/** one sentence: the nuclei closest to Qwen, starting from D31's */
export function readAccent(ys, target, model, analyzer) {
  const d31 = accentMarks(ys, analyzer),
    bare = d31.replace(/[ꜛꜜ]/g, ""),
    { groups: G } = phrases(bare),
    { groups: G31 } = phrases(d31);
  // D31's own marks of each phrase, as edits on the bare string (for the phrases of one mora)
  const kept = G.map((P, i) =>
    P.flatMap((t, j) => [...(G31[i][j].rise ? [{ at: t.end, ins: "ꜛ" }] : []), ...(G31[i][j].fall ? [{ at: t.end, ins: "ꜜ" }] : [])]),
  );
  const start = G31.map((P) => (P.length > 1 ? nucleusOf(P) : null)),
    nuclei = [...start];
  const before = distance(marked(bare, G, nuclei, kept), target, model);
  for (let pass = 0; pass < PASSES; pass++)
    G.forEach((P, i) => {
      if (nuclei[i] === null) return;
      let best = [Infinity, nuclei[i]];
      for (let k = 0; k <= P.length; k++) {
        if (k === P.length) continue; // a fall after the last mora is not seen inside the phrase: the same as 0
        nuclei[i] = k;
        const d = distance(marked(bare, G, nuclei, kept), target, model);
        if (d < best[0]) best = [d, k];
      }
      nuclei[i] = best[1];
    });
  const ys2 = marked(bare, G, nuclei, kept);
  return { ys: ys2, d31: start, abs: nuclei, before, after: distance(ys2, target, model) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict"),
    A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) }),
    model = JSON.parse(fs.readFileSync(path.join(HERE, "work/fit.json"), "utf8")),
    out = {};
  const lines = fs.readFileSync(path.join(HERE, "data/jsut_qwen_clone.jsonl"), "utf8").trim().split("\n");
  let changed = 0,
    total = 0,
    b = 0,
    a = 0;
  for (const l of lines) {
    const r = JSON.parse(l);
    if (r.given !== "text") continue;
    const x = readAccent(r.ys, r.f0, model, A);
    out[r.name] = x;
    x.abs.forEach((k, i) => {
      if (k === null) return;
      total++;
      changed += k !== x.d31[i];
    });
    b += x.before;
    a += x.after;
  }
  fs.writeFileSync(path.join(HERE, "work/abs.json"), JSON.stringify(out));
  const n = Object.keys(out).length;
  console.log(`${n} sentences: ${changed} of ${total} phrases take another nucleus than D31's; rmse to Qwen ${(b / n).toFixed(3)} -> ${(a / n).toFixed(3)}`);
}
