// Japanese pitch values predicted from the text (D33): a small bidirectional LSTM, trained on Qwen3-TTS's pitch
// (eval/qwen_prosody/pitch.py), reads the morae of a section with the dictionary's nuclei and predicts, for each mora,
// what to add to the three values the marks give (jaContour with the model fitted to Qwen). It runs here in plain
// TypeScript, from the model's weights; the marks stay in the YomiScript, the values are what the Katarite speaks.
import { applyEdits, f0Mark, isJa, jaContour, parse, type Edit, type JaContourModel, type LoadBytes, type Section, type Utterance } from "@yomiscript/core";
import { gunzip, type Analyzer } from "./frontend.ts";
import { accentMarks, type AccentOptions } from "./index.ts";
import { phraseEdits, phraseUnits, startPhrases } from "./nuclei.ts";

/** the model's name; its files live under it */
export const PITCH_VERSION = "qwen-2";
/** the model on Hugging Face */
export const PITCH_URL = `https://huggingface.co/receptron/yomiscript-ja-pitch/resolve/main/${PITCH_VERSION}/`;
/** the model's files: the vocabularies, the tensors' names and shapes and the marks' pitch model; the weights, little-endian float32 */
export const PITCH_FILES = ["pitch.json.gz", "pitch.bin.gz"];

interface Tensor {
  shape: number[];
  data: Float32Array;
}
export interface PitchModel {
  vocab: Record<"ipa" | "word" | "char" | "bound", Record<string, number>>;
  /** positions above this are this */
  clip: number;
  /** the values the marks give, which the prediction is added to */
  contour: JaContourModel;
  tensors: Record<string, Tensor>;
}
/** what the model knows of one mora */
export interface PitchRow {
  ipa: string;
  span?: number;
  word: string;
  bound: string;
  ppos: number;
  plen: number;
  wpos: number;
  wlen: number;
  /** the phrase's nucleus; -1: a phrase of one mora */
  d31nuc: number;
}
/** the morae of a section with their features, and its phrases, with the given nucleus of each */
export function pitchRows(
  sec: Section,
  words: string[],
  nuclei: (number | null)[],
): { morae: PitchRow[]; phrases: { start: number; len: number; d31: number | null }[] } {
  const morae: PitchRow[] = [],
    phrases: { start: number; len: number; d31: number | null }[] = [];
  const G = phraseUnits(sec),
    bounds = new Map<unknown, string>();
  let bound = "start";
  for (const t of sec.toks) {
    if (t.kind === "bound") bound = t.sym ?? "";
    if (t.kind !== "unit") continue;
    bounds.set(t, bound);
    bound = "";
  }
  G.forEach((P, g) => {
    phrases.push({ start: morae.length, len: P.length, d31: nuclei[g] });
    P.forEach((t, j) =>
      morae.push({
        ipa: t.ipa ?? "",
        span: t.span,
        word: words[t.span ?? -1] ?? "",
        bound: bounds.get(t) ?? "",
        ppos: j,
        plen: P.length,
        wpos: 0,
        wlen: 0,
        d31nuc: nuclei[g] ?? -1,
      }),
    );
  });
  const startsWord = (i: number) => i === 0 || morae[i - 1].span !== morae[i].span;
  morae.forEach((m, i) => {
    let s = i,
      e = i;
    while (!startsWord(s)) s--;
    while (e + 1 < morae.length && !startsWord(e + 1)) e++;
    m.wpos = i - s;
    m.wlen = e - s + 1;
  });
  return { morae, phrases };
}

/** a vocabulary's id, 0 for what it does not have (its own entries only: a word can be called "constructor") */
const idOf = (V: Record<string, number>, key: string): number => (Object.hasOwn(V, key) ? V[key] : 0);
/** one mora as the LSTM's input: its embeddings, one after the other */
function embed(M: PitchModel, m: PitchRow): Float64Array {
  const { vocab: V, clip, tensors: T } = M,
    chars = [...m.word],
    here = m.d31nuc > 0 && m.ppos === m.d31nuc - 1,
    flatEnd = m.d31nuc === 0 && m.ppos === m.plen - 1,
    picks: [string, number][] = [
      ["emb.0", idOf(V.ipa, m.ipa)],
      ["emb.1", idOf(V.word, m.word)],
      ["emb.2", idOf(V.bound, m.bound)],
      ["pos.0", Math.min(m.ppos, clip)],
      ["pos.1", Math.min(m.plen, clip)],
      ["pos.2", Math.min(m.wpos, clip)],
      ["pos.3", Math.min(m.wlen, clip)],
      ["d31", 1 + Number(here) + 2 * Number(flatEnd) + 3 * Number(m.d31nuc < 0)],
      ["char", chars.length ? idOf(V.char, chars[0]) : 0],
      ["char", chars.length ? idOf(V.char, chars[chars.length - 1]) : 0],
    ];
  const vectors = picks.map(([name, id]) => {
    const { shape, data } = T[`${name}.weight`];
    return data.subarray(id * shape[1], (id + 1) * shape[1]);
  });
  const x = new Float64Array(vectors.reduce((n, v) => n + v.length, 0));
  let at = 0;
  for (const v of vectors) {
    x.set(v, at);
    at += v.length;
  }
  return x;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
/** one direction of one LSTM layer over the inputs, as torch.nn.LSTM computes it (the gates in its order: i, f, g, o) */
function lstm(T: Record<string, Tensor>, suffix: string, X: Float64Array[]): Float64Array[] {
  const ih = T[`rnn.weight_ih_${suffix}`],
    hh = T[`rnn.weight_hh_${suffix}`],
    bi = T[`rnn.bias_ih_${suffix}`].data,
    bh = T[`rnn.bias_hh_${suffix}`].data,
    H = hh.shape[1],
    I = ih.shape[1],
    h = new Float64Array(H),
    c = new Float64Array(H),
    gate = new Float64Array(4 * H);
  return X.map((x) => {
    for (let r = 0; r < 4 * H; r++) {
      let s = bi[r] + bh[r];
      for (let j = 0; j < I; j++) s += ih.data[r * I + j] * x[j];
      for (let j = 0; j < H; j++) s += hh.data[r * H + j] * h[j];
      gate[r] = s;
    }
    for (let j = 0; j < H; j++) {
      c[j] = sigmoid(gate[H + j]) * c[j] + sigmoid(gate[j]) * Math.tanh(gate[2 * H + j]);
      h[j] = sigmoid(gate[3 * H + j]) * Math.tanh(c[j]);
    }
    return Float64Array.from(h);
  });
}
/** what the model adds to the marks' three values of each mora */
export function pitchResidual(M: PitchModel, morae: PitchRow[]): number[][] {
  const T = M.tensors;
  let X = morae.map((m) => embed(M, m));
  for (let L = 0; T[`rnn.weight_ih_l${L}`]; L++) {
    const fw = lstm(T, `l${L}`, X),
      bw = lstm(T, `l${L}_reverse`, [...X].reverse()).reverse();
    X = fw.map((f, i) => {
      const both = new Float64Array(f.length + bw[i].length);
      both.set(f);
      both.set(bw[i], f.length);
      return both;
    });
  }
  const { shape, data } = T["out.1.weight"],
    bias = T["out.1.bias"].data;
  return X.map((x) =>
    Array.from({ length: shape[0] }, (_, r) => {
      let s = bias[r];
      for (let j = 0; j < shape[1]; j++) s += data[r * shape[1] + j] * x[j];
      return s;
    }),
  );
}

/** the YomiScript with the marks of the given dictionary-marked one and the values the model predicts for them */
function withPitch(marked: string, M: PitchModel): string {
  // the values come from every phrase marked with its nucleus, a flat one included, as the model was trained; they are
  // written onto the dictionary's own marks, which say nothing on a phrase it left alone
  const { bare, sections } = startPhrases(marked),
    U = parse(
      applyEdits(
        bare,
        sections.flatMap((s) => phraseEdits(s.G, s.start, s.kept)),
      ),
    ),
    ja = (u: Utterance) => u.sections.filter((s) => isJa(s.lang)),
    written = ja(parse(marked)),
    E: Edit[] = [];
  ja(U).forEach((sec, s) => {
    const contour = jaContour(sec, M.contour),
      units = phraseUnits(sec).flat(),
      at = phraseUnits(written[s]).flat(),
      R = pitchResidual(M, pitchRows(sec, U.texts, sections[s].start).morae);
    units.forEach((t, i) => {
      const base = contour.get(t) ?? [0, 0, 0];
      E.push({ at: at[i].end ?? 0, ins: f0Mark(base.map((v, j) => v + R[i][j])) });
    });
  });
  return applyEdits(marked, E);
}
/** the Yomite step before Kokoro with the model: the dictionary's marks, then the predicted values for every mora; a
 * YomiScript the dictionary does not mark is left as it is */
export function pitchYomite(a: Analyzer, model: PitchModel, opts: AccentOptions = {}): (ys: string) => string {
  return (ys) => {
    const marked = accentMarks(ys, a, opts);
    return marked === ys ? ys : withPitch(marked, model);
  };
}
/** the model from its files (PITCH_FILES) */
export async function loadPitchModel(load: LoadBytes): Promise<PitchModel> {
  const [meta, bin] = await Promise.all(PITCH_FILES.map(async (f) => gunzip(await load(f))));
  const head = JSON.parse(new TextDecoder().decode(meta)) as Omit<PitchModel, "tensors"> & { tensors: [string, number[]][] },
    tensors: Record<string, Tensor> = {};
  let at = 0;
  for (const [name, shape] of head.tensors) {
    const n = shape.reduce((a, b) => a * b, 1);
    tensors[name] = { shape, data: new Float32Array(bin.buffer.slice(bin.byteOffset + at, bin.byteOffset + at + 4 * n)) };
    at += 4 * n;
  }
  if (at !== bin.length) throw new Error(`pitch model: ${bin.length} bytes of weights, ${at} expected`);
  return { ...head, tensors };
}
