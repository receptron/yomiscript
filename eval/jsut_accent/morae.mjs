// The morae of JSUT's hand-annotated accent and of a marked YomiScript, as Tokyo H / L and accent phrases (score.mjs).
import { isJa, parse } from "@yomiscript/core";

const SMALL = "ァィゥェォャュョヮ";

/** the gold's morae: { kana, hl, phrase } from jsut-label's symbols ([ rise, ] fall, # and _ phrase boundaries) */
export function goldMorae(sym) {
  const out = [];
  let phrase = 0,
    level = "L",
    start = 0;
  const close = () => {
    // a fall before any rise: the morae before it are high (the first mora of an accent on it)
    const P = out.slice(start);
    const fall = P.findIndex((m) => m.after === "]"),
      rise = P.findIndex((m) => m.after === "[");
    if (fall >= 0 && (rise < 0 || fall < rise)) for (let i = 0; i <= fall; i++) P[i].hl = "H";
  };
  for (const c of sym.replace(/^\^|[$?]$/g, "")) {
    if (c === "#" || c === "_") {
      close();
      phrase++;
      level = "L";
      start = out.length;
    } else if (c === "[" || c === "]") {
      out[out.length - 1].after = c;
      level = c === "[" ? "H" : "L";
    } else if (SMALL.includes(c) && out.length) out[out.length - 1].kana += c;
    else out.push({ kana: c, hl: level, phrase, after: null });
  }
  close();
  return out;
}
/** our morae from a marked YomiScript: { hl, phrase, marked, span } (hl null in a phrase with no marks; span: its <t:…>) */
export function ourMorae(ys) {
  const U = [];
  parse(ys).sections.forEach((sec, si) => {
    if (!isJa(sec.lang)) return;
    for (const t of sec.toks) if (t.kind === "unit") U.push({ phrase: `${si}/${t.ph}`, span: t.span, rise: !!t.rise, fall: !!t.fall });
  });
  const groups = Map.groupBy(U, (m) => m.phrase);
  for (const P of groups.values()) {
    const marked = P.some((m) => m.rise || m.fall),
      fall = P.findIndex((m) => m.fall),
      rise = P.findIndex((m) => m.rise);
    let level = "L";
    P.forEach((m, i) => {
      m.marked = marked;
      m.hl = marked ? level : null;
      if (m.rise) level = "H";
      if (m.fall) level = "L";
      if (marked && fall >= 0 && (rise < 0 || fall < rise) && i <= fall) m.hl = "H";
    });
  }
  return U;
}

/** the counts of one way of marking against the gold (score.mjs, eval/llm_phrasing) */
export const tally = () => ({
  morae: 0,
  covered: 0,
  hlRight: 0,
  bounds: 0,
  boundsGold: 0,
  boundsOurs: 0,
  boundsBoth: 0,
  phrases: 0,
  phrasesSpan: 0,
  phrasesRight: 0,
});
/** the morae covered (in a phrase with marks) and those with the gold's H / L */
function countMorae(T, G, O) {
  T.morae += G.length;
  O.forEach((o, i) => {
    if (!o.marked) return;
    T.covered++;
    if (o.hl === G[i].hl) T.hlRight++;
  });
}
/** the phrase boundaries between two covered morae: the gold's, ours, and both */
function countBounds(T, G, O) {
  for (let i = 0; i + 1 < G.length; i++) {
    if (!O[i].marked || !O[i + 1].marked) continue;
    const g = G[i].phrase !== G[i + 1].phrase,
      o = O[i].phrase !== O[i + 1].phrase;
    T.bounds++;
    T.boundsGold += g ? 1 : 0;
    T.boundsOurs += o ? 1 : 0;
    T.boundsBoth += g && o ? 1 : 0;
  }
}
/** whole gold phrases: covered by one marked phrase of ours with the same span, and with the same H / L */
function countPhrases(T, G, O) {
  const sizes = Map.groupBy(O, (o) => o.phrase);
  for (const P of Map.groupBy(
    G.map((g, i) => ({ g, o: O[i] })),
    (x) => x.g.phrase,
  ).values()) {
    T.phrases++;
    const first = P[0].o.phrase;
    if (!P.every((x) => x.o.marked && x.o.phrase === first) || sizes.get(first).length !== P.length) continue;
    T.phrasesSpan++;
    if (P.every((x) => x.g.hl === x.o.hl)) T.phrasesRight++;
  }
}
/** one sentence's counts for one way of marking */
export function count(T, G, O) {
  countMorae(T, G, O);
  countBounds(T, G, O);
  countPhrases(T, G, O);
}
