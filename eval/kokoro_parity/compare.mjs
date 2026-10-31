// Compare Yomite (yomite/en_kokoro/g2p.py or yomite/ja_kokoro/g2p.py) + YomiScript + Katarite (demo/ys_web/web/ys.js, ONNX, no pitch values)
// against the original Kokoro (ref_kokoro.py output): phoneme string, ids, voice-pack index, durations, F0, audio.
// usage: node compare.mjs <ref_dir> [--m fp32|w16]     env YOMITE_PY: python with kokoro + misaki
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { engine, K } from "../../demo/ys_web/node.mjs";
import { runG2p } from "../../yomite/kokoro_yomite.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REF = process.argv[2],
  M = process.argv.indexOf("--m") > 0 ? process.argv[process.argv.indexOf("--m") + 1] : "fp32";
const R = JSON.parse(fs.readFileSync(path.join(REF, "ref.json")));
// 1. Yomite: text -> YomiScript (one utterance per original chunk); the language follows the voice
const texts = [...new Set(R.items.map((x) => x.text))];
const Y = runG2p(path.join(ROOT, R.items[0].voice[0] === "j" ? "yomite/ja_kokoro/g2p.py" : "yomite/en_kokoro/g2p.py"), texts);
// 2. Katarite
const E = await engine(M);

function wavRead(f) {
  const b = fs.readFileSync(f);
  let o = 12;
  while (b.toString("ascii", o, o + 4) !== "data") o += 8 + b.readUInt32LE(o + 4);
  const bytes = b.readUInt32LE(o + 4);
  if (b.readUInt16LE(20) === 3) return Float32Array.from({ length: bytes / 4 }, (_, i) => b.readFloatLE(o + 8 + i * 4));
  return Float32Array.from({ length: bytes / 2 }, (_, i) => b.readInt16LE(o + 8 + i * 2) / 32768);
}
const st = (x) => 12 * Math.log2(Math.max(x, 1));

function inputCheck(r, P, c) {
  // what the model is given: phoneme string, ids, voice-pack entry
  const s = P[0];
  r.sections = P.length;
  r.ps = P.map((s) => s.ps).join("") === c.ps;
  if (!r.ps) {
    r.ps_got = P.map((s) => s.ps).join(" | ");
    r.ps_want = c.ps;
  }
  r.ids = JSON.stringify(s.ids) === JSON.stringify(c.ids) && P.length === 1;
  r.ref = s.ps.length - 1 === c.ref_index;
}
function f0Rmse(a, b) {
  // semitones, over frames voiced in both
  let se = 0,
    m = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] <= 60 || b[i] <= 60) continue;
    se += (st(a[i]) - st(b[i])) ** 2;
    m++;
  }
  return m ? Math.sqrt(se / m) : null;
}
function audioCheck(r, audio, ref) {
  const L = Math.min(ref.length, audio.length);
  let num = 0,
    den = 0,
    dot = 0,
    ea = 0;
  for (let i = 0; i < L; i++) {
    num += ref[i] ** 2;
    den += (audio[i] - ref[i]) ** 2;
    dot += audio[i] * ref[i];
    ea += audio[i] ** 2;
  }
  r.audio_len = [audio.length, ref.length];
  r.snr_db = 10 * Math.log10(num / Math.max(den, 1e-12));
  r.corr = dot / Math.sqrt(ea * num);
}
async function modelCheck(r, s, c) {
  // what the model does with it: durations, F0, audio (with the reference's voice; one section: audio as is)
  const { audio } = await E.synthSection(s, "engine");
  const pr = await E.predict(s);
  r.dur_same = pr.dur.filter((d, i) => d === c.dur[i]).length / c.dur.length;
  r.f0_rmse_st = f0Rmse(pr.f0, c.f0);
  r.f0_len = [pr.f0.length, c.f0.length];
  audioCheck(r, audio, wavRead(path.join(REF, c.wav)));
  fs.writeFileSync(path.join(REF, `ours.${M}.${c.wav}`), Buffer.from(K.wav(audio)));
}
async function check(it, c, y) {
  const r = { name: it.name, voice: it.voice, chunk: c.text.slice(0, 40) };
  if (!y) return { ...r, err: "no Yomite chunk" };
  r.ys = y.ys;
  const P = K.plan(y.ys, { original: true });
  for (const s of P) s.voice = it.voice;
  inputCheck(r, P, c);
  if (P.length === 1 && r.ids) await modelCheck(r, P[0], c);
  return r;
}

const rows = [];
for (const it of R.items) {
  const mine = Y.filter((y) => y.index === texts.indexOf(it.text));
  for (const [k, c] of it.chunks.entries()) rows.push(await check(it, c, mine[k]));
}
fs.writeFileSync(path.join(REF, `compare.${M}.json`), JSON.stringify(rows, null, 1));
for (const r of rows)
  console.log(
    [
      r.name.padEnd(13),
      r.voice,
      r.ps ? "ps=" : "ps≠",
      r.ids ? "ids=" : "ids≠",
      r.ref ? "ref=" : "ref≠",
      r.dur_same === undefined ? "" : `dur ${(r.dur_same * 100).toFixed(0)}%`,
      r.f0_rmse_st == null ? "" : `F0 ${r.f0_rmse_st.toFixed(3)}st`,
      r.snr_db === undefined ? "" : `SNR ${r.snr_db.toFixed(1)}dB corr ${r.corr.toFixed(4)} len ${r.audio_len.join("/")}`,
    ].join(" "),
  );
const count = (f) => rows.filter(f).length;
console.log(
  `\n${rows.length} chunks: ps identical ${count((r) => r.ps)}, ids identical ${count((r) => r.ids)}, ` +
    `voice index identical ${count((r) => r.ref)}, durations identical ${count((r) => r.dur_same === 1)}`,
);
for (const r of rows.filter((r) => !r.ps)) console.log(`\n${r.name}\n  want ${r.ps_want}\n  got  ${r.ps_got}\n  ys   ${r.ys}`);
