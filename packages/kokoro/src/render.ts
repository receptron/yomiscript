// Audio-side rendering, engine-independent: the YomiScript's pitch values put into the engine's F0, joining the
// audio of several language sections, and WAV encoding.
import { SR, type PlanUnit } from "./plan.ts";

const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
function unitFrames(uid: number[], dur: number[], n: number): number[] {
  // the unit index of each F0 frame (2 frames per duration step), -1 for BOS / EOS
  const fu: number[] = [];
  dur.forEach((d, l) => {
    for (let r = 0; r < d * 2; r++) fu.push(uid[l]);
  });
  fu.length = Math.min(fu.length, n);
  return fu;
}
function valueAt(c: number[], x: number): number {
  // a unit's contour c (points spread evenly) at position x in [0, 1]
  if (c.length === 1) return c[0];
  const pos = x * (c.length - 1),
    a = Math.min(Math.floor(pos), c.length - 2);
  return c[a] + (c[a + 1] - c[a]) * (pos - a);
}
function frameTargets(fu: number[], U: PlanUnit[], n: number, dstep: number): Float64Array {
  // semitone target per frame from the units' values, lowered by dstep per phrase (declination)
  const st = new Float64Array(n).fill(NaN);
  U.forEach(([, c, ph], k) => {
    if (c === null) return;
    const fr: number[] = [];
    for (let i = 0; i < fu.length; i++) if (fu[i] === k) fr.push(i);
    fr.forEach((i, j) => (st[i] = valueAt(c, fr.length > 1 ? j / (fr.length - 1) : 0) - dstep * ph));
  });
  return st;
}
function anchorPhrases(st: Float64Array, f0: ArrayLike<number>, fu: number[], U: PlanUnit[]): Float64Array {
  // values are relative: each phrase keeps its shape and takes the mean level of the engine's own F0 there
  const n = f0.length,
    lo = Array.from(f0, (v) => Math.log2(Math.max(v, 1)) * 12);
  const phr = Array.from({ length: n }, (_, i) => (i < fu.length && fu[i] >= 0 ? U[fu[i]][2] : -1));
  const ok = Array.from({ length: n }, (_, i) => !isNaN(st[i]) && f0[i] > 60);
  const tgt = new Float64Array(n).fill(NaN);
  for (const ph of new Set(phr.filter((_, i) => ok[i]))) {
    const sel: number[] = [];
    for (let i = 0; i < n; i++) if (ok[i] && phr[i] === ph) sel.push(i);
    const ms = mean(sel.map((i) => st[i])),
      ml = mean(sel.map((i) => lo[i]));
    for (const i of sel) tgt[i] = st[i] - ms + ml;
  }
  return tgt;
}
function interpolate(tgt: Float64Array, xs: number[]): Float64Array {
  // fill the frames between targets linearly, and hold the first / last target outside them
  const n = tgt.length,
    full = new Float64Array(n);
  let q = 0;
  for (let i = 0; i < n; i++) {
    if (i <= xs[0]) full[i] = tgt[xs[0]];
    else if (i >= xs[xs.length - 1]) full[i] = tgt[xs[xs.length - 1]];
    else {
      while (xs[q + 1] < i) q++;
      const a = xs[q],
        b = xs[q + 1];
      full[i] = tgt[a] + ((tgt[b] - tgt[a]) * (i - a)) / (b - a);
    }
  }
  return full;
}
function movingAverage(full: Float64Array, smooth: number): Float64Array {
  const n = full.length,
    h = smooth >> 1,
    sm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = -h; j <= h; j++) s += full[Math.min(n - 1, Math.max(0, i + j))];
    sm[i] = s / smooth;
  }
  return sm;
}
// the engine's F0 with the YomiScript's pitch values put in (frames without a value keep the engine's F0)
export function f0Override(f0: ArrayLike<number>, uid: number[], dur: number[], U: PlanUnit[], smooth = 5, dstep = 0.6): Float32Array {
  const fu = unitFrames(uid, dur, f0.length);
  const tgt = anchorPhrases(frameTargets(fu, U, f0.length, dstep), f0, fu, U);
  const xs: number[] = [];
  for (let i = 0; i < f0.length; i++) if (!isNaN(tgt[i])) xs.push(i);
  if (!xs.length) return Float32Array.from(f0);
  const sm = movingAverage(interpolate(tgt, xs), smooth);
  return Float32Array.from(f0, (v, i) => (isNaN(tgt[i]) ? v : 2 ** (sm[i] / 12)));
}
const rms = (a: Float32Array): number => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
function trim(a: Float32Array, lead = true, th = 0.01): Float32Array {
  let i0 = -1,
    i1 = -1;
  for (let i = 0; i < a.length; i++)
    if (Math.abs(a[i]) > th) {
      if (i0 < 0) i0 = i;
      i1 = i;
    }
  if (i0 < 0) return a;
  return a.slice(lead ? Math.max(i0 - 240, 0) : 0, Math.min(a.length, i1 + 480));
}
// the audio of several sections as one: trimmed, level-matched, crossfaded, with a short gap
export function join(P: Float32Array[]): Float32Array {
  const tgt = rms(P[0]);
  let out = Float32Array.from(trim(P[0], false));
  const n = Math.round(0.015 * SR),
    gap = Math.round(0.06 * SR);
  for (const p0 of P.slice(1)) {
    const g = tgt / Math.max(rms(p0), 1e-6);
    const p = Float32Array.from(trim(p0), (v) => v * g);
    for (let i = 0; i < n && i < out.length; i++) out[out.length - n + i] *= 1 - i / (n - 1);
    for (let i = 0; i < n && i < p.length; i++) p[i] *= i / (n - 1);
    const o = new Float32Array(out.length + gap + p.length);
    o.set(out);
    o.set(p, out.length + gap);
    out = o;
  }
  let mx = 0;
  for (const v of out) mx = Math.max(mx, Math.abs(v));
  const k = Math.max(1, mx / 0.95);
  return out.map((v) => v / k);
}
// 16-bit mono WAV
export function wav(a: Float32Array, sr = SR): ArrayBuffer {
  const b = new ArrayBuffer(44 + a.length * 2),
    d = new DataView(b);
  const w = (o: number, s: string) => [...s].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  d.setUint32(4, 36 + a.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  d.setUint32(16, 16, true);
  d.setUint16(20, 1, true);
  d.setUint16(22, 1, true);
  d.setUint32(24, sr, true);
  d.setUint32(28, sr * 2, true);
  d.setUint16(32, 2, true);
  d.setUint16(34, 16, true);
  w(36, "data");
  d.setUint32(40, a.length * 2, true);
  a.forEach((v, i) => d.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true));
  return b;
}
