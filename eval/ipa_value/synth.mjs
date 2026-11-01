// Speech from the Kokoro Katarite, for each item and condition: the fp32 models and the voices of the demo
// (demo/ys_web/web) run with onnxruntime-node as the CLI and MCP server run them (demo/ys_web/node.mjs's
// onnxruntime-web is the same model but about 20 times slower here).
// usage: node synth.mjs accent   -> results/accent_ys.json, audio/accent/<condition>/<item>.wav and .json
//        node synth.mjs mixed    -> results/mixed_ys.json,  audio/mixed/<condition>/<item>.wav (+ .en<k>.wav: each
//                                   section in another language, as synthesized, for the ASR)
// Accent conditions (README.md): kokoro, kana_dict, dict, and each LLM's marks (run 1). The .json next to a wav has
// the YomiScript, the pitch mode and the time of each Japanese mora (Kokoro's predicted durations).
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { realize } from "@yomiscript/core";
import { ACCENT_SCALE, accentYomite } from "@yomiscript/ja-accent";
import { nodeEngine } from "@yomiscript/kokoro/node";
import { K, WEB } from "../../demo/ys_web/node.mjs";
import { unitSpans } from "../prosody_ref/morae.mjs";
import { ACCENT_ITEMS, AUDIO, HERE, LLMS, MIXED_ITEMS, analyzer, llmFile, readJson, writeJson } from "./common.mjs";

const E = await nodeEngine({ dir: WEB, model: "fp32" });
const PYTHON = process.env.PYTHON ?? path.join(HERE, "../prosody_ref/.venv/bin/python");

/** each section's audio, the whole (joined as the Engine joins them), and the time of each Japanese mora */
async function render(ys, mode) {
  const parts = [],
    morae = [];
  let offset = 0;
  for (const sec of K.plan(ys)) {
    const r = await E.synthSection(sec, mode);
    parts.push({ lang: sec.lang, audio: r.audio });
    if (sec.lang === "ja") morae.push(...moraTimes(sec, r.dur, offset));
    offset += r.audio.length / K.SR;
  }
  const audio = parts.length === 1 ? parts[0].audio : K.join(parts.map((p) => p.audio));
  return { audio, parts, morae: parts.length === 1 ? morae : null };
}
function moraTimes(sec, dur, offset) {
  const at = unitSpans(sec, dur, offset),
    out = [];
  sec.toks.forEach((tok, k) => tok.kind === "unit" && at.has(k) && out.push({ ...at.get(k), ph: tok.ipa }));
  return out;
}
async function save(dir, name, ys, mode) {
  fs.mkdirSync(dir, { recursive: true });
  const meta = path.join(dir, `${name}.json`);
  if (fs.existsSync(meta) && JSON.parse(fs.readFileSync(meta, "utf8")).ys === ys) return; // rendered already
  const { audio, parts, morae } = await render(ys, mode);
  fs.writeFileSync(path.join(dir, `${name}.wav`), Buffer.from(K.wav(audio)));
  parts.forEach((p, k) => p.lang !== "ja" && fs.writeFileSync(path.join(dir, `${name}.en${k}.wav`), Buffer.from(K.wav(p.audio))));
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ ys, mode, morae }));
}
const llmOut = (task, llm) => {
  const f = path.join(HERE, llmFile(task, llm, 1));
  return fs.existsSync(f) ? (readJson(llmFile(task, llm, 1)).output ?? {}) : {};
};
const withValues = (ys) => [ys, "values"];

async function accentConditions() {
  const base = readJson("results/base.json"),
    step = accentYomite(await analyzer()),
    dictStep = (ys) => {
      const y = step(ys);
      return [y, y === ys ? "engine" : "values"];
    };
  const C = {
    kokoro: (x) => [base[x.name].ys, "engine"],
    kana_dict: (x) => dictStep(base[x.name].ys_kana),
    dict: (x) => dictStep(base[x.name].ys),
  };
  for (const llm of LLMS) {
    const out = llmOut("accent", llm);
    C[llm] = (x) => (out[x.name] ? withValues(realize(out[x.name], { markedOnly: true, jaScale: ACCENT_SCALE })) : null);
  }
  return C;
}
function kanaYs(kana) {
  // the LLM's katakana as YomiScript, through eval/representation/kana.py (the converter of the hard set's gold)
  const r = spawnSync(PYTHON, ["kana.py"], { cwd: path.join(HERE, "../representation"), input: JSON.stringify(kana), encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}
function mixedConditions(items) {
  const C = {};
  for (const llm of LLMS) {
    const ys = llmOut("mixed_ys", llm),
      kana = llmOut("mixed_kana", llm),
      names = items.map((x) => x.name).filter((n) => kana[n]),
      ysOf = names.length ? kanaYs(names.map((n) => kana[n])) : [],
      conv = Object.fromEntries(names.map((n, i) => [n, ysOf[i]]));
    C[`ys_${llm}`] = (x) => (ys[x.name] ? [ys[x.name], "engine"] : null);
    C[`kana_${llm}`] = (x) => (conv[x.name] && !conv[x.name].startsWith("error") ? [conv[x.name], "engine"] : null);
  }
  return C;
}

async function run(kind, items, C) {
  const used = {},
    bad = [];
  for (const [cond, f] of Object.entries(C))
    for (const x of items) {
      try {
        const r = f(x); // realize() throws on a YomiScript that does not parse: counted, not rendered
        if (!r) {
          bad.push(`${cond} ${x.name}: no output`);
          continue;
        }
        await save(path.join(AUDIO, kind, cond), x.name, ...r);
        used[cond] ??= {};
        used[cond][x.name] = { ys: r[0], mode: r[1], ps: K.plan(r[0]).map((p) => [p.lang, p.ps]) };
      } catch (e) {
        bad.push(`${cond} ${x.name}: ${e.message}`);
      }
    }
  writeJson(`results/${kind}_ys.json`, { used, failed: bad });
  console.log(`${kind}: ${Object.values(used).reduce((n, o) => n + Object.keys(o).length, 0)} rendered; failed: ${bad.length}`);
  bad.forEach((b) => console.log("  " + b));
}

const kind = process.argv[2];
if (kind === "accent") await run("accent", ACCENT_ITEMS(), await accentConditions());
else if (kind === "mixed") await run("mixed", MIXED_ITEMS(), mixedConditions(MIXED_ITEMS()));
else throw new Error("usage: node synth.mjs accent | mixed");
process.exit(0); // onnxruntime-node can hang at exit
