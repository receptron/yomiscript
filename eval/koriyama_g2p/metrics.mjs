// The kana metrics of score.mjs, shared with eval/koriyama_matched: per sentence the errors against the gold under
// Koriyama's normalisation (0) and with ヲ ヂ ヅ merged (1), CER over a set of sentences, percentile bootstrap
// intervals over the same resamples for every system, and the causes the merged errors are put under.
import { lev } from "../browser_tts/reading.mjs";
import { rng } from "./items.mjs";
import { norm, UNKNOWN } from "./kana.mjs";

/** one sentence `x` ({ name, gold }) and its reading `r` ({ kana, parsed } or undefined): e / n are errors and gold
 * characters for metric 0 (Koriyama's scorer) and 1 (merged); score.mjs adds the phoneme CER as metric 2 */
export function kanaRow(x, r) {
  const got = r?.kana ?? "";
  const g = [norm(x.gold, false), norm(x.gold, true)],
    p = [norm(got, false), norm(got, true)];
  return {
    name: x.name,
    missing: !r,
    unparsed: !!r && !r.parsed,
    foreign: [...got].filter((c) => c === UNKNOWN).length,
    pred: p[1],
    gold: g[1],
    e: p.map((v, i) => lev(g[i], v)),
    n: g.map((v) => [...v].length),
  };
}

/** a source of resamples: each call (n) draws B index lists of n sentences, continuing the same seeded sequence */
export function resampler(seed, B) {
  const rand = rng(seed);
  return (n) => Array.from({ length: B }, () => Array.from({ length: n }, () => Math.floor(rand() * n)));
}
/** CER in % of metric m over the rows at idx */
export function cer(rows, m, idx) {
  let e = 0,
    n = 0;
  for (const i of idx) {
    e += rows[i].e[m];
    n += rows[i].n[m];
  }
  return (100 * e) / n;
}
const pct = (a, q) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(q * a.length))];
/** the 95% percentile interval of f(idx) over the resamples R */
export function interval(R, f) {
  const v = R.map(f);
  return [pct(v, 0.025), pct(v, 0.975)];
}
/** metric m over all rows, with its interval */
export function metric(rows, m, R) {
  return { cer: cer(rows, m, [...rows.keys()]), ci: interval(R, (idx) => cer(rows, m, idx)) };
}
/** merged kana CER over the sentences answered with a reading the parser takes (none missing, none rejected) */
export function wellFormed(rows) {
  const ok = rows.filter((r) => !r.missing && !r.unparsed);
  return ok.length ? (100 * ok.reduce((a, r) => a + r.e[1], 0)) / ok.reduce((a, r) => a + r.n[1], 0) : NaN;
}

// where the merged kana errors are, by sentence (the first that applies): an answer the parser rejected, a mora with
// no kana, 先生 read セエセエ (the YomiScript prompt's own example spells it seːseː), いう read イウ where the gold has ユウ
export const CAUSES = [
  ["not parsed", (r) => r.unparsed],
  ["mora with no kana", (r) => r.pred.includes(UNKNOWN)],
  ["先生 as セエセエ", (r) => r.gold.includes("センセ") && r.pred.includes("セエセ") && !r.pred.includes("センセ")],
  ["いう as イウ", (r) => r.gold.includes("ユウ") && r.pred.includes("イウ")],
];
/** merged kana error characters per cause, and "other" */
export function causes(rows) {
  const C = Object.fromEntries([...CAUSES.map(([k]) => [k, 0]), ["other", 0]]);
  for (const r of rows.filter((x) => x.e[1] > 0)) C[CAUSES.find(([, f]) => f(r))?.[0] ?? "other"] += r.e[1];
  return C;
}
