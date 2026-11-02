// The accent editor's voice input (accent_edit.html): the listener reads the sentence, and the pitch of their reading
// becomes the values of each mora. Their recording is aligned with Kokoro's audio of the same YomiScript by DTW on
// MFCCs (as eval/prosody_ref aligns a reference with ours); Kokoro's durations say where each mora is in its audio, the
// path says where that is in the recording, and the recording's pitch there (Praat's autocorrelation method) gives the mora three values (the
// medians of the thirds of its voiced part), in semitones from the median of the reading. Kokoro reads in the voice
// nearer the reader's pitch, which aligns better; a mora the reading has too little voice in takes its values from its
// neighbours. Measured on readings whose mora positions are known, against Praat at those positions. All in the
// browser; the recording is not kept.

export const SR = 24000;
const HOP = 300, // one F0 frame of Kokoro (2 per duration step of 600 samples)
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

const median = (a) => [...a].sort((p, q) => p - q)[a.length >> 1];
const semi = (hz) => 12 * Math.log2(hz);

/** the autocorrelation of seg, zero-padded to n (a power of two) */
function autocorr(seg, n) {
  const re = new Float64Array(n),
    im = new Float64Array(n);
  re.set(seg);
  fft(re, im);
  for (let i = 0; i < n; i++) [re[i], im[i]] = [re[i] * re[i] + im[i] * im[i], 0];
  fft(re, im); // the power spectrum is real and even: the forward transform gives the inverse, scaled
  return re;
}
// Praat's autocorrelation method (Boersma 1993) with its default costs
const PITCH = { candidates: 15, silence: 0.03, voicing: 0.45, octave: 0.01, jump: 0.35, voicedUnvoiced: 0.14 };
const WINDOW = Math.round((3 * SR) / FMIN), // three periods of the lowest pitch
  NAC = 1 << Math.ceil(Math.log2(WINDOW * 1.5)),
  HANN = Float64Array.from({ length: WINDOW }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / WINDOW)),
  RW = autocorr(HANN, NAC);
/** the frame's pitch candidates: unvoiced (f 0) and the autocorrelation peaks, each with its strength */
function candidates(x, t, peakAll) {
  const c = t * HOP + HOP / 2 - (WINDOW >> 1),
    seg = new Float64Array(WINDOW);
  let mean = 0,
    local = 0;
  for (let i = 0; i < WINDOW; i++) mean += (x[c + i] ?? 0) / WINDOW;
  for (let i = 0; i < WINDOW; i++) {
    const v = (x[c + i] ?? 0) - mean;
    local = Math.max(local, Math.abs(v));
    seg[i] = v * HANN[i];
  }
  const { voicing, silence, octave, candidates: max } = PITCH,
    out = [{ f: 0, s: voicing + Math.max(0, 2 - local / peakAll / (silence / (1 + voicing))) }],
    r = autocorr(seg, NAC);
  if (r[0] <= 0) return out;
  // the signal's normalised autocorrelation, divided by the window's
  const R = (k) => r[k] / r[0] / (RW[k] / RW[0]);
  for (let k = Math.max(2, Math.floor(SR / FMAX)); k <= Math.ceil(SR / FMIN); k++) {
    const [a, b, e] = [R(k - 1), R(k), R(k + 1)];
    if (!(b > a && b >= e) || b < 0.5 * voicing) continue;
    const d = Math.max(-1, Math.min(1, (0.5 * (a - e)) / (a - 2 * b + e || 1))),
      f = SR / (k + d);
    out.push({ f, s: Math.min(1, b - 0.25 * (a - e) * d) - octave * Math.log2(FMIN / f) });
  }
  return [out[0], ...out.slice(1).sort((p, q) => q.s - p.s)].slice(0, max);
}
/** the path through the candidates with the most strength less the costs of octave jumps and voicing changes */
function viterbi(F) {
  const scale = 0.01 / (HOP / SR),
    cost = (a, b) => {
      if (!a.f && !b.f) return 0;
      if (!a.f || !b.f) return PITCH.voicedUnvoiced * scale;
      return PITCH.jump * scale * Math.abs(Math.log2(a.f / b.f));
    };
  let D = F[0].map((c) => c.s);
  const back = [];
  for (let t = 1; t < F.length; t++) {
    const prev = D,
      from = F[t].map((c) => {
        const v = F[t - 1].map((p, i) => prev[i] - cost(p, c)),
          i = v.indexOf(Math.max(...v));
        return [i, v[i] + c.s];
      });
    back.push(from.map(([i]) => i));
    D = from.map(([, v]) => v);
  }
  const out = new Array(F.length);
  for (let t = F.length - 1, i = D.indexOf(Math.max(...D)); t >= 0; t--) {
    out[t] = F[t][i].f;
    if (t > 0) i = back[t - 1][i];
  }
  return out;
}
/** the F0 (Hz, 0 unvoiced) of each HOP frame, as Praat's autocorrelation method finds it (within 0.1 semitone of
 * Praat's on most frames of a test set of read sentences) */
export function pitch(x) {
  let peakAll = 1e-9;
  for (const v of x) peakAll = Math.max(peakAll, Math.abs(v));
  const F = [];
  for (let t = 0; t * HOP < x.length; t++) F.push(candidates(x, t, peakAll));
  return F.length ? viterbi(F) : [];
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

/** the Kokoro voice to align a reading with: the one nearer its pitch (a low voice with jm_kumo, else jf_alpha) */
export function referenceVoice(reading) {
  const f = pitch(reading).filter((v) => v > 0);
  return f.length && median(f) < 165 ? "jm_kumo" : "jf_alpha";
}

/** fewer voiced frames than this in a mora, and its values come from its neighbours */
const MIN_FRAMES = 3;
/** a mora's three values: the median of each third of its voiced frames (semitones from ref), or null */
function thirds(f0, ua, ub, ref) {
  const S = [];
  for (let j = ua; j <= ub; j++) if (f0[j] > 0) S.push(semi(f0[j]) - semi(ref));
  if (S.length < MIN_FRAMES) return null;
  return [0, 1, 2].map((t) => Math.round(median(S.slice(Math.floor((t * S.length) / 3), Math.floor(((t + 1) * S.length) / 3))) * 10) / 10);
}
/** the morae not heard, filled in on straight lines between the heard ones (the end ones held) */
function fill(V) {
  const heard = V.flatMap((v, k) => (v ? [k] : []));
  return V.map((v, k) => {
    if (v) return v;
    const a = heard.findLast((h) => h < k),
      b = heard.find((h) => h > k);
    if (a === undefined || b === undefined) return [...V[a ?? b]];
    const w = (k - a) / (b - a);
    return V[a].map((x, i) => Math.round((x + (V[b][i] - x) * w) * 10) / 10);
  });
}
/** three values per mora (semitones from the reading's median) and which morae the reading was heard in; the others
 * are filled in from their neighbours, so every value is the reading's. f0: the reading's pitch from elsewhere (a
 * check against another tracker) */
export function voiceValues({ kokoro, frames, reading, f0: track = null }) {
  const path = dtw(mfcc(kokoro), mfcc(reading)),
    f0 = track ?? pitch(reading),
    voiced = f0.filter((v) => v > 0);
  if (!voiced.length) throw new Error("no voice was heard in the recording");
  const ref = median(voiced);
  const V = frames.map((fr) => {
    if (!fr) return null;
    const a = Math.min(fr[0], path.length - 1),
      b = Math.max(a, Math.min(fr[1], path.length) - 1);
    return thirds(f0, path[a][0], path[b][1], ref);
  });
  const heard = V.map((v) => !!v);
  if (!heard.some(Boolean)) throw new Error("no mora was heard in the recording");
  return { values: fill(V), heard };
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
