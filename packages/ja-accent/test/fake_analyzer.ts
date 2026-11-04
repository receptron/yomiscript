// The front end's recorded answers (fixtures/record.mjs), replayed: what the tests of this package use for the dictionary.
import fs from "node:fs";
import type { Analysis, Analyzer, Sentence } from "../src/index.ts";

interface Recorded {
  ys: string;
  text: string;
  njd: string[];
  labels: string[];
}
export const REC: Recorded[] = JSON.parse(fs.readFileSync(new URL("./fixtures/analysis.json", import.meta.url), "utf8"));
export const LOOKUP: { candidates: Record<string, Sentence>; conn: Record<string, number>; label: Record<string, Analysis> } = JSON.parse(
  fs.readFileSync(new URL("./fixtures/lookup.json", import.meta.url), "utf8"),
);
function recorded<T>(table: Record<string, T>, key: string): T {
  if (!(key in table)) throw new Error(`not recorded: ${key}`);
  return table[key];
}
export const fake: Analyzer = {
  analyze: (text) => {
    const r = REC.find((x) => x.text === text);
    if (!r) throw new Error(`not recorded: ${text}`);
    return { njd: r.njd, labels: r.labels };
  },
  candidates: (words) => recorded(LOOKUP.candidates, JSON.stringify(words)),
  conn: (r, l) => recorded(LOOKUP.conn, `${r},${l}`),
  label: (words, path, _accents, chain) => recorded(LOOKUP.label, JSON.stringify(chain ? [words, path, chain] : [words, path])),
};
