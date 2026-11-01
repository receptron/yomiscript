// The dictionary accent without the dictionary: the front end's output for four sentences is recorded in
// fixtures/analysis.json (its analysis of the text) and fixtures/lookup.json (what the lookup of D31 asks it:
// fixtures/record.mjs), from the WebAssembly with the NAIST-JDIC dictionary, and replayed by a fake analyzer.
import fs from "node:fs";
import { parse } from "@yomiscript/core";
import { describe, expect, it, vi } from "vitest";
import type { Katarite, Speech } from "@yomiscript/core";
import {
  accentMarks,
  accentYomite,
  bestPath,
  labelMorae,
  needsAccent,
  USER_DICT,
  withAccent,
  wordsOf,
  type Analysis,
  type Analyzer,
  type Sentence,
} from "../src/index.ts";

interface Recorded {
  ys: string;
  text: string;
  njd: string[];
  labels: string[];
}
const REC: Recorded[] = JSON.parse(fs.readFileSync(new URL("./fixtures/analysis.json", import.meta.url), "utf8"));
const LOOKUP: { candidates: Record<string, Sentence>; conn: Record<string, number>; label: Record<string, Analysis> } = JSON.parse(
  fs.readFileSync(new URL("./fixtures/lookup.json", import.meta.url), "utf8"),
);
function recorded<T>(table: Record<string, T>, key: string): T {
  if (!(key in table)) throw new Error(`not recorded: ${key}`);
  return table[key];
}
const fake: Analyzer = {
  analyze: (text) => {
    const r = REC.find((x) => x.text === text);
    if (!r) throw new Error(`not recorded: ${text}`);
    return { njd: r.njd, labels: r.labels };
  },
  candidates: (words) => recorded(LOOKUP.candidates, JSON.stringify(words)),
  conn: (r, l) => recorded(LOOKUP.conn, `${r},${l}`),
  label: (words, path) => recorded(LOOKUP.label, JSON.stringify([words, path])),
};
const [shiatoru, kyou, eeto, shigatsu] = REC.map((r) => r.ys);
const bare = (ys: string) => ys.replace(/<t:[^>]*>/g, "");

describe("labelMorae", () => {
  it("gives each mora its phonemes, Tokyo H / L and accent phrase", () => {
    const M = labelMorae(REC[1].labels);
    expect(M.slice(0, 3)).toEqual([
      { ph: ["ky", "o"], hl: "H", phrase: 0 },
      { ph: ["o"], hl: "L", phrase: 0 },
      { ph: ["w", "a"], hl: "L", phrase: 0 },
    ]);
  });
});

describe("accentMarks", () => {
  it("marks the phrases the dictionary reads the same way", () => {
    expect(bare(accentMarks(kyou, fake))).toBe("ja /kʲoꜜː wa | haꜛɾeꜜte | iꜛmaꜜsɯ ↘/");
  });
  it("looks up the YomiScript's own reading (市: the YomiScript いち, OpenJTalk's analysis し)", () => {
    expect(bare(accentMarks(shiatoru, fake))).toBe("ja /ɕiꜜatoɾɯ no | iꜜtɕi de wa ‖ saꜛkana ɡa | ɯꜛɾaɾete | iꜛɾɯ ↘/");
  });
  it("with { analysis: true }, leaves a phrase OpenJTalk's analysis reads another way unmarked (D25)", () => {
    expect(bare(accentMarks(shiatoru, fake, { analysis: true }))).toBe("ja /ɕiꜜatoɾɯ no | itɕi de wa ‖ saꜛkana ɡa | ɯꜛɾaɾete | iꜛɾɯ ↘/");
  });
  it("accepts a consonant + j for the palatalized consonant (kjoː = kʲoː)", () => {
    expect(bare(accentMarks(kyou.replace("kʲoː", "kjoː"), fake))).toContain("kjoꜜː wa");
  });
  it("finds the phrases after a character NFKC changes the length of (…)", () => {
    expect(bare(accentMarks(eeto, fake))).toBe("ja /eꜜːto ‖ soꜛɾe wa ‖ tɕoꜜtto ↘/");
  });
  it("places the numbers the dictionary writes as kanji numerals", () => {
    expect(bare(accentMarks(shigatsu, fake))).toBe("ja /ɕiꜛɡatsɯ | tsɯꜛitatɕiꜜ wa | ɲɯꜛːɡakɯꜜɕiki da ↘/");
  });
  it("never changes the reading or the original text", () => {
    for (const ys of [shiatoru, kyou, eeto, shigatsu]) {
      const out = accentMarks(ys, fake);
      const plain = (s: string) => s.replace(/[ꜛꜜ]/g, "").replace(/ \| /g, " ").replace(/\s+/g, " ");
      expect(plain(out)).toBe(plain(ys));
    }
  });
});

describe("bestPath", () => {
  // 市で as two words; the dictionary has 市 as シ (cheaper) and イチ, and で; every connection costs 0
  const S: Sentence = {
    norm: "市で",
    starts: [0, 1, 2],
    cands: [
      { s: 0, e: 1, ph: [["sh", "i"]], cost: 100, l: 1, r: 1 },
      { s: 0, e: 1, ph: [["i"], ["ch", "i"]], cost: 500, l: 1, r: 1 },
      { s: 1, e: 2, ph: [["d", "e"]], cost: 100, l: 2, r: 2 },
    ],
    alone: [0, 2],
  };
  const flat = { conn: () => 0 } as unknown as Analyzer;
  const words = (ys: string) => wordsOf(parse(ys));
  it("takes the entries that read as the YomiScript does, not the cheapest", () => {
    expect(bestPath(S, words("ja /itɕi<t:市> de<t:で> ↘/"), flat)).toEqual({ path: [1, 2], fell: [] });
    expect(bestPath(S, words("ja /ɕi<t:市> de<t:で> ↘/"), flat)).toEqual({ path: [0, 2], fell: [] });
  });
  it("takes a word no entry reads that way as OpenJTalk's analysis reads it", () => {
    expect(bestPath(S, words("ja /matɕi<t:市> de<t:で> ↘/"), flat)).toEqual({ path: [0, 2], fell: [0] });
  });
});

describe("needsAccent", () => {
  it("is for Japanese with <t:…> and no marks or values of its own", () => {
    expect(needsAccent(kyou)).toBe(true);
    expect(needsAccent("ja /kʲoː wa ↘/")).toBe(false);
    expect(needsAccent("ja /kʲoꜜː<t:今日> wa<t:は> ↘/")).toBe(false);
    expect(needsAccent("ja /kʲo<f0:2>ː<t:今日> wa<t:は> ↘/")).toBe(false);
    expect(needsAccent("en-US /ˈhɛ.loʊ<t:Hello> ↘/")).toBe(false);
    expect(needsAccent("ja /kʲoː<t:今日")).toBe(false);
  });
});

describe("accentYomite", () => {
  it("writes the values for the marked phrases (ACCENT_SCALE)", () => {
    expect(bare(accentYomite(fake)(kyou))).toBe(
      "ja /kʲo<f0:2.63,3.72,4.93>ꜜː<f0:5.46,5.24,2.94> wa<f0:2,-0.5,-1.99> | ha<f0:-0.61,-0.9,-0.25>ꜛɾe<f0:1.97,3.25,2.68>ꜜte<f0:3.5,0.79,-0.81> | i<f0:-1.7,-1.83,-1.89>ꜛma<f0:-0.44,0,-0.94>ꜜsɯ<f0:0.09,-0.9,-1.3> ↘/",
    );
  });
  it("leaves a YomiScript it does not mark as it is", () => {
    const ys = "en-US /ˈhɛ.loʊ<t:Hello> ↘/";
    expect(accentYomite(fake)(ys)).toBe(ys);
  });
});

describe("withAccent", () => {
  const speech: Speech = { samples: new Float32Array(1), sampleRate: 24000, texts: [], times: [] };
  const inner = (): Katarite & { got: string[] } => {
    const got: string[] = [];
    return { name: "kokoro", languages: ["ja", "en"], got, speak: async (ys) => (got.push(ys), speech) };
  };
  it("loads the step once, on the first YomiScript that needs it", async () => {
    const k = inner(),
      load = vi.fn(async () => accentYomite(fake));
    const w = withAccent(k, load);
    await w.speak("en-US /ˈhɛ.loʊ<t:Hello> ↘/");
    expect(load).not.toHaveBeenCalled();
    await w.speak(kyou);
    await w.speak(kyou);
    expect(load).toHaveBeenCalledTimes(1);
    expect(k.got[1]).toContain("<f0:2.63,3.72,4.93>");
  });
  it("speaks the YomiScript as it is when the step cannot be loaded, and says so once", async () => {
    const k = inner(),
      onError = vi.fn();
    const w = withAccent(k, async () => Promise.reject(new Error("offline")), onError);
    await w.speak(kyou);
    await w.speak(kyou);
    expect(k.got).toEqual([kyou, kyou]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("USER_DICT", () => {
  const rows = USER_DICT.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  it("has rows in NAIST-JDIC's format: 15 fields, numeric ids and cost, katakana readings, accent/morae", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const f = r.split(",");
      expect(f).toHaveLength(15);
      expect(f.slice(1, 4).every((x) => /^-?\d+$/.test(x))).toBe(true);
      expect(f[11]).toMatch(/^[ァ-ヴー]+$/);
      expect(f[13]).toMatch(/^\d+\/\d+$/);
    }
  });
});
