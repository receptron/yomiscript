// The dictionary accent from the YomiScript's own words and readings (D31). The LLM has split the text into words
// (<t:…>) and read each one from its context; OpenJTalk's dictionary and rules are used as tables for them instead of
// analysing the text again. Of every dictionary entry of the sentence, the cheapest path (OpenJTalk's word and
// connection costs) is taken whose morae read as the YomiScript does, with the same number of morae at every word
// boundary; an entry may cross a boundary (の|で read as one ので). A word with no Japanese morae (another language,
// a mark) takes any entries. A word no entry reads that way is taken as OpenJTalk's analysis reads it, at a large
// cost, so it is used only where nothing else fits (that phrase stays unmarked, as the readings differ). OpenJTalk's
// rules then run on the path (`label`).
import { isJa, type Token, type Utterance } from "@yomiscript/core";
import type { Analysis, Analyzer, Cand, EntryAccent, Sentence } from "./frontend.ts";
import type { LabelMora } from "./labels.ts";
import { sameMorae } from "./marks.ts";

/** the cost added to a word read by OpenJTalk's own analysis */
const FALLBACK = 1e6;

interface Word {
  text: string;
  units: Token[];
}
/** the sentence's morae, the mora where each word starts, and per character of the normalized text its word */
interface Layout {
  U: Token[];
  M: number[];
  wordOf: number[];
  free: boolean[];
}
interface Node {
  m: number;
  r: number;
  cost: number;
  prev: Node | null;
  path: number[];
  /** the word taken as OpenJTalk reads it, or -1 */
  fell: number;
}
interface Search {
  S: Sentence;
  Y: Layout;
  X: Lattice;
  from: Map<number, number[]>;
  fb: Map<number, { word: number; path: number[] }[]>;
}

/** each <t:…> of the utterance: its text and its Japanese morae */
export function wordsOf(u: Utterance): Word[] {
  const W: Word[] = u.texts.map((t) => ({ text: t, units: [] }));
  for (const sec of u.sections) for (const t of sec.toks) if (t.kind === "unit" && isJa(sec.lang) && t.span !== undefined) W[t.span].units.push(t);
  return W;
}
/** an entry's morae as the labels write them (a long vowel as its vowel again) */
function asMorae(ph: string[][], prev: string | undefined): LabelMora[] {
  const out: LabelMora[] = [];
  let v = prev;
  for (const p of ph) {
    const m = p[0] === "-" ? [v ?? "-"] : p;
    out.push({ ph: m, hl: "L", phrase: 0 });
    const last = m[m.length - 1];
    if (/^[aiueoAIUEO]$/.test(last)) v = last.toLowerCase();
  }
  return out;
}
function layout(S: Sentence, W: Word[]): Layout {
  const U: Token[] = [],
    M = [0],
    wordOf: number[] = [];
  W.forEach((w, i) => {
    U.push(...w.units);
    M.push(U.length);
    for (let c = S.starts[i]; c < S.starts[i + 1]; c++) wordOf.push(i);
  });
  return { U, M, wordOf, free: W.map((w) => w.units.length === 0) };
}
/** the morae entry i takes from mora m: their number, or -1 when it does not read as the YomiScript */
function fits(S: Sentence, Y: Layout, i: number, m: number): number {
  const c = S.cands[i],
    w0 = Y.wordOf[c.s],
    w1 = Y.wordOf[c.e - 1];
  let free = 0;
  for (let w = w0; w <= w1; w++) free += Y.free[w] ? 1 : 0;
  if (free) return free === w1 - w0 + 1 ? 0 : -1;
  const prev = m > 0 ? Y.U[m - 1].v?.replace(/[ɯɨ]/g, "u") : undefined,
    K = asMorae(c.ph, prev),
    end = m + K.length;
  if (end > Y.M[w1 + 1] || !sameMorae(K, Y.U.slice(m, end))) return -1;
  const atStart = S.starts.indexOf(c.e);
  return atStart >= 0 && Y.M[atStart] !== end ? -1 : K.length;
}
/** for each word, OpenJTalk's own entries for it, when its analysis has a boundary at both ends of the word */
function fallbacks(S: Sentence, W: Word[]): Map<number, { word: number; path: number[] }[]> {
  const out = new Map<number, { word: number; path: number[] }[]>();
  W.forEach((_, i) => {
    const [a, z] = [S.starts[i], S.starts[i + 1]],
      I = S.alone.filter((k) => S.cands[k].s >= a && S.cands[k].e <= z);
    if (I.length && S.cands[I[0]].s === a && S.cands[I[I.length - 1]].e === z) out.set(a, [...(out.get(a) ?? []), { word: i, path: I }]);
  });
  return out;
}

/** the Viterbi states by character: the cheapest node per (mora, right id) */
class Lattice {
  readonly at: Map<string, Node>[];
  private readonly costs = new Map<number, number>();
  private readonly a: Analyzer;
  constructor(n: number, a: Analyzer) {
    this.at = Array.from({ length: n + 1 }, () => new Map<string, Node>());
    this.a = a;
  }
  put(c: number, node: Node): void {
    const k = `${node.m}|${node.r}`,
      old = this.at[c].get(k);
    if (!old || node.cost < old.cost) this.at[c].set(k, node);
  }
  cost(r: number, l: number): number {
    const k = r * 65536 + l;
    let v = this.costs.get(k);
    if (v === undefined) {
      v = this.a.conn(r, l);
      this.costs.set(k, v);
    }
    return v;
  }
}
/** the nodes reached from one node: each fitting entry, and the fallback of a word starting here */
function step({ S, Y, X, from, fb }: Search, c: number, node: Node): void {
  for (const i of from.get(c) ?? []) {
    const k = fits(S, Y, i, node.m),
      x = S.cands[i];
    if (k >= 0) X.put(x.e, { m: node.m + k, r: x.r, cost: node.cost + X.cost(node.r, x.l) + x.cost, prev: node, path: [i], fell: -1 });
  }
  for (const f of fb.get(c) ?? []) {
    if (node.m !== Y.M[f.word] || Y.free[f.word]) continue;
    const P = f.path.map((i) => S.cands[i]);
    let inner = X.cost(node.r, P[0].l) + P[0].cost;
    for (let j = 1; j < P.length; j++) inner += X.cost(P[j - 1].r, P[j].l) + P[j].cost;
    X.put(S.starts[f.word + 1], { m: Y.M[f.word + 1], r: P[P.length - 1].r, cost: node.cost + inner + FALLBACK, prev: node, path: f.path, fell: f.word });
  }
}
/** the entries and the fallback words of the cheapest node at the end that has read every mora */
function backtrack(X: Lattice, end: Map<string, Node>, morae: number): { path: number[]; fell: number[] } | null {
  let best: { node: Node; total: number } | null = null;
  for (const node of end.values()) {
    const total = node.cost + X.cost(node.r, 0);
    if (node.m === morae && (!best || total < best.total)) best = { node, total };
  }
  if (!best) return null;
  const path: number[] = [],
    fell: number[] = [];
  for (let node: Node | null = best.node; node; node = node.prev) {
    path.unshift(...node.path);
    if (node.fell >= 0) fell.unshift(node.fell);
  }
  return { path, fell };
}
/** the cheapest path of entries whose morae read as the YomiScript does (Viterbi on character, mora and the last
 * entry's right id), with the words taken as OpenJTalk reads them; null when there is none */
export function bestPath(S: Sentence, W: Word[], a: Analyzer): { path: number[]; fell: number[] } | null {
  const Y = layout(S, W),
    n = S.starts[S.starts.length - 1],
    X = new Lattice(n, a),
    from = new Map<number, number[]>(),
    chars = [...S.norm];
  S.cands.forEach((c, i) => from.set(c.s, [...(from.get(c.s) ?? []), i]));
  X.put(0, { m: 0, r: 0, cost: 0, prev: null, path: [], fell: -1 });
  const G: Search = { S, Y, X, from, fb: fallbacks(S, W) };
  for (let c = 0; c < n; c++)
    for (const node of X.at[c].values()) {
      // a space or line break is in no entry, and OpenJTalk's analysis skips it too
      if (/\s/.test(chars[c])) X.put(c + 1, { ...node, prev: node, path: [], fell: -1 });
      step(G, c, node);
    }
  return backtrack(X, X.at[n], Y.U.length);
}
/** another source of accents: for an entry of the path (its surface in the normalized text), an accent in place of
 * the dictionary's, or undefined to keep it */
export type AccentSource = (entry: Cand & { surface: string }) => EntryAccent | undefined;
/** a phrase rule in place of OpenJTalk's for an entry of the path and the one before it: join it to the phrase before
 * (true), start a phrase (false), or leave it to OpenJTalk (undefined) */
export type JoinRule = (prev: Cand & { surface: string }, cur: Cand & { surface: string }) => boolean | undefined;
/** OpenJTalk's rules on the cheapest path that reads as the YomiScript does, the words on it taken as OpenJTalk reads
 * them, and whether there was one (when not, OpenJTalk's own analysis of the text) */
export function lookupAnalysis(u: Utterance, a: Analyzer, source?: AccentSource, join?: JoinRule): Analysis & { fell: string[]; found: boolean } {
  const W = wordsOf(u),
    words = W.map((w) => w.text),
    S = a.candidates(words),
    best = bestPath(S, W, a),
    path = best ? best.path : S.alone,
    chars = [...S.norm],
    E = path.map((i) => ({ ...S.cands[i], surface: chars.slice(S.cands[i].s, S.cands[i].e).join("") })),
    accents = source && E.map((e) => source(e) ?? null),
    chain = join && E.map((e, k) => (k ? (join(E[k - 1], e) ?? null) : null));
  return { ...a.label(words, path, accents, chain), fell: best ? best.fell.map((i) => W[i].text) : [], found: !!best };
}
