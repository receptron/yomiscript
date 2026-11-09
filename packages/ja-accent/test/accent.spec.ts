// The dictionary accent without the dictionary: the front end's output for four sentences is recorded in
// fixtures/analysis.json (its analysis of the text) and fixtures/lookup.json (what the lookup of D31 asks it:
// fixtures/record.mjs), from the WebAssembly with the NAIST-JDIC dictionary, and replayed by a fake analyzer.
import { parse } from "@yomiscript/core";
import { describe, expect, it, vi } from "vitest";
import type { Katarite, Speech } from "@yomiscript/core";
import { accentMarks, accentYomite, bestPath, labelMorae, needsAccent, USER_DICT, withAccent, wordsOf, type Analyzer, type Sentence } from "../src/index.ts";
import { fake, REC } from "./fake_analyzer.ts";

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
    expect(bare(accentMarks(kyou, fake))).toBe("ja /kʲoꜜː wa | haꜜɾete | iꜛmaꜜsɯ ↘/");
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
  it("leaves a section with no ` | ` to OpenJTalk, whatever the sections beside it write (D32)", () => {
    const last = (ys: string) => {
      const m = bare(accentMarks(ys, fake));
      return m.slice(m.indexOf("}"));
    };
    const rest = "{en ˈhɛloʊ<t:hello>} aɕita<t:明日> wa<t:は> ame<t:雨> desɯ<t:です。> ↘/";
    expect(last(`ja /kʲoː<t:今日> wa<t:は> | haɾete<t:晴れて> ${rest}`)).toBe(last(`ja /kʲoː<t:今日> wa<t:は> haɾete<t:晴れて> ${rest}`));
    expect(last(`ja /kʲoː<t:今日> wa<t:は> | haɾete<t:晴れて> ${rest}`)).toContain(" | ");
  });
  it("keeps the accent phrases the YomiScript writes itself, and puts the dictionary's accent in them (D32)", () => {
    const own = (ys: string) => bare(accentMarks(ys, fake));
    expect(own("ja /kʲoː<t:今日> wa<t:は> haɾete<t:晴れて> | imasɯ<t:います。> ↘/")).toBe("ja /kʲoꜜː wa haɾete | iꜛmaꜜsɯ ↘/");
    expect(own("ja /kʲoː<t:今日> wa<t:は> | haɾete<t:晴れて> imasɯ<t:います。> ↘/")).toBe("ja /kʲoꜜː wa | haꜛɾete imaꜜsɯ ↘/");
  });
  it("starts no phrase at a pause of no text (‖<t:>)", () => {
    expect(bare(accentMarks("ja /kʲoː<t:今日> wa<t:は> ‖<t:> haɾete<t:晴れて> imasɯ<t:います。> ↘/", fake))).toBe("ja /kʲoꜜː wa ‖ haꜜɾete | iꜛmaꜜsɯ ↘/");
  });
  it("reads a word the same with an opening quote: the quote changes neither the entry nor whether it is marked", () => {
    expect(bare(accentMarks("ja /kotoɲi<t:「ことに> | ɸɯtta<t:肥った> ↘/", fake))).toBe(bare(accentMarks("ja /kotoɲi<t:ことに> | ɸɯtta<t:肥った> ↘/", fake)));
    expect(bare(accentMarks("ja /kotoɲi<t:「ことに> | ɸɯtta<t:肥った> ↘/", fake))).toContain("koꜜtoɲi");
    expect(bare(accentMarks("ja /kaɾe<t:彼> wa<t:は> | kotoɲi<t:「ことに> | jasɯi<t:安い」> to<t:と> | iɯ<t:言う。> ↘/", fake))).toContain("koꜜtoɲi");
  });
  it("marks a phrase that starts after an opening quote, keeping the text", () => {
    const ys = "ja /soː<t:「そう> daɾoː<t:だろう。> ↘/",
      marked = accentMarks(ys, fake);
    expect(marked).not.toBe(ys);
    expect(parse(marked).texts.join("")).toBe("「そうだろう。");
  });
  it("leaves a quote written as its own <t:…> as it was", () => {
    expect(bare(accentMarks("ja /a<t:「> kotoɲi<t:ことに> ↘/", fake))).toContain("koꜜtoɲi");
  });
  it("never changes the reading or the original text", () => {
    for (const ys of [shiatoru, kyou, eeto, shigatsu]) {
      const out = accentMarks(ys, fake);
      const plain = (s: string) => s.replace(/[ꜛꜜ]/g, "").replace(/ \| /g, " ").replace(/\s+/g, " ");
      expect(plain(out)).toBe(plain(ys));
    }
  });
});

describe("the auxiliary てる / でる", () => {
  it("keeps the verb's own accent before the auxiliary てる / でる (D36)", () => {
    const fall = (reading: string, text: string) => bare(accentMarks(`ja /${reading}<t:${text}> ↘/`, fake));
    expect(fall("motteɾɯ", "持ってる")).toBe("ja /moꜜtteɾɯ ↘/");
    expect(fall("jondeɾɯ", "読んでる")).toBe("ja /joꜜndeɾɯ ↘/");
    expect(fall("hanaɕiteɾɯ", "話してる")).toBe("ja /haꜛnaꜜɕiteɾɯ ↘/");
  });
  it("leaves a verb with no fall without one before the auxiliary (呼んでる, 盛ってる: D36)", () => {
    expect(bare(accentMarks("ja /jondeɾɯ<t:呼んでる> ↘/", fake))).toBe("ja /joꜛndeɾɯ ↘/");
    expect(bare(accentMarks("ja /motteɾɯ<t:盛ってる> ↘/", fake))).toBe("ja /moꜛtteɾɯ ↘/");
  });
});

describe("a verb before て keeps the fall of its base form, when that is none or on the first mora", () => {
  const marks = (reading: string, text: string) => bare(accentMarks(`ja /${reading}<t:${text}> ↘/`, fake));
  it("no fall in the base form: none before て, whatever the entry of its stem says (寝る, 着る)", () => {
    expect(marks("neteɾɯ", "寝てる")).toBe("ja /neꜛteɾɯ ↘/");
    expect(marks("nete", "寝て")).toBe("ja /neꜛte ↘/");
    expect(marks("kiteɾɯ", "着てる")).toBe("ja /kiꜛteɾɯ ↘/");
    expect(marks("hetteɾɯ", "減ってる")).toBe("ja /heꜛtteɾɯ ↘/");
  });
  it("a fall on the first mora of the base form: there before て, whatever the entry of its stem says (出る)", () => {
    expect(marks("deteɾɯ", "出てる")).toBe("ja /deꜜteɾɯ ↘/");
    expect(marks("dete", "出て")).toBe("ja /deꜜte ↘/");
    expect(marks("totteɾɯ", "取ってる")).toBe("ja /toꜜtteɾɯ ↘/");
    expect(marks("miteɾɯ", "見てる")).toBe("ja /miꜜteɾɯ ↘/");
  });
  it("an ichidan verb that falls just before its る falls one mora earlier (食べる), and not on ん (信じる)", () => {
    expect(marks("kaneteɾɯ", "兼ねてる")).toBe("ja /kaꜜneteɾɯ ↘/");
    expect(marks("tabete", "食べて")).toBe("ja /taꜜbete ↘/");
    expect(marks("ɕiɾabete", "調べて")).toBe("ja /ɕiꜛɾaꜜbete ↘/");
    expect(marks("ɕindʑite", "信じて")).toBe("ja /ɕiꜜndʑite ↘/");
  });
  it("leaves an ichidan verb whose fall is elsewhere, and a godan verb (考える, 話す)", () => {
    expect(marks("kaŋɡaete", "考えて")).toBe("ja /kaꜛŋɡaꜜete ↘/");
    expect(marks("hanaɕiteɾɯ", "話してる")).toBe("ja /haꜛnaꜜɕiteɾɯ ↘/");
  });
  it("leaves the same stems not before て", () => {
    expect(marks("neta", "寝た")).toBe("ja /neꜜta ↘/");
  });
});

describe("当 or 弊 before one kanji", () => {
  const marks = (ys: string) => bare(accentMarks(ys, fake));
  it("falls on the first mora where the dictionary does not have the word (D39)", () => {
    expect(marks("ja /toːkeɴ<t:当軒> wa<t:は。> ↘/")).toBe("ja /toꜜːkeɴ wa ↘/");
    expect(marks("ja /toːçiɴ<t:当品> wa<t:は> ↘/")).toBe("ja /toꜜːçiɴ wa ↘/");
    expect(marks("ja /heːkoː<t:弊校> wa<t:は> ↘/")).toBe("ja /heꜜːkoː wa ↘/");
  });
  it("leaves words the dictionary has", () => {
    expect(marks("ja /toːten<t:当店> wa<t:は> ↘/")).toBe("ja /toꜜːten wa ↘/");
    expect(marks("ja /toːdzeɴ<t:当然> da<t:だ> ↘/")).toBe("ja /toꜛːdzeɴ da ↘/");
  });
});

describe("bestPath", () => {
  // 市で as two words; the dictionary has 市 as シ (cheaper) and イチ, and で; every connection costs 0
  const S: Sentence = {
    norm: "市で",
    starts: [0, 1, 2],
    cands: [
      { s: 0, e: 1, ph: [["sh", "i"]], cost: 100, l: 1, r: 1, pron: "シ", pos: "名詞,接尾", acc: 1 },
      { s: 0, e: 1, ph: [["i"], ["ch", "i"]], cost: 500, l: 1, r: 1, pron: "イチ", pos: "名詞,一般", acc: 2 },
      { s: 1, e: 2, ph: [["d", "e"]], cost: 100, l: 2, r: 2, pron: "デ", pos: "助詞,格助詞", acc: 0 },
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
      "ja /kʲo<f0:1.48,2.58,3.79>ꜜː<f0:4.64,4.65,2.36> wa<f0:1.01,-1.57,-2.78> | ha<f0:0,0.94,1.95>ꜜɾe<f0:2.76,2.24,0.39>te<f0:0.5,-2.48,-3.8> | i<f0:-4.1,-3.93,-3.62>ꜛma<f0:-1.58,-1.04,-1.88>ꜜsɯ<f0:-1.05,-2.04,-2.44> ↘/",
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
    expect(k.got[1]).toContain("<f0:1.48,2.58,3.79>");
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
  it("has the adverb そう falling after ソ, and leaves the そう of 降りそう (D40)", () => {
    expect(bare(accentMarks("ja /soː<t:そう> da<t:だ。> ↘/", fake))).toBe("ja /soꜜː da ↘/");
    expect(bare(accentMarks("ja /soː<t:「そう> daɾoː<t:だろう。> ↘/", fake))).toBe("ja /soꜜː daɾoː ↘/");
    expect(bare(accentMarks("ja /oɾisoː<t:降りそう> da<t:だ。> ↘/", fake))).not.toContain("soꜜː");
  });
  it("has 室 read へや with the accent of 部屋 (D39)", () => {
    expect(bare(accentMarks("ja /heja<t:室> e<t:へ> ↘/", fake))).toBe("ja /heꜛjaꜜ e ↘/");
  });
  it("corrects the accent of ぴかぴか, which falls on its first mora like くるくる (D38)", () => {
    expect(bare(accentMarks("ja /pikapika<t:ぴかぴか> ↘/", fake))).toBe("ja /piꜜkapika ↘/");
    expect(bare(accentMarks("ja /pikapika<t:ピカピカ> ↘/", fake))).toBe("ja /piꜜkapika ↘/");
  });
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
