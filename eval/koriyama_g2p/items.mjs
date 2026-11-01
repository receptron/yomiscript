// The benchmark sentences (JVS-nonpara-kana, Koriyama 2026; fetch.mjs puts the CSV in data/) and the fixed order they
// are asked in: the stratified subset first (SUBSET sentences, the same share of each JVS source corpus), then the rest,
// each part shuffled with a fixed seed. Batches of BATCH items follow that order, so the subset is batches 0..5 and a
// full run only adds batches.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CSV = path.join(HERE, "data", "jvs_nonpara_kana.csv");
export const SUBSET = 300;
export const BATCH = 50;
/** the formats of eval/representation that are run here */
export const FORMATS = ["yomiscript", "kana"];
const SEED = 20261031;

// a CSV line of the benchmark: base,text,kana (the text may hold commas only inside quotes)
function fields(line) {
  const out = [];
  let cur = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted && c === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** the JVS source corpus of a sentence: BASIC5000, TRAVEL1000, ONOMATOPEE300, LOANWORD128, UT-PARAPHRASE */
export const source = (base) => base.split("_")[1].replace(/-sent.*$/, "");

function load() {
  if (!fs.existsSync(CSV)) throw new Error(`${CSV} is missing: run node fetch.mjs first`);
  const lines = fs.readFileSync(CSV, "utf8").split(/\r?\n/).filter(Boolean).slice(1);
  return lines.map((l, i) => {
    const [base, text, kana] = fields(l);
    return { name: `s${String(i + 1).padStart(4, "0")}`, base, text, gold: kana, source: source(base), lang: "ja" };
  });
}

/** mulberry32: a small seeded generator, so the order (and score.mjs's resamples) are the same on every machine */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// the subset: from each source corpus its share of SUBSET (largest remainders), drawn at random
function stratified(all, rand) {
  const groups = Map.groupBy(all, (x) => x.source);
  const quota = [...groups].map(([k, g]) => ({ k, g, exact: (SUBSET * g.length) / all.length }));
  quota.forEach((q) => (q.n = Math.floor(q.exact)));
  let left = SUBSET - quota.reduce((s, q) => s + q.n, 0);
  for (const q of [...quota].sort((a, b) => b.exact - b.n - (a.exact - a.n) || a.k.localeCompare(b.k))) if (left-- > 0) q.n++;
  return quota.flatMap((q) => shuffle(q.g, rand).slice(0, q.n));
}

/** all 3,000 sentences in the order they are asked: the subset (shuffled), then the rest (shuffled) */
export function ordered() {
  const all = load(),
    rand = rng(SEED);
  const sub = shuffle(stratified(all, rand), rand);
  const inSub = new Set(sub.map((x) => x.name));
  return [
    ...sub,
    ...shuffle(
      all.filter((x) => !inSub.has(x.name)),
      rand,
    ),
  ];
}
/** the batches covering the first n sentences of the order */
export function batches(n = SUBSET) {
  const items = ordered().slice(0, n),
    B = [];
  for (let i = 0; i < items.length; i += BATCH) B.push(items.slice(i, i + BATCH));
  return B;
}
