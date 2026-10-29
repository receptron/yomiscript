import { chromium } from "playwright";
const [port, query, gpu] = process.argv.slice(2);
const b = await chromium.launch({
  args: gpu ? ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader", "--use-webgpu-adapter=swiftshader"] : [],
});
const pg = await b.newPage();
pg.on("pageerror", (e) => console.log("pageerror", e.message));
pg.on("console", (m) => {
  const t = m.text();
  if (!t.startsWith("[W") && !/warn/i.test(t)) console.log("c:", t.slice(0, 200));
});
const t0 = Date.now();
await pg.goto(`http://localhost:${port}/?${query}`);
await pg.waitForFunction(() => /ready|unavail|error/.test(document.getElementById("st").textContent), null, { timeout: 300000 });
console.log("load s", (Date.now() - t0) / 1000, await pg.textContent("#st"), JSON.stringify(await pg.evaluate(() => window.__info)));
if (/ready/.test(await pg.textContent("#st")))
  for (const n of ["ja_1", "mix_4", "mix_4"]) {
    await pg.evaluate(() => {
      document.getElementById("st").textContent = "";
    });
    await pg.selectOption("#p", { label: n });
    await pg.click("#go");
    await pg.waitForFunction(() => /done|error/.test(document.getElementById("st").textContent), null, { timeout: 300000 });
    const s = await pg.textContent("#st");
    const [audio, took] = s.includes("audio in")
      ? s
          .split(/[^\d.]+/)
          .filter(Boolean)
          .map(Number)
      : []; // "done 3.95s audio in 2.1s"
    console.log(n, s, took ? "RTF " + (took / audio).toFixed(2) : "");
  }
await b.close();
