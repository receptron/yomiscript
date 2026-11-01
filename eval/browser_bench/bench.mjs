// The browser deployment of the Kokoro Katarite, measured (issue #23): model loading with an empty cache (cold), with
// the cache filled in the same browser session (warm) and after a browser restart with the same profile (restart),
// the time to the first audio, the real-time factor and the peak memory, for the fp16-weight models (w16) on WASM
// with 1 and 4 threads and on WebGPU where headless Chromium has it. Timing is performance.now() inside bench.html;
// memory is the RSS of the browser's processes (ps, every 100 ms) and the page's JS heap (CDP Performance.getMetrics).
// usage: node bench.mjs [runs=3] [port=8811] [conditions=wasm-1,wasm-4,wasm-4-cs,webgpu,webgpu-dec]   (after `node prep.mjs`; writes results/raw.json and results/summary.md)
import fs from "fs";
import os from "os";
import path from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { summarize } from "./summary.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "../..");
const RUNS = +(process.argv[2] ?? 3),
  PORT = +(process.argv[3] ?? 8811);
const HOST = `http://127.0.0.1:${PORT}`;
const ITEMS = JSON.parse(fs.readFileSync(path.join(HERE, "sentences.json"), "utf8")).items;
const GPU_ARGS = ["--enable-unsafe-webgpu", "--enable-features=Vulkan"];
// webgpu: all three parts on WebGPU; webgpu-dec: the decoder on WebGPU, the encoder and F0 predictor on WASM (4 threads);
// wasm-4-cs: as wasm-4, with the files kept in the Cache Storage API (the HTTP cache does not keep the 107 MB decoder)
const ALL = [
  { name: "wasm-1", query: "ep=wasm&t=1", args: [] },
  { name: "wasm-4", query: "ep=wasm&t=4", args: [] },
  { name: "wasm-4-cs", query: "ep=wasm&t=4&cache=storage", args: [] },
  { name: "webgpu", query: "ep=webgpu&t=4", args: GPU_ARGS },
  { name: "webgpu-dec", query: "ep=webgpu&t=4&gpu=dec", args: GPU_ARGS },
  { name: "webgpu-enc", query: "ep=webgpu&t=4&gpu=enc", args: GPU_ARGS },
  { name: "webgpu-f0n", query: "ep=webgpu&t=4&gpu=f0n", args: GPU_ARGS },
];
const PICK = (process.argv[4] ?? "wasm-1,wasm-4,wasm-4-cs,webgpu,webgpu-dec").split(",");
const CONDITIONS = ALL.filter((c) => PICK.includes(c.name));
const run = promisify(execFile);
// the Python that runs serve.py (macOS's own by default; any Python 3.7+ will do)
const PYTHON = process.env.PYTHON ?? "/usr/bin/python3";

// the folder served: this page and its data, and links to the repository's packages, models, voices and onnxruntime-web
function makeSite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "browser_bench-site-"));
  const links = {
    "index.html": path.join(HERE, "bench.html"),
    "sentences.json": path.join(HERE, "sentences.json"),
    pkg: path.join(ROOT, "packages"),
    ort: path.join(ROOT, "node_modules/onnxruntime-web/dist"),
    models: path.join(ROOT, "demo/ys_web/models"),
    voices: path.join(ROOT, "demo/ys_web/voices"),
  };
  for (const [name, target] of Object.entries(links)) fs.symlinkSync(target, path.join(dir, name));
  return dir;
}
// demo/ys_web/serve.py (COOP/COEP for WASM threads), bound to 127.0.0.1
async function startServer(dir) {
  const server = spawn(PYTHON, [path.join(ROOT, "demo/ys_web/serve.py"), String(PORT), dir], { stdio: "inherit" });
  for (let i = 0; i < 100; i++) {
    const ok = await fetch(`${HOST}/sentences.json`).then(
      (r) => r.ok,
      () => false,
    );
    if (ok) return server;
    await new Promise((r) => setTimeout(r, 100));
  }
  server.kill();
  throw new Error(`the server did not start on ${HOST}`);
}

// the processes of one browser: the one started with this profile, and its descendants, with their RSS in bytes
async function browserProcesses(profile) {
  const { stdout } = await run("/bin/ps", ["-A", "-o", "pid=,ppid=,rss=,command="], { maxBuffer: 1 << 24 });
  const procs = stdout
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [pid, ppid, rss, ...rest] = l.trim().split(/\s+/);
      const command = rest.join(" ");
      return { pid: +pid, ppid: +ppid, rss: +rss * 1024, type: command.match(/--type=([\w-]+)/)?.[1] ?? "browser", command };
    });
  const root = procs.find((p) => p.type === "browser" && p.command.includes(`--user-data-dir=${profile}`));
  if (!root) return [];
  const mine = new Set([root.pid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of procs)
      if (!mine.has(p.pid) && mine.has(p.ppid)) {
        mine.add(p.pid);
        grew = true;
      }
  }
  return procs.filter((p) => mine.has(p.pid));
}
// the peak RSS (largest renderer, GPU process, all processes) and the peak JS heap, sampled every 100 ms
function memorySampler(profile, cdp) {
  const peak = { rendererRss: 0, gpuRss: 0, totalRss: 0, jsHeapUsed: 0 };
  let busy = false;
  const sample = async () => {
    if (busy) return;
    busy = true;
    try {
      const procs = await browserProcesses(profile);
      const sum = (f) => procs.filter(f).reduce((s, p) => s + p.rss, 0);
      peak.rendererRss = Math.max(peak.rendererRss, ...procs.filter((p) => p.type === "renderer").map((p) => p.rss));
      peak.gpuRss = Math.max(
        peak.gpuRss,
        sum((p) => p.type === "gpu-process"),
      );
      peak.totalRss = Math.max(
        peak.totalRss,
        sum(() => true),
      );
      const { metrics } = await cdp.send("Performance.getMetrics");
      peak.jsHeapUsed = Math.max(peak.jsHeapUsed, metrics.find((m) => m.name === "JSHeapUsedSize").value);
    } catch {
      // a sample taken while the page closes; the next one counts
    }
    busy = false;
  };
  const timer = setInterval(sample, 100);
  return {
    snapshot: () => ({ ...peak }),
    stop: async () => {
      clearInterval(timer);
      while (busy) await new Promise((r) => setTimeout(r, 20));
      await sample();
      return peak;
    },
  };
}

// one page: load the engine, then speak every sentence once; the first sentence's end is the time to first audio
async function measurePage(context, profile, cond) {
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const mem = memorySampler(profile, cdp);
  await page.goto(`${HOST}/?${cond.query}`);
  await page.waitForFunction("window.__ready", null, { timeout: 600000 });
  const ready = await page.evaluate("window.__ready");
  const memoryAtReady = mem.snapshot();
  let synth = [];
  if (!ready.error) synth = await page.evaluate(`window.__synth(${JSON.stringify(ITEMS.map((x) => x.spoken))})`);
  const memory = await mem.stop();
  await page.close();
  return { ready, synth: synth.map((s, i) => ({ name: ITEMS[i].name, ...s })), memory, memoryAtReady };
}
async function launch(profile, cond) {
  return chromium.launchPersistentContext(profile, { headless: true, args: cond.args });
}
// one run of a condition: a fresh profile (cold), a second tab (warm), the browser restarted on the profile (restart)
async function measureRun(cond) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "browser_bench-profile-"));
  try {
    let context = await launch(profile, cond);
    const blank = context.pages()[0] ?? (await context.newPage());
    const { product: version } = await (await context.newCDPSession(blank)).send("Browser.getVersion");
    await blank.close();
    const cold = await measurePage(context, profile, cond);
    const warm = cold.ready.error ? null : await measurePage(context, profile, cond);
    await context.close();
    let restart = null;
    if (!cold.ready.error) {
      context = await launch(profile, cond);
      restart = await measurePage(context, profile, cond);
      await context.close();
    }
    return { version, cold, warm, restart };
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

async function hardware() {
  const sh = async (cmd, args) => (await run(cmd, args)).stdout.trim();
  const sp = (await sh("/usr/sbin/system_profiler", ["SPHardwareDataType"])).split("\n").map((l) => l.trim());
  const field = (k) => sp.find((l) => l.startsWith(`${k}: `))?.slice(k.length + 2);
  return {
    model: field("Model Name"),
    modelId: field("Model Identifier"),
    chip: field("Chip"),
    cores: field("Total Number of Cores"),
    memory: field("Memory"),
    os: `${await sh("/usr/bin/sw_vers", ["-productName"])} ${await sh("/usr/bin/sw_vers", ["-productVersion"])} (${await sh("/usr/bin/sw_vers", ["-buildVersion"])})`,
    node: process.version,
  };
}

async function main() {
  const site = makeSite();
  const server = await startServer(site);
  const out = {
    date: new Date().toISOString(),
    runs: RUNS,
    hardware: await hardware(),
    items: ITEMS.map(({ name, text, phonemes }) => ({ name, text, phonemes })),
    conditions: {},
  };
  try {
    for (const cond of CONDITIONS) {
      out.conditions[cond.name] = { query: cond.query, args: cond.args, runs: [] };
      for (let r = 0; r < RUNS; r++) {
        const res = await measureRun(cond);
        out.conditions[cond.name].runs.push(res);
        out.browser = res.version;
        console.log(
          cond.name,
          r + 1,
          res.cold.ready.error ?? `cold ready ${(res.cold.ready.ready / 1000).toFixed(2)} s, warm ${(res.warm.ready.ready / 1000).toFixed(2)} s`,
        );
        if (res.cold.ready.error) break;
      }
    }
  } finally {
    server.kill();
    fs.rmSync(site, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(HERE, "results"), { recursive: true });
  fs.writeFileSync(path.join(HERE, "results/raw.json"), JSON.stringify(out, null, 1) + "\n");
  fs.writeFileSync(path.join(HERE, "results/summary.md"), summarize(out));
  console.log(summarize(out));
}
await main();
