// Accent types of words learned from JSUT's hand-annotated accent (an AccentSource of @yomiscript/ja-accent), on
// the training half (even ids; rules.mjs's half). For a content word of the D31 path that starts a gold accent
// phrase, the gold's accent nucleus gives the word's own accent type when it falls inside the word (n: the pitch
// falls after its n-th mora), right after it (the last mora: odaka), or nowhere in the phrase (0); a fall further on
// says nothing about the word and is not counted. A word seen at least SEEN times whose gold type is the same in at
// least SHARE of them, and is not NAIST-JDIC's, becomes a correction.
// usage: node corrections.mjs   -> results/corrections.json (gitignored: it lists the JSUT words; the counts are in
//        summary.md)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { half, pathEntries } from "./rules.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CORRECTIONS = path.join(HERE, "results/corrections.json");
const SEEN = 2,
  SHARE = 0.8;
const FUNCTION = /^(助詞|助動詞|記号|動詞,非自立|名詞,非自立|名詞,接尾|形容詞,非自立|フィラー)/;

/** an entry's key for a correction: its surface, pronunciation and part of speech */
export const entryKey = (e) => `${e.surface}\t${e.pron}\t${e.pos}`;

/** the gold accent nucleus of the phrase starting at mora b: the 1-based mora (in the phrase) the pitch falls after,
 * 0 for none, and the phrase's length */
function nucleus(G, b) {
  const P = [];
  for (let i = b; i < G.length && G[i].phrase === G[b].phrase; i++) P.push(G[i]);
  for (let i = 0; i + 1 < P.length; i++) if (P[i].hl === "H" && P[i + 1].hl === "L") return { n: i + 1, len: P.length };
  return { n: 0, len: P.length };
}

/** the word's own accent type in the gold, or null when the phrase does not say */
function goldType(G, e) {
  const b = e.mora,
    len = e.ph.length;
  if (b > 0 && G[b - 1].phrase === G[b].phrase) return null; // the word does not start a gold phrase
  const { n, len: plen } = nucleus(G, b);
  if (n === 0) return plen > len ? 0 : null; // flat, unless nothing follows the word in the phrase (0 or odaka)
  return n <= len ? n : null;
}

/** surface + pronunciation + part of speech -> the gold accent types seen, over the training half */
export function learn(sentences, a) {
  const C = new Map();
  for (const { x, ys, G } of sentences) {
    if (half(x.name) !== "train") continue;
    const E = pathEntries(ys, a);
    if (!E || E.reduce((n, e) => n + e.ph.length, 0) !== G.length) continue;
    for (const e of E) {
      if (!e.ph.length || FUNCTION.test(e.pos) || e.pron.includes("+")) continue;
      const t = goldType(G, e);
      if (t === null) continue;
      const k = entryKey(e),
        m = C.get(k) ?? {};
      m[t] = (m[t] ?? 0) + 1;
      C.set(k, m);
    }
  }
  return C;
}
/** the corrections: the words whose gold type is clear and not NAIST-JDIC's (from the entries' accent of `naist`) */
export function corrections(C, naist) {
  const out = {};
  for (const [k, m] of C) {
    const n = Object.values(m).reduce((s, v) => s + v, 0),
      [t, c] = Object.entries(m).sort((p, q) => q[1] - p[1])[0];
    if (n >= SEEN && c / n >= SHARE && naist.get(k) !== Number(t)) out[k] = Number(t);
  }
  return out;
}
/** an AccentSource from the corrections */
export const correctionSource = (out) => (e) => (entryKey(e) in out ? { a: out[entryKey(e)] } : undefined);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { nodeAnalyzer } = await import("@yomiscript/ja-accent/node");
  const { scoredSentences } = await import("./sentences.mjs");
  const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
  const A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) });
  const S = scoredSentences(),
    C = learn(S, A);
  // NAIST-JDIC's own accent type of each entry seen: the type of its first word
  const naist = new Map();
  for (const s of S) for (const e of pathEntries(s.ys, A) ?? []) naist.set(entryKey(e), e.acc);
  const out = corrections(C, naist);
  fs.writeFileSync(CORRECTIONS, JSON.stringify({ seen: SEEN, share: SHARE, words: C.size, corrections: out }, null, 1));
  console.log(`${C.size} words seen; ${Object.keys(out).length} corrections`);
}
