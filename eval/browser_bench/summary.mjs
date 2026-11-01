// results/summary.md from the raw results of bench.mjs: medians over the runs of each condition.
// usage: node summary.mjs   (re-renders results/summary.md from results/raw.json)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const PHASES = ["cold", "warm", "restart"];
const REF = "wasm-4";
const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sec = (ms) => (Number.isFinite(ms) ? (ms / 1000).toFixed(2) : "-");
const mb = (b) => (Number.isFinite(b) ? (b / 1e6).toFixed(0) : "-");
const fix = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-");

// one page's figures: loading split into download and session creation, first audio, transferred bytes
function pageFigures(p) {
  const r = p.ready;
  const fetchMs = Object.values(r.fetch).reduce((s, f) => s + f.ms, 0);
  return {
    ready: r.ready,
    imported: r.imported,
    fetch: fetchMs,
    create: r.initDone - r.imported - fetchMs,
    warmup: r.ready - r.initDone,
    firstSynth: p.synth[0]?.ms,
    firstAudio: p.synth[0]?.end,
    transferred: (r.resources ?? []).reduce((s, x) => s + x.transferSize, 0),
    readyRss: p.memoryAtReady?.rendererRss,
    ...p.memory,
  };
}
function phaseRow(name, phase, pages) {
  const f = pages.map(pageFigures);
  const m = (k) => median(f.map((x) => x[k]));
  return (
    `| ${name} | ${phase} | ${sec(m("ready"))} | ${sec(m("fetch"))} | ${sec(m("create"))} | ${sec(m("warmup"))} | ${sec(m("firstAudio"))} | ` +
    `${mb(m("transferred"))} | ${mb(m("readyRss"))} | ${mb(m("rendererRss"))} | ${mb(m("totalRss"))} | ${mb(m("gpuRss"))} | ${mb(m("jsHeapUsed"))} |`
  );
}
// the real-time factor over every sentence spoken in every page of a condition
function rtfRow(name, runs) {
  const all = runs.flatMap((r) => PHASES.flatMap((ph) => r[ph]?.synth ?? []));
  const group = (f) => all.filter((s) => f(s.name));
  const short = group((n) => n.startsWith("h")),
    para = group((n) => n.startsWith("p"));
  const rtf = (xs) => median(xs.map((s) => s.ms / s.audioMs));
  const pooled = (xs) => xs.reduce((a, s) => a + s.ms, 0) / xs.reduce((a, s) => a + s.audioMs, 0);
  return (
    `| ${name} | ${fix(rtf(short))} | ${sec(median(short.map((s) => s.ms)))} | ${sec(median(short.map((s) => s.audioMs)))} | ` +
    `${fix(rtf(para))} | ${sec(median(para.map((s) => s.ms)))} | ${sec(median(para.map((s) => s.audioMs)))} | ${fix(pooled(all))} | ${all.length} |`
  );
}
// the output against a reference condition (the first page of each): same length, and the loudness envelopes' correlation
const corr = (a, b) => {
  const n = a.length,
    ma = a.reduce((s, x) => s + x, 0) / n,
    mb_ = b.reduce((s, x) => s + x, 0) / n;
  let ab = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < n; i++) {
    ab += (a[i] - ma) * (b[i] - mb_);
    aa += (a[i] - ma) ** 2;
    bb += (b[i] - mb_) ** 2;
  }
  return ab / Math.sqrt(aa * bb);
};
function checkRows(ok, refName) {
  const ref = ok.find(([n]) => n === refName)?.[1].runs[0].cold.synth;
  if (!ref) return [];
  return ok.map(([name, c]) => {
    const syn = c.runs[0].cold.synth;
    const same = syn.filter((s, i) => s.envelope.length === ref[i].envelope.length);
    const r = median(same.map((s) => corr(s.envelope, ref[syn.indexOf(s)].envelope)));
    const ratio = median(syn.map((s, i) => s.audioMs / ref[i].audioMs));
    return `| ${name} | ${same.length} / ${syn.length} | ${fix(ratio)} | ${fix(r, 3)} |`;
  });
}
function unavailable(out) {
  return Object.entries(out.conditions)
    .filter(([, c]) => c.runs[0]?.cold.ready.error)
    .map(([name, c]) => `- ${name}: not measured, ${c.runs[0].cold.ready.error} (${JSON.stringify(c.runs[0].cold.ready.gpu ?? {})})`);
}

export function summarize(out) {
  const ok = Object.entries(out.conditions).filter(([, c]) => c.runs.length && !c.runs[0].cold.ready.error);
  const h = out.hardware;
  const lines = [
    `# Browser deployment of the Kokoro Katarite (w16), ${out.date.slice(0, 10)}`,
    "",
    `${h.model} (${h.modelId}), ${h.chip}, ${h.cores} cores, ${h.memory}, ${h.os}; headless ${out.browser}; ` +
      `Playwright Chromium, Node ${h.node}. Medians over ${out.runs} runs. Times in seconds from the start of the navigation; memory in MB.`,
    "",
    "## Loading, first audio and memory",
    "",
    "| condition | cache | ready | download | sessions | warm-up | first audio | transferred | renderer RSS at ready | peak renderer RSS | peak total RSS | peak GPU RSS | peak JS heap |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...ok.flatMap(([name, c]) => PHASES.map((ph) => phaseRow(name, ph, c.runs.map((r) => r[ph]).filter(Boolean)))),
    "",
    "## Real-time factor (synthesis time / audio length; below 1 is faster than real time)",
    "",
    "| condition | RTF sentences | synth s | audio s | RTF paragraphs | synth s | audio s | RTF pooled | n |",
    "|---|---|---|---|---|---|---|---|---|",
    ...ok.map(([name, c]) => rtfRow(name, c.runs)),
    "",
    `## Output check against ${REF} (first run, cold page)`,
    "",
    "| condition | sentences of the same length | audio length / reference (median) | envelope correlation (same length, median) |",
    "|---|---|---|---|",
    ...checkRows(ok, REF),
    "",
    ...unavailable(out),
    "",
  ];
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const out = JSON.parse(fs.readFileSync(path.join(HERE, "results/raw.json"), "utf8"));
  fs.writeFileSync(path.join(HERE, "results/summary.md"), summarize(out));
  console.log(summarize(out));
}
