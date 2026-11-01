// A check of the listening page in headless Chromium (Playwright): the set it is served names no condition, item or
// hidden English; a cut clip has the length of its stretch; the first clip's audio loads; every A clip can be answered
// with the keys and two B clips with the mouse; the progress survives a reload; the answers download.
// The listener is "FAKE-check", so score.mjs marks any report made from the download as fake.
// usage: node check.mjs [downloaded answers file]   (default: listening.FAKE-check.json in the system temp folder)
import fs from "fs";
import os from "os";
import path from "path";
import { chromium } from "playwright";
import { serve } from "./serve.mjs";
import { SET } from "./build.mjs";

const NAME = "FAKE-check",
  NB = 2;
const out = process.argv[2] ?? path.join(os.tmpdir(), `listening.${NAME}.json`);

function must(ok, what) {
  if (!ok) throw new Error(`check failed: ${what}`);
  console.log(`ok: ${what}`);
}

async function start(page, url) {
  await page.goto(url);
  await page.fill("#name", NAME);
  await page.click("#begin");
  await page.waitForFunction("document.getElementById('audio').readyState >= 1 && document.getElementById('audio').duration > 0", null, { timeout: 10000 });
}

async function answerA(page, n) {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(String(1 + (i % 2)));
    await page.keyboard.press("Enter");
  }
}

async function answerB(page, n) {
  for (let i = 0; i < n; i++) {
    await page.locator('#english input[value="4"]').check();
    await page.locator('#natural input[value="3"]').check();
    await page.fill("#heard", "how are you");
    await page.click("#next");
  }
}

async function served(url, set) {
  const body = await (await fetch(`${url}set.json`)).text(),
    A = set.clips.find((c) => c.part === "A"),
    wav = Buffer.from(await (await fetch(`${url}clip/${A.id}.wav`)).arrayBuffer());
  const leaks = [...set.clips.flatMap((c) => [c.cond, c.item, c.target]), "kokoro", "claude", "kana_dict"].filter((s) => s && body.includes(`"${s}"`));
  must(!leaks.length && !/How are you|"cond"|"item"|"text":"朝から/.test(body), "the served set names no condition, item or hidden English");
  const secs = (wav.length - 44) / 2 / wav.readUInt32LE(24);
  must(Math.abs(secs - (A.to - A.from)) < 0.002, `clip ${A.id} is cut to ${secs.toFixed(3)} s`);
}

const set = JSON.parse(fs.readFileSync(SET, "utf8")),
  nA = set.clips.filter((c) => c.part === "A").length,
  server = await serve(0),
  url = `http://127.0.0.1:${server.address().port}/`,
  browser = await chromium.launch({ headless: true });
try {
  await served(url, set);
  const context = await browser.newContext({ acceptDownloads: true }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page, url);
  must(true, "the first clip's audio loads");
  must(!(await page.isVisible("#sentence")) && (await page.locator("#choice input").count()) >= 3, "an A clip shows its choices and no sentence");
  await answerA(page, nA);
  must(await page.isVisible("#english"), "after the A clips come the B clips");
  must((await page.textContent("#sentence")).includes("＿＿＿"), "a B clip shows its sentence with the English hidden");
  await answerB(page, NB);
  must((await page.textContent("#count")).includes(`${nA + NB} /`), `${nA} A and ${NB} B clips answered`);
  await page.reload();
  await start(page, url);
  must((await page.textContent("#count")).includes(`${nA + NB} /`), "the progress survives a reload");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
  must(download.suggestedFilename() === `listening.${NAME}.json`, `the download is named ${download.suggestedFilename()}`);
  await download.saveAs(out);
  const answers = Object.values(JSON.parse(fs.readFileSync(out, "utf8")).answers),
    full = answers.filter((a) => a.choice || (a.english && a.naturalness)).length;
  must(full === nA + NB, `the downloaded file has ${full} answered clips -> ${out}`);
  must(!errors.length, errors.length ? `no page errors: ${errors.join("; ")}` : "no page errors");
} finally {
  await browser.close();
  server.close();
}
