// An accent phrase's nucleus as one number: 0 flat (ꜛ after its first mora), 1 falls after its first (ꜜ there), k rises
// after the first and falls after its k-th, the last included. What eval/qwen_prosody reads from Qwen and what the pitch
// model (pitch.ts) starts from are the dictionary's marks in these terms.
import { isJa, parse, type Edit, type Section, type Token } from "@yomiscript/core";

/** the units of each accent phrase of a section */
export function phraseUnits(sec: Section): Token[][] {
  const by = new Map<number, Token[]>();
  for (const t of sec.toks) if (t.kind === "unit") by.set(t.ph, [...(by.get(t.ph) ?? []), t]);
  return [...by.values()];
}
/** the nucleus a phrase is marked with */
export function nucleusOf(P: Token[]): number {
  const f = P.findIndex((t) => t.fall);
  return f < 0 ? 0 : f + 1;
}
/** the marks of one phrase for nucleus k */
export function marksFor(P: Token[], k: number): Edit[] {
  if (k === 1) return [{ at: P[0].end ?? 0, ins: "ꜜ" }];
  const E = [{ at: P[0].end ?? 0, ins: "ꜛ" }];
  if (k > 1) E.push({ at: P[k - 1].end ?? 0, ins: "ꜜ" });
  return E;
}
/** the phrases of a Japanese section with the nucleus each is marked with (null: a phrase of one mora, which has no
 * choice) and those marks as edits on the string without marks */
export interface StartSection {
  G: Token[][];
  start: (number | null)[];
  kept: Edit[][];
}
/** a marked YomiScript's marks taken apart: the string without them, and each Japanese section's phrases */
export function startPhrases(marked: string): { bare: string; sections: StartSection[] } {
  const bare = marked.replace(/[ꜛꜜ]/g, ""),
    ja = (ys: string) => parse(ys).sections.filter((s) => isJa(s.lang)),
    M = ja(marked);
  const sections = ja(bare).map((sec, s) => {
    const G = phraseUnits(sec),
      G0 = phraseUnits(M[s]);
    return {
      G,
      start: G0.map((P) => (P.length > 1 ? nucleusOf(P) : null)),
      kept: G.map((P, i) =>
        P.flatMap((t, j) => [...(G0[i][j].rise ? [{ at: t.end ?? 0, ins: "ꜛ" }] : []), ...(G0[i][j].fall ? [{ at: t.end ?? 0, ins: "ꜜ" }] : [])]),
      ),
    };
  });
  return { bare, sections };
}
/** the edits that mark every phrase with its nucleus (null: the marks it had) */
export function phraseEdits(G: Token[][], nuclei: (number | null)[], kept: Edit[][]): Edit[] {
  return G.flatMap((P, i) => {
    const k = nuclei[i];
    return k === null ? kept[i] : marksFor(P, k);
  });
}
