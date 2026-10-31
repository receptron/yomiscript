// Our speech for the prosody score, with the time of every mora (for aligning it with the references).
// usage: node ours.mjs listen <twopass|onepass|dict>   the blind listening tests' variants (accent_marks/variants.mjs)
//        node ours.mjs tool <name> [reps] [label]      the LLM's readings (runs/claude/none.*.<rep>.json, reps 1-5)
//                                                       through a pipeline: kokoro (no accent) or accent (the
//                                                       built @yomiscript/ja-accent step, as the tools run it), into
//                                                       audio/ours/tool/<label> (default: the pipeline's name)
//        node ours.mjs file <json> <label>              a JSON { "<set>.<name>": [ys, mode] } (accent_gold.py), into
//                                                       audio/ours/file/<label>
//   -> audio/ours/<run>/<variant>/<set>.<name>[.<rep>].wav and .json ({ ys, morae: [{ start, end, ph, sent, mora }] })
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { realize } from "@yomiscript/core";
import { accentMarks, accentYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import * as K from "@yomiscript/kokoro";
import { nodeEngine } from "@yomiscript/kokoro/node";
import { sentences } from "../browser_tts/trials/accent_marks/variants.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNS = path.join(HERE, "../browser_tts/trials/accent_marks/runs/claude");
const E = await nodeEngine({ dir: path.join(process.env.HOME, ".cache/yomiscript/kokoro") }); // the tools' models, fp32

/** the audio of a YomiScript and the time of each mora; null morae when it has several language sections */
async function render(ys, mode) {
  const P = K.plan(ys);
  if (P.length !== 1) return { audio: (await E.synth(ys, mode)).audio, morae: null };
  const sec = P[0],
    r = await E.synthSection(sec, mode),
    step = K.SAMPLES_PER_STEP / K.SR;
  const morae = [];
  let t = 0,
    sent = 0;
  const at = new Map();
  sec.uid.forEach((k, i) => {
    const d = r.dur[i] * step;
    if (k >= 0) {
      const x = at.get(k);
      if (x) x.end = t + d;
      else at.set(k, { start: t, end: t + d });
    }
    t += d;
  });
  sec.toks.forEach((tok, k) => {
    if (tok.kind === "punct" && tok.sent) sent++;
    const s = at.get(k);
    if (tok.kind === "unit" && s) morae.push({ ...s, ph: tok.ph, sent, mora: (tok.on ?? "") + (tok.v ?? "") || tok.mk });
  });
  return { audio: r.audio, morae };
}
async function save(dir, file, ys, mode) {
  fs.mkdirSync(dir, { recursive: true });
  const { audio, morae } = await render(ys, mode);
  fs.writeFileSync(path.join(dir, `${file}.wav`), Buffer.from(K.wav(audio)));
  fs.writeFileSync(path.join(dir, `${file}.json`), JSON.stringify({ ys, morae }));
}

async function analyzer() {
  const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
  return nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) });
}
async function pipeline(name) {
  // kokoro; accent (the step as the tools run it); accent@<scale> (the same marks, the rules at another strength)
  if (name === "kokoro") return (ys) => [ys, "engine"];
  const [base, scale] = name.split("@");
  if (base !== "accent") throw new Error(`unknown pipeline ${name}`);
  const a = await analyzer(),
    step = scale === undefined ? accentYomite(a) : (ys) => withScale(ys, a, Number(scale));
  return (ys) => {
    const y = step(ys);
    return [y, y === ys ? "engine" : "values"];
  };
}
function withScale(ys, a, jaScale) {
  const marked = accentMarks(ys, a);
  return marked === ys ? ys : realize(marked, { markedOnly: true, jaScale });
}

const [kind, arg, reps = "1,2,3,4,5", label = arg] = process.argv.slice(2);
async function renderRun(f, set, rep) {
  // one LLM run of one set through the pipeline f; an invalid YomiScript from the LLM is counted, not rendered
  const out = JSON.parse(fs.readFileSync(path.join(RUNS, `none.${set}.${rep}.json`), "utf8")).output;
  let n = 0,
    bad = 0;
  for (const [name, ys] of Object.entries(out)) {
    try {
      await save(path.join(HERE, "audio/ours/tool", label), `${set}.${name}.${rep}`, ...f(ys));
      n++;
    } catch {
      bad++;
    }
  }
  return { n, bad };
}
if (kind === "listen") {
  for (const it of sentences(arg))
    for (const [v, [ys, mode]] of Object.entries(it.variants)) await save(path.join(HERE, "audio/ours", `listen-${arg}`, v), `${it.set}.${it.name}`, ys, mode);
} else if (kind === "tool") {
  const f = await pipeline(arg);
  let n = 0,
    bad = 0;
  for (const rep of reps.split(","))
    for (const set of ["hard", "ja"]) {
      const r = await renderRun(f, set, rep);
      n += r.n;
      bad += r.bad;
    }
  console.log(`${label}: ${n} rendered, ${bad} invalid`);
} else if (kind === "file") {
  const todo = JSON.parse(fs.readFileSync(arg, "utf8"));
  for (const [file, [ys, mode]] of Object.entries(todo)) await save(path.join(HERE, "audio/ours/file", process.argv[4]), file, ys, mode);
  console.log(`${process.argv[4]}: ${Object.keys(todo).length} rendered`);
} else throw new Error("usage: node ours.mjs listen <test> | tool <pipeline> [reps] | file <json> <label>");
