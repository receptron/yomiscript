// The pitch model (D33) without the model: a tiny random one, with what PyTorch's LSTM makes of an input
// (fixtures/record_pitch.py), and the dictionary's recorded answers.
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import { JA_CONTOUR, jaContour, parse } from "@yomiscript/core";
import { describe, expect, it } from "vitest";
import {
  accentMarks,
  accentYomite,
  loadPitchModel,
  marksFor,
  nucleusOf,
  PITCH_FILES,
  phraseUnits,
  pitchResidual,
  pitchRows,
  pitchOrAccentYomite,
  pitchYomite,
  startPhrases,
  type PitchModel,
  type PitchRow,
} from "../src/index.ts";
import { fake, REC } from "./fake_analyzer.ts";

interface TinyModel extends Pick<PitchModel, "vocab" | "clip"> {
  tensors: Record<string, { shape: number[]; data: number[] }>;
  /** an input and PyTorch's output for it */
  morae: PitchRow[];
  out: number[][];
}
const T = JSON.parse(fs.readFileSync(new URL("./fixtures/pitch_tiny.json", import.meta.url), "utf8")) as TinyModel;
const tensors = Object.fromEntries(Object.entries(T.tensors).map(([k, v]) => [k, { shape: v.shape, data: Float32Array.from(v.data) }]));
const tiny: PitchModel = { vocab: T.vocab, clip: T.clip, contour: JA_CONTOUR, tensors };
const kyou = REC[1].ys;
const units = (ys: string) => parse(ys).sections[0].toks.filter((t) => t.kind === "unit");

describe("pitchResidual", () => {
  it("is what PyTorch's two-layer bidirectional LSTM gives", () => {
    const R = pitchResidual(tiny, T.morae);
    R.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(T.out[i][j], 5)));
  });
});

describe("nuclei", () => {
  it("reads a phrase's marks back as its nucleus, a final fall included", () => {
    const ys = "ja /kaꜛsate<t:傘> ɡa<t:が> ↘/",
      { sections } = startPhrases(ys);
    expect(sections[0].start).toEqual([0]);
    expect(nucleusOf(phraseUnits(parse("ja /kaꜛsateꜜ ↘/").sections[0])[0])).toBe(3);
    const P = phraseUnits(parse("ja /kasate ↘/").sections[0])[0];
    expect(marksFor(P, 3).map((e) => e.ins)).toEqual(["ꜛ", "ꜜ"]);
    expect(marksFor(P, 1).map((e) => e.ins)).toEqual(["ꜜ"]);
    expect(marksFor(P, 0).map((e) => e.ins)).toEqual(["ꜛ"]);
  });
});

describe("pitchRows", () => {
  it("gives each mora its word, its place, the boundary before it and the phrase's nucleus", () => {
    const U = parse("ja /kʲoː<t:今日> wa<t:は> | haɾete<t:晴れて> ↘/"),
      { morae, phrases } = pitchRows(U.sections[0], U.texts, [1, 2]);
    expect(phrases).toEqual([
      { start: 0, len: 3, d31: 1 },
      { start: 3, len: 3, d31: 2 },
    ]);
    expect(morae[0]).toMatchObject({ ipa: "kʲo", word: "今日", bound: "start", ppos: 0, plen: 3, wpos: 0, wlen: 2, d31nuc: 1 });
    expect(morae[2]).toMatchObject({ ipa: "wa", word: "は", bound: "", ppos: 2, wpos: 0, wlen: 1 });
    expect(morae[3]).toMatchObject({ word: "晴れて", bound: "#", ppos: 0, d31nuc: 2 });
  });
});

describe("pitchYomite", () => {
  const step = pitchYomite(fake, tiny),
    out = step(kyou);
  it("keeps the reading and the dictionary's marks, and writes values for every mora", () => {
    expect(parse(out).texts).toEqual(parse(kyou).texts);
    expect(out.replace(/<f0:[^>]*>/g, "").replace(/<t:[^>]*>/g, "")).toBe("ja /kʲoꜜː wa | haꜜɾete | iꜛmaꜜsɯ ↘/");
    expect(units(out).every((t) => t.f0?.length === 3)).toBe(true);
  });
  it("adds the prediction to the values the marks give", () => {
    const U = parse(accentMarks(kyou, fake)),
      sec = U.sections[0],
      contour = jaContour(sec, JA_CONTOUR),
      { sections } = startPhrases(accentMarks(kyou, fake)),
      R = pitchResidual(tiny, pitchRows(sec, U.texts, sections[0].start).morae);
    units(out).forEach((t, i) => {
      const base = contour.get(sec.toks.filter((x) => x.kind === "unit")[i]) ?? [];
      t.f0?.forEach((v, j) => expect(v).toBeCloseTo(base[j] + R[i][j], 1));
    });
  });
  it("leaves a YomiScript with no text as it is", () => {
    expect(step("ja /kʲoː wa ↘/")).toBe("ja /kʲoː wa ↘/");
  });
});

describe("pitchYomite on what the training texts did not have", () => {
  const step = pitchYomite(fake, tiny),
    noValues = (ys: string) => ys.replace(/<f0:[^>]*>/g, "");
  it("takes a word named like a property of every object as unknown", () => {
    const out = step("ja /kʲoː<t:今日> wa<t:は> | koɴsɯtoɾakɯta<t:constructor> | desɯ<t:です。> ↘/");
    expect(out).not.toContain("NaN");
    const row = (word: string): PitchRow => ({ ipa: "a", word, bound: "#", ppos: 0, plen: 2, wpos: 0, wlen: 2, d31nuc: 0 });
    for (const word of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(word in {}).toBe(true);
      expect(pitchResidual(tiny, [row(word)])).toEqual(pitchResidual(tiny, [row("誰も知らない語")]));
    }
  });
  it("writes no mark on a phrase the dictionary left alone", () => {
    const ys = "ja /kʲoː<t:今日> wa<t:は> | mamima<t:晴れて> | imasɯ<t:います。> ↘/",
      out = step(ys);
    expect(noValues(out)).toBe(accentMarks(ys, fake));
    expect(noValues(out)).toContain(" | mamima<t:晴れて> | ");
    expect(units(out).every((t) => t.f0?.length === 3)).toBe(true);
  });
  it("keeps another language's marks, and writes values only in Japanese", () => {
    const out = step("ja /kʲoː<t:今日> wa<t:は> | haɾete<t:晴れて> {en həꜛloʊ<t:hello>} imasɯ<t:います。> ↘/");
    expect(out).toContain("{en həꜛloʊ<t:hello>}");
    expect(out.slice(out.indexOf("{"), out.indexOf("}"))).not.toContain("<f0:");
  });
});

describe("startPhrases", () => {
  it("takes out the marks of Japanese morae only", () => {
    expect(startPhrases("ja /kʲoꜜː<t:今日ꜛ> wa<t:は> | haꜛɾe {en həꜛloʊ<t:aꜜb>} aꜜme ↘/").bare).toBe(
      "ja /kʲoː<t:今日ꜛ> wa<t:は> | haɾe {en həꜛloʊ<t:aꜜb>} ame ↘/",
    );
    expect(startPhrases("en-US /həꜛloʊ {ja aꜜme} ðeɪꜛ ↘/").bare).toBe("en-US /həꜛloʊ {ja ame} ðeɪꜛ ↘/");
  });
});

describe("pitchOrAccentYomite", () => {
  const ys = "ja /a<t:亜>/";
  it("uses the model when it loads", async () => {
    const step = await pitchOrAccentYomite(fake, async () => tiny);
    expect(step(ys)).toBe(pitchYomite(fake, tiny)(ys));
  });
  it("tells why and uses the dictionary accent when it does not", async () => {
    const seen: unknown[] = [],
      step = await pitchOrAccentYomite(
        fake,
        async () => {
          throw new Error("offline");
        },
        (e) => seen.push(e),
      );
    expect(step(ys)).toBe(accentYomite(fake)(ys));
    expect(seen).toHaveLength(1);
  });
});

describe("loadPitchModel", () => {
  const head = { vocab: T.vocab, clip: T.clip, contour: JA_CONTOUR, tensors: Object.entries(tensors).map(([k, v]) => [k, v.shape]) };
  const bin = Buffer.concat(Object.values(tensors).map((v) => Buffer.from(v.data.buffer)));
  const files = (b: Buffer) => async (f: string) => gzipSync(f === PITCH_FILES[0] ? JSON.stringify(head) : b);
  it("reads the tensors back from the two files", async () => {
    const M = await loadPitchModel(files(bin));
    expect(M.tensors["rnn.weight_ih_l1_reverse"].shape).toEqual(tensors["rnn.weight_ih_l1_reverse"].shape);
    expect(pitchResidual(M, T.morae)).toEqual(pitchResidual(tiny, T.morae));
  });
  it("refuses weights of another size", async () => {
    await expect(loadPitchModel(files(bin.subarray(4)))).rejects.toThrow("bytes of weights");
  });
});
