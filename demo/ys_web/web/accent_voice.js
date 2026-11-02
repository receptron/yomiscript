// The accent editor's voice input (accent_edit.html): the listener reads the sentence, and the pitch of their reading
// becomes the values of each mora. Their recording is aligned with Kokoro's audio of the same YomiScript by DTW on
// MFCCs (as eval/prosody_ref aligns a reference with ours); Kokoro's durations say where each mora is in its audio, the
// path says where that is in the recording, and the recording's pitch there (YIN) gives the mora three values (the
// start, middle and end of its voiced part), in semitones from the median of the reading. All in the browser; the
// recording is not kept.

export const SR = 24000;
const HOP = 300, // one F0 frame of Kokoro (2 per duration step of 600 samples)
  WIN = 1024,
  FMIN = 70,
  FMAX = 500;

/** records from the microphone until stop() is called; resolves to mono samples at SR */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
  const rec = new MediaRecorder(stream),
    parts = [];
  rec.ondataavailable = (e) => parts.push(e.data);
  const done = new Promise((resolve, reject) => {
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      try {
        const ctx = new AudioContext({ sampleRate: SR });
        const buf = await ctx.decodeAudioData(await new Blob(parts, { type: rec.mimeType }).arrayBuffer());
        await ctx.close();
        resolve(buf.getChannelData(0).slice());
      } catch (e) {
        reject(e);
      }
    };
  });
  rec.start();
  return { stop: () => (rec.stop(), done) };
}

/** the samples without the silence before and after the speech (frame energy under 1/30 of the loudest frame's) */
export function trim(x) {
  const E = [];
  for (let i = 0; i + HOP <= x.length; i += HOP) {
    let e = 0;
    for (let j = i; j < i + HOP; j++) e += x[j] * x[j];
    E.push(e / HOP);
  }
  const top = Math.max(...E, 1e-12),
    on = E.map((e) => e > top / 30 ** 2);
  const a = Math.max(0, on.indexOf(true) - 4),
    b = Math.min(E.length, on.lastIndexOf(true) + 5);
  return a < b ? x.slice(a * HOP, b * HOP) : x;
}

/** in-place radix-2 FFT of re / im (length a power of two) */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j], im[i], im[j]] = [re[j], re[i], im[j], im[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const [c, s] = [Math.cos(ang * k), Math.sin(ang * k)],
          [p, q] = [i + k, i + k + len / 2];
        const tr = re[q] * c - im[q] * s,
          ti = re[q] * s + im[q] * c;
        [re[q], im[q]] = [re[p] - tr, im[p] - ti];
        [re[p], im[p]] = [re[p] + tr, im[p] + ti];
      }
  }
}

const NFFT = 512,
  MELS = 26,
  CEPS = 13;
/** triangular mel filters over the bins of NFFT, 80 Hz to 7.6 kHz */
function melBank() {
  const mel = (f) => 2595 * Math.log10(1 + f / 700),
    hz = (m) => 700 * (10 ** (m / 2595) - 1);
  const lo = mel(80),
    hi = mel(7600),
    edges = Array.from({ length: MELS + 2 }, (_, i) => (hz(lo + ((hi - lo) * i) / (MELS + 1)) * NFFT) / SR);
  return Array.from({ length: MELS }, (_, m) =>
    Array.from({ length: NFFT / 2 + 1 }, (_, k) =>
      Math.max(0, Math.min((k - edges[m]) / (edges[m + 1] - edges[m]), (edges[m + 2] - k) / (edges[m + 2] - edges[m + 1]))),
    ),
  );
}
const BANK = melBank();

/** MFCCs 1..12 of each HOP frame, mean-normalised over the utterance */
export function mfcc(x) {
  const out = [],
    hann = Array.from({ length: NFFT }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / NFFT));
  for (let t = 0; t * HOP < x.length; t++) {
    const re = new Float64Array(NFFT),
      im = new Float64Array(NFFT),
      at = t * HOP - NFFT / 2 + HOP / 2;
    for (let i = 0; i < NFFT; i++) re[i] = (x[at + i] ?? 0) * hann[i];
    fft(re, im);
    const logMel = BANK.map((f) => Math.log(1e-10 + f.reduce((s, w, k) => s + w * (re[k] * re[k] + im[k] * im[k]), 0)));
    out.push(Array.from({ length: CEPS - 1 }, (_, c) => logMel.reduce((s, v, m) => s + v * Math.cos((Math.PI * (c + 1) * (m + 0.5)) / MELS), 0)));
  }
  const mean = out[0].map((_, c) => out.reduce((s, r) => s + r[c], 0) / out.length);
  return out.map((r) => r.map((v, c) => v - mean[c]));
}

function cosDist(a, b) {
  let ab = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) [ab, aa, bb] = [ab + a[i] * b[i], aa + a[i] * a[i], bb + b[i] * b[i]];
  return 1 - ab / Math.sqrt(aa * bb + 1e-12);
}
/** the DTW path from A to B: for each frame of A, the first and last frame of B it is matched with */
export function dtw(A, B) {
  const n = A.length,
    m = B.length,
    D = new Float64Array((n + 1) * (m + 1)).fill(Infinity),
    at = (i, j) => i * (m + 1) + j;
  D[0] = 0;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) D[at(i, j)] = cosDist(A[i - 1], B[j - 1]) + Math.min(D[at(i - 1, j - 1)], D[at(i - 1, j)], D[at(i, j - 1)]);
  const span = Array.from({ length: n }, () => [Infinity, -1]);
  for (let i = n, j = m; i > 0 && j > 0;) {
    const s = span[i - 1];
    [s[0], s[1]] = [Math.min(s[0], j - 1), Math.max(s[1], j - 1)];
    const best = Math.min(D[at(i - 1, j - 1)], D[at(i - 1, j)], D[at(i, j - 1)]);
    if (best === D[at(i - 1, j - 1)]) [i, j] = [i - 1, j - 1];
    else if (best === D[at(i - 1, j)]) i--;
    else j--;
  }
  return span;
}

/** the F0 (Hz, 0 unvoiced) of each HOP frame by YIN */
export function yin(x, threshold = 0.15) {
  const tauMin = Math.floor(SR / FMAX),
    tauMax = Math.ceil(SR / FMIN),
    out = [];
  for (let t = 0; t * HOP < x.length; t++) {
    const at = t * HOP - WIN / 2 + HOP / 2,
      d = new Float64Array(tauMax + 1);
    for (let tau = 1; tau <= tauMax; tau++)
      for (let i = 0; i < WIN - tauMax; i++) {
        const v = (x[at + i] ?? 0) - (x[at + i + tau] ?? 0);
        d[tau] += v * v;
      }
    out.push(yinPick(d, tauMin, tauMax, threshold));
  }
  return median3(out);
}
function yinPick(d, tauMin, tauMax, threshold) {
  // the cumulative mean normalised difference's first dip under the threshold, refined by a parabola
  let sum = 0;
  const c = new Float64Array(tauMax + 1).fill(1);
  for (let tau = 1; tau <= tauMax; tau++) {
    sum += d[tau];
    c[tau] = sum > 0 ? (d[tau] * tau) / sum : 1;
  }
  for (let tau = tauMin; tau < tauMax; tau++) {
    if (c[tau] >= threshold) continue;
    while (tau + 1 < tauMax && c[tau + 1] < c[tau]) tau++;
    const [a, b, e] = [c[tau - 1], c[tau], c[tau + 1]],
      shift = (a - e) / (2 * (a - 2 * b + e) || 1);
    return SR / (tau + shift);
  }
  return 0;
}
function median3(f) {
  return f.map((v, i) => {
    const w = [f[i - 1], v, f[i + 1]].filter((u) => u > 0);
    return v > 0 && w.length ? w.sort((p, q) => p - q)[w.length >> 1] : 0;
  });
}

/** the frames (of HOP) each mora of Kokoro's plan spans: [first, end) per unit that is a mora, in order */
export function moraFrames(sec, dur) {
  const ends = [];
  let t = 0;
  for (const d of dur) {
    ends.push([t, t + d * 2]);
    t += d * 2;
  }
  const out = [];
  sec.toks.forEach((tok, k) => {
    if (tok.kind !== "unit") return;
    const idx = sec.uid.flatMap((u, l) => (u === k ? [l] : []));
    out.push(idx.length ? [ends[idx[0]][0], ends[idx[idx.length - 1]][1]] : null);
  });
  return out;
}

/** three values per mora (semitones from the reading's median; null where the reading is unvoiced there) */
export function voiceValues({ kokoro, frames, reading }) {
  const path = dtw(mfcc(kokoro), mfcc(reading)),
    f0 = yin(reading),
    voiced = f0.filter((v) => v > 0).sort((p, q) => p - q);
  if (!voiced.length) throw new Error("no voice was heard in the recording");
  const ref = voiced[voiced.length >> 1],
    st = (hz) => 12 * Math.log2(hz / ref);
  return frames.map((fr) => {
    if (!fr) return null;
    const [a, b] = [Math.min(fr[0], path.length - 1), Math.min(fr[1], path.length) - 1];
    const ua = path[a][0],
      ub = path[Math.max(a, b)][1];
    const V = [];
    for (let j = ua; j <= ub; j++) if (f0[j] > 0) V.push(st(f0[j]));
    if (!V.length) return null;
    // the start, middle and end of the voiced part, each the median of the frames around it
    return [1 / 6, 1 / 2, 5 / 6].map((q) => {
      const c = Math.floor(q * V.length),
        w = V.slice(Math.max(0, c - 1), c + 2).sort((p, r) => p - r);
      return Math.round(w[w.length >> 1] * 10) / 10;
    });
  });
}

/** marks of a phrase from its values: the nucleus where the pitch falls most from one mora to the next (by at least
 * FALL semitones), on that mora or, after a special mora (ː ɴ Q, which cannot carry it), on the mora before it, as in
 * toꜜːkʲoː; and the rise after the first mora when the second is at least RISE higher (none when the nucleus is on the
 * first) */
const FALL = 1.5,
  RISE = 1;
export function marksOf(values, kinds) {
  const mean = values.map((v) => (v ? v.reduce((s, x) => s + x, 0) / v.length : null));
  let nucleus = -1,
    drop = FALL;
  for (let k = 0; k + 1 < mean.length; k++) {
    if (mean[k] === null || mean[k + 1] === null || mean[k] - mean[k + 1] < drop) continue;
    let c = k;
    while (c >= 0 && kinds[c] !== "mora") c--;
    if (c >= 0) [nucleus, drop] = [c, mean[k] - mean[k + 1]];
  }
  const rise = nucleus !== 0 && mean.length > 1 && mean[0] !== null && mean[1] !== null && mean[1] - mean[0] >= RISE ? 0 : -1;
  return { nucleus, rise };
}
