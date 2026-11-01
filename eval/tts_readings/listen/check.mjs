// A check of the listening page in headless Chromium (Playwright): the set it is served carries no system names, the
// first clip's audio loads, a few clips can be answered, the progress survives a reload, and the answers download.
// The listener is "FAKE-check", so score.mjs marks any report made from the download as fake.
// usage: node check.mjs [downloaded answers file]   (default: listening.FAKE-check.json in the system temp folder)
import fs from "fs";
import os from "os";
import path from "path";
import { chromium } from "playwright";
import { serve } from "./serve.mjs";

const PORT = 8794,
  URL = `http://127.0.0.1:${PORT}/`,
  NAME = "FAKE-check",
  N = 3;
const out = process.argv[2] ?? path.join(os.tmpdir(), `listening.${NAME}.json`);

function must(ok, what) {
  if (!ok) throw new Error(`check failed: ${what}`);
  console.log(`ok: ${what}`);
}

async function answerClip(page) {
  for (const box of await page.locator("#words fieldset").all()) await box.locator("input[type=radio]").first().check();
  await page.locator('#natural input[value="3"]').check();
  await page.click("#next");
}

async function start(page) {
  await page.goto(URL);
  await page.fill("#name", NAME);
  await page.click("#begin");
  await page.waitForFunction("document.getElementById('audio').readyState >= 1 && document.getElementById('audio').duration > 0", null, { timeout: 10000 });
}

const server = await serve(PORT),
  browser = await chromium.launch({ headless: true });
try {
  const set = await (await fetch(`${URL}set.json`)).text();
  must(!/kokoro|openai|gemini|elevenlabs|"system"|"stratum"|"judged"/.test(set), "the served set names no system, stratum or verdict");
  const context = await browser.newContext({ acceptDownloads: true }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  must(true, "the first clip's audio loads");
  for (let i = 0; i < N; i++) await answerClip(page);
  must((await page.textContent("#count")).includes(`${N} /`), `${N} clips answered`);
  await page.reload();
  await start(page);
  must((await page.textContent("#count")).includes(`${N} /`), "the progress survives a reload");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
  must(download.suggestedFilename() === `listening.${NAME}.json`, `the download is named ${download.suggestedFilename()}`);
  await download.saveAs(out);
  const answers = JSON.parse(fs.readFileSync(out, "utf8"));
  const full = Object.values(answers.answers).filter((a) => a.words.every(Boolean)).length;
  must(answers.listener === NAME && full === N, `the downloaded file has ${full} answered clips -> ${out}`);
  must(!errors.length, errors.length ? `no page errors: ${errors.join("; ")}` : "no page errors");
} finally {
  await browser.close();
  server.close();
}
