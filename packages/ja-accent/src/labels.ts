// The accent of each mora from OpenJTalk's full-context labels: its phonemes, its Tokyo H / L and its accent phrase.
export type HL = "H" | "L";
export interface LabelMora {
  /** OpenJTalk phonemes of the mora (`ky`, `o`; `N`; `cl`; a long vowel is its vowel again) */
  ph: string[];
  hl: HL;
  /** accent phrase index in the text */
  phrase: number;
}

function num(rx: RegExp, s: string): number | null {
  const m = rx.exec(s);
  return m === null || m[1] === "xx" ? null : Number(m[1]);
}
/** H or L for mora pos (1-based) of an accent phrase of the given accent type (0 = flat) */
function tokyo(pos: number, accent: number): HL {
  if (accent === 1) return pos === 1 ? "H" : "L";
  if (pos === 1) return "L";
  return accent === 0 || pos <= accent ? "H" : "L";
}
export function labelMorae(labels: string[]): LabelMora[] {
  const out: LabelMora[] = [],
    ids = new Map<string, number>();
  let last: string | null = null;
  for (const lab of labels) {
    const i = lab.indexOf("-"),
      p = lab.slice(i + 1, lab.indexOf("+", i)); // a^b-p+c=d/…: the phoneme
    if (p === "sil" || p === "pau") {
      last = null;
      continue;
    }
    const pos = num(/\/A:[0-9-]+\+(\d+)\+/, lab) ?? 0,
      accent = num(/\/F:\d+_(\d+)#/, lab) ?? 0;
    const phrase = `${num(/\/I:\d+-\d+@(\d+)\+/, lab)} ${num(/\/F:\d+_\d+#\d+_\w+@(\d+)_/, lab)}`;
    const here = `${phrase}/${pos}`;
    if (here !== last) {
      if (!ids.has(phrase)) ids.set(phrase, ids.size);
      out.push({ ph: [], hl: tokyo(pos, accent), phrase: ids.get(phrase) ?? 0 });
      last = here;
    }
    out[out.length - 1].ph.push(p);
  }
  return out;
}
