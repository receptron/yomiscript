// Float32 artifact loader and plain JavaScript inference, independent of a runtime dictionary.
import fs from "node:fs";

export function loadModel(dir) {
  const meta = JSON.parse(fs.readFileSync(`${dir}/qwen3.json`, "utf8")),
    buffer = fs.readFileSync(`${dir}/qwen3.bin`),
    tensors = {};
  let offset = 0;
  for (const [name, shape] of meta.tensors) {
    const n = shape.reduce((a, b) => a * b, 1),
      data = new Float32Array(n);
    for (let i = 0; i < n; i++) data[i] = buffer.readFloatLE(offset + 4 * i);
    tensors[name] = { shape, data };
    offset += n * 4;
  }
  if (offset !== buffer.length) throw new Error("Incorrect model weight length");
  const keys = new Map(),
    surfaces = new Map();
  meta.vocab.keys.forEach(([s, k], i) => {
    keys.set(JSON.stringify([s, k]), i + 1);
    if (!surfaces.has(s)) surfaces.set(s, []);
    surfaces.get(s).push(k);
  });
  for (const readings of surfaces.values()) readings.sort((a, b) => b.length - a.length);
  return { ...meta, tensors, keys, surfaces };
}

function lookup(model, surface, kana) {
  const exact = model.keys.get(JSON.stringify([surface, kana]));
  if (exact) return exact;
  const chars = [...surface];
  for (let n = chars.length - 1; n > 0; n--) {
    const prefix = chars.slice(0, n).join("");
    for (const reading of model.surfaces.get(prefix) ?? []) {
      if (kana.startsWith(reading)) return model.keys.get(JSON.stringify([prefix, reading]));
    }
  }
  return 0;
}

const ownId = (vocab, value) => (Object.hasOwn(vocab, value) ? vocab[value] : Object.keys(vocab).length + 1);
const norm = (s) => s.normalize("NFKC").replaceAll(/[\p{P}\p{S}\p{Z}]/gu, "");

export function features(model, row) {
  const words = [];
  row.morae.forEach((m, i) => {
    if (i === 0 || row.morae[i - 1].span !== m.span) words.push({ at: i, surface: norm(m.word), kana: "" });
    words.at(-1).kana += model.ipa_kana[m.ipa] ?? "?";
  });
  const { vocab: v } = model,
    out = [];
  words.forEach((w, j) => {
    const z = words[j + 1]?.at ?? row.morae.length,
      chars = [...w.surface],
      key = lookup(model, w.surface, w.kana),
      first = ownId(v.chars, chars[0] ?? ""),
      last = ownId(v.chars, chars.at(-1) ?? "");
    for (let at = w.at; at < z; at++) {
      const m = row.morae[at];
      out.push([key, first, last, ownId(v.ipa, m.ipa), ownId(v.bounds, m.bound), Math.min(at - w.at, 64), Math.min(z - w.at, 64), Math.min(m.ppos, 64)]);
    }
  });
  return out;
}

function embedding(T, name, index) {
  const { shape, data } = T[`${name}.weight`];
  return data.subarray(index * shape[1], (index + 1) * shape[1]);
}

function linear(T, name, x, tanh = false) {
  const { shape, data } = T[`${name}.weight`],
    bias = T[`${name}.bias`].data;
  return Float64Array.from({ length: shape[0] }, (_, r) => {
    let value = bias[r];
    for (let c = 0; c < shape[1]; c++) value += data[r * shape[1] + c] * x[c];
    return tanh ? Math.tanh(value) : value;
  });
}

function wordState(T, x) {
  const a = embedding(T, "char", x[1]),
    b = embedding(T, "char", x[2]),
    chars = Float64Array.from(a, (v, i) => (v + b[i]) / 2),
    input = [...embedding(T, "memory", x[0]), ...chars, ...embedding(T, "mora", x[3]), ...embedding(T, "pos", x[5]), ...embedding(T, "pos", x[6])];
  return linear(T, "word.2", linear(T, "word.0", input, true), true);
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
function lstm(T, suffix, inputs) {
  const ih = T[`rnn.weight_ih_${suffix}`],
    hh = T[`rnn.weight_hh_${suffix}`],
    bi = T[`rnn.bias_ih_${suffix}`].data,
    bh = T[`rnn.bias_hh_${suffix}`].data,
    H = hh.shape[1],
    I = ih.shape[1],
    h = new Float64Array(H),
    c = new Float64Array(H),
    gate = new Float64Array(4 * H);
  return inputs.map((x) => {
    for (let r = 0; r < 4 * H; r++) {
      let v = bi[r] + bh[r];
      for (let j = 0; j < I; j++) v += ih.data[r * I + j] * x[j];
      for (let j = 0; j < H; j++) v += hh.data[r * H + j] * h[j];
      gate[r] = v;
    }
    for (let j = 0; j < H; j++) {
      c[j] = sigmoid(gate[H + j]) * c[j] + sigmoid(gate[j]) * Math.tanh(gate[2 * H + j]);
      h[j] = sigmoid(gate[3 * H + j]) * Math.tanh(c[j]);
    }
    return Float64Array.from(h);
  });
}

export function predictValues(model, row) {
  const T = model.tensors,
    rows = features(model, row),
    words = rows.map((x) => wordState(T, x));
  let states = rows.map((x, i) =>
    Float64Array.from([...words[i], ...embedding(T, "mora", x[3]), ...embedding(T, "bound", x[4]), ...embedding(T, "pos", x[7])]),
  );
  for (let layer = 0; layer < 2; layer++) {
    const fw = lstm(T, `l${layer}`, states),
      bw = lstm(T, `l${layer}_reverse`, [...states].reverse()).reverse();
    states = fw.map((f, i) => Float64Array.from([...f, ...bw[i]]));
  }
  return states.map((s, i) => {
    const values = [...linear(T, "values", s)],
      prior = model.word_prior ? linear(T, "word_values", words[i]) : [0, 0, 0];
    return values.map((v, j) => v + prior[j]);
  });
}
