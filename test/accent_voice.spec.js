// The accent editor's voice input (demo/ys_web/web/accent_voice.js): the pitch tracker, the alignment and the marks
// read from a reading's values, on made-up signals (no microphone, no model).
import { describe, expect, it } from "vitest";
import { SR, dtw, marksOf, mfcc, trim, yin } from "../demo/ys_web/web/accent_voice.js";

const tone = (hz, sec) => Float32Array.from({ length: Math.round(SR * sec) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / SR));
const join = (...parts) => Float32Array.from(parts.flatMap((p) => [...p]));

describe("yin", () => {
  it("hears the pitch of a tone, and nothing in silence", () => {
    const f0 = yin(join(new Float32Array(SR * 0.2), tone(150, 0.4), tone(240, 0.4)));
    const at = (sec) => f0[Math.round((sec * SR) / 300)];
    expect(at(0.05)).toBe(0);
    expect(at(0.4)).toBeCloseTo(150, 0);
    expect(at(0.8)).toBeCloseTo(240, 0);
  });
});

describe("trim", () => {
  it("cuts the silence around the sound, keeping a little of it", () => {
    const x = join(new Float32Array(SR), tone(200, 0.5), new Float32Array(SR));
    expect(trim(x).length).toBeGreaterThan(SR * 0.5);
    expect(trim(x).length).toBeLessThan(SR * 0.7);
  });
});

describe("dtw", () => {
  it("matches a sound with a slower copy of it, in order", () => {
    const a = join(tone(200, 0.2), tone(400, 0.2), tone(800, 0.2)),
      b = join(tone(200, 0.4), tone(400, 0.4), tone(800, 0.4));
    const path = dtw(mfcc(a), mfcc(b)),
      mid = (sec) => path[Math.round((sec * SR) / 300)];
    // the middle of each part of a falls in the same part of b
    expect(mid(0.1)[1] * 300).toBeLessThan(SR * 0.4);
    expect(mid(0.3)[0] * 300).toBeGreaterThan(SR * 0.4);
    expect(mid(0.3)[1] * 300).toBeLessThan(SR * 0.8);
    expect(mid(0.5)[0] * 300).toBeGreaterThan(SR * 0.8);
  });
});

describe("marksOf", () => {
  const v = (...m) => m.map((x) => (x === null ? null : [x, x, x]));
  it("puts the nucleus where the pitch falls most, and the rise after a low first mora", () => {
    expect(marksOf(v(-2, 1, 1, -2), ["mora", "mora", "mora", "mora"])).toEqual({ nucleus: 2, rise: 0 });
    expect(marksOf(v(1, -2), ["mora", "mora"])).toEqual({ nucleus: 0, rise: -1 });
    expect(marksOf(v(-2, 1, 1), ["mora", "mora", "mora"])).toEqual({ nucleus: -1, rise: 0 });
  });
  it("starts high and level when nothing rises or falls enough", () => {
    expect(marksOf(v(1, 0.5, 0.2), ["mora", "mora", "mora"])).toEqual({ nucleus: -1, rise: -1 });
  });
  it("puts a fall after a special mora on the mora before it, and skips unvoiced morae", () => {
    expect(marksOf(v(-1, -0.8, -6.9, -5.7), ["mora", "R", "mora", "mora"])).toEqual({ nucleus: 0, rise: -1 });
    expect(marksOf(v(-2, 1, null, -3), ["mora", "mora", "mora", "mora"])).toEqual({ nucleus: -1, rise: 0 });
  });
});
