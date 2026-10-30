// OpenJTalk's accent phrases of a text: the characters each covers and its morae (phonemes, H / L), from the words
// after the front end's rules (NJD) and the full-context labels.
import { labelMorae, type LabelMora } from "./labels.ts";

export interface DictPhrase {
  /** the characters of the text it covers: [start, end) */
  start: number;
  end: number;
  morae: LabelMora[];
}
interface Word {
  string: string;
  mora: number;
}
function njdWords(njd: string[]): Word[] {
  // CSV: surface (which may itself contain a comma), 9 fields, then accent/morae, chain rule, chain flag
  return njd.map((line) => {
    const f = line.split(","),
      n = f.length;
    return { string: f.slice(0, n - 12).join(","), mora: Number(f[n - 3].split("/")[1] ?? 0) };
  });
}
const nfkc = (s: string): string => s.normalize("NFKC");
function normalized(text: string): { norm: string; at: number[] } {
  // NFKC can change the length (… -> ...): at[i] is the character of the text that norm[i] comes from
  let norm = "",
    from = 0;
  const at: number[] = [];
  for (const c of text) {
    const n = nfkc(c);
    norm += n;
    for (let j = 0; j < n.length; j++) at.push(from);
    from += c.length;
  }
  at.push(text.length);
  return { norm, at };
}

/** [start, end) of each word in the text. Words not found where they should be (numbers, which OpenJTalk writes as
 * kanji numerals) take the stretch up to the next word that is found, all of them the whole stretch. */
function place(text: string, words: Word[]): [number, number][] {
  const out: [number, number][] = [],
    { norm, at } = normalized(text);
  let cur = 0,
    pending: number[] = [];
  for (const w of words) {
    const s = nfkc(w.string),
      i = s ? norm.indexOf(s, cur) : -1;
    if (i < 0 || (i > cur && !pending.length && norm.slice(cur, i).trim())) {
      pending.push(out.length);
      out.push([0, 0]);
      continue;
    }
    for (const k of pending) out[k] = [at[cur], at[i]];
    pending = [];
    out.push([at[i], at[i + s.length]]);
    cur = i + s.length;
  }
  for (const k of pending) out[k] = [at[cur], text.length];
  return out;
}
/** drops the phrases whose span overlaps a neighbour's (a stretch of numbers split between phrases) */
function separate(P: DictPhrase[]): DictPhrase[] {
  const bad = new Set<number>();
  for (let i = 0; i + 1 < P.length; i++) if (P[i].end > P[i + 1].start) bad.add(i);
  return P.filter((_, i) => !bad.has(i) && !bad.has(i - 1));
}
/** the accent phrases, or null when the words' morae do not add up to the labels' */
export function dictPhrases(text: string, njd: string[], labels: string[]): DictPhrase[] | null {
  const words = njdWords(njd),
    M = labelMorae(labels);
  if (words.reduce((a, w) => a + w.mora, 0) !== M.length) return null;
  const spans = place(text, words),
    out: (DictPhrase & { id: number })[] = [];
  let k = 0;
  words.forEach((w, i) => {
    if (w.mora === 0) return;
    const [a, z] = spans[i],
      id = M[k].phrase;
    if (!out.length || out[out.length - 1].id !== id) out.push({ id, start: a, end: z, morae: [] });
    const p = out[out.length - 1];
    p.start = Math.min(p.start, a);
    p.end = Math.max(p.end, z);
    p.morae.push(...M.slice(k, k + w.mora));
    k += w.mora;
  });
  return separate(out.map(({ start, end, morae }) => ({ start, end, morae })));
}
