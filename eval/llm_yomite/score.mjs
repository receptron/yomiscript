// Score the LLM outputs in results/*.json against the reference (items.json marked YomiScript + rule-based prosody)
// and export them as demo presets (demo/ys_web/web/llm_presets.json) to listen to.
// usage: node score.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse, isJa, realize } from "@mulmovoice/core";
import { K, WEB } from "../../demo/ys_web/node.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url)),
  OUT = path.join(HERE, "results");
const SETS = { ja: JSON.parse(fs.readFileSync(path.join(HERE, "items.json"))) };
if (fs.existsSync(path.join(HERE, "items_en.json"))) SETS.en = JSON.parse(fs.readFileSync(path.join(HERE, "items_en.json")));
const ref = (x) => x.ys ?? realize(x.marked, { dialect: x.dialect }); // English: Kokoro-based Yomite; Japanese: rule-based prosody
const units = (ys) =>
  parse(ys).sections.flatMap((s) =>
    s.toks
      .filter((t) => t.kind === "unit")
      .map((t) => ({
        lang: s.lang,
        ipa: (isJa(s.lang) ? t.ipa : t.raw)
          .replace(/[ˈˌ]/g, "")
          .replace(/\u0325/g, "") // devoicing ◌̥
          .replace(/g/g, s.lang === "zh" ? "g" : "ɡ"),
        f0: t.f0,
        fall: !!t.fall,
        rise: !!t.rise,
        ph: t.ph,
        sec: s,
      })),
  );
const strip = (s) =>
  s
    .replace(/<f0:[^>]*>/g, "")
    .replace(/̥/g, "")
    .replace(/\s+/g, " ")
    .trim();
function lev(a, b) {
  a = [...a];
  b = [...b];
  let p = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const c = [i];
    for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = c;
  }
  return p[b.length];
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
function pearson(x, y) {
  const mx = mean(x),
    my = mean(y);
  let n = 0,
    dx = 0,
    dy = 0;
  x.forEach((v, i) => {
    n += (v - mx) * (y[i] - my);
    dx += (v - mx) ** 2;
    dy += (y[i] - my) ** 2;
  });
  return dx && dy ? n / Math.sqrt(dx * dy) : NaN;
}
function nucleusF1(M, L) {
  // Japanese accent nucleus (ꜜ) agreement with the reference
  const J = M.map((u, i) => [u, L[i]]).filter(([u]) => isJa(u.lang));
  if (!J.length) return undefined;
  const tp = J.filter(([m, l]) => m.fall && l.fall).length,
    np = J.filter(([, l]) => l.fall).length,
    nr = J.filter(([m]) => m.fall).length;
  return np + nr ? (2 * tp) / (np + nr) : 1;
}
function pitchR(R, L) {
  // correlation with the reference values, over units that have one in both
  const both = R.map((u, i) => [u.f0, L[i].f0])
    .filter(([a, b]) => a && b)
    .map(([a, b]) => [mean(a), mean(b)]);
  if (both.length <= 2) return undefined;
  return pearson(
    both.map((x) => x[0]),
    both.map((x) => x[1]),
  );
}
function direction(R, L) {
  // same up/down movement as the reference between neighbouring units of one phrase
  let agree = 0,
    n = 0;
  for (let i = 1; i < R.length; i++) {
    const vals = [R[i - 1].f0, R[i].f0, L[i - 1].f0, L[i].f0];
    if (!vals.every(Boolean) || R[i].ph !== R[i - 1].ph || R[i].sec !== R[i - 1].sec) continue;
    const [a0, a1, b0, b1] = vals.map(mean);
    if (Math.abs(a1 - a0) <= 0.3) continue;
    n++;
    if (Math.sign(a1 - a0) === Math.sign(b1 - b0)) agree++;
  }
  return n ? agree / n : undefined;
}
function score(item, ys) {
  const r = { name: item.name };
  try {
    K.plan(ys);
    r.valid = true;
  } catch (e) {
    return { ...r, valid: false, error: e.message };
  }
  const L = units(ys),
    M = units(item.marked),
    R = units(ref(item));
  const mp = M.map((u) => u.ipa).join("");
  r.per = lev(L.map((u) => u.ipa).join(""), mp) / mp.length; // phoneme (character) error rate vs the reference IPA
  r.coverage = L.filter((u) => u.f0).length / L.length; // share of units with a pitch value
  r.aligned = L.length === M.length && L.every((u, i) => u.ipa === M[i].ipa);
  if (!r.aligned) return r;
  const opt = { nucleusF1: nucleusF1(M, L), pitchR: pitchR(R, L), direction: direction(R, L) };
  for (const [k, v] of Object.entries(opt)) if (v !== undefined) r[k] = v;
  return r;
}
const fmt = (v, d = 2) => (v === undefined || Number.isNaN(v) ? "–" : v.toFixed(d));
const rows = { ja: [], en: [] },
  presets = [];
if (SETS.en) for (const item of SETS.en.items) presets.push({ name: `en/${item.name}/kokoro`, ys: item.ys, pitch: "asis" });
for (const f of fs
  .readdirSync(OUT)
  .filter((f) => /^(claude|codex)\.(en\.)?(text|marked)\.json$/.test(f))
  .sort()) {
  const R = JSON.parse(fs.readFileSync(path.join(OUT, f)));
  const S = [],
    set = R.set ?? "ja",
    D = SETS[set];
  for (const item of D.items) {
    const ys = R.output?.[item.name];
    const s = ys ? score(item, ys) : { name: item.name, valid: false, error: "missing" };
    if (R.task === "marked" && s.valid) s.kept = strip(ys) === strip(item.marked);
    S.push({ ...s, ys });
    if (s.valid)
      presets.push({
        name: set === "en" ? `en/${item.name}/${R.llm}` : `${R.llm}/${R.task}/${item.name}`,
        ys,
        ...(item.dialect ? { dialect: item.dialect } : {}),
        pitch: "asis",
      });
  }
  R.scores = S;
  fs.writeFileSync(path.join(OUT, f), JSON.stringify(R, null, 1));
  const ok = S.filter((s) => s.valid),
    avg = (k) => {
      const v = ok.map((s) => s[k]).filter((v) => v !== undefined && !Number.isNaN(v));
      return v.length ? mean(v) : undefined;
    };
  rows[set].push(
    `| ${R.llm} (${R.model ?? "?"}) | ${R.task} | ${ok.length}/${S.length} | ${fmt(avg("per"), 3)} | ${ok.filter((s) => s.aligned).length} | ${fmt(avg("nucleusF1"))} | ${fmt(avg("pitchR"))} | ${fmt(avg("direction"))} | ${fmt(avg("coverage"))} | ${R.task === "marked" ? ok.filter((s) => s.kept).length + "/" + ok.length : "–"} |`,
  );
  for (const s of S) if (!s.valid) rows[set].push(`|  | ↳ ${s.name}: ${s.error.slice(0, 90).replace(/\|/g, "\\|")} | | | | | | | | |`);
}
const HEAD =
  "| LLM (model) | task | valid | phoneme err. | aligned | ꜜ F1 (ja) | pitch r vs ref | up/down agree | coverage | text kept |\n|---|---|---|---|---|---|---|---|---|---|\n";
const md =
  `# LLM-as-Yomite results\n\nGenerated by \`score.mjs\` on ${new Date().toISOString().slice(0, 10)}. The reference is a baseline, not ground truth for pitch; listen in the demo.\n\n## Japanese (\`items.json\`; reference: marked YomiScript + rule-based prosody of \`demo/ys_web/web/yomite.js\`)\n\n${HEAD}${rows.ja.join("\n")}\n` +
  (rows.en.length ? `\n## English (\`items_en.json\`; reference: Kokoro-based English Yomite, \`yomite/en_kokoro\`)\n\n${HEAD}${rows.en.join("\n")}\n` : "");
fs.writeFileSync(path.join(OUT, "summary.md"), md);
presets.sort((a, b) => a.name.startsWith("en/") - b.name.startsWith("en/") || (a.name.startsWith("en/") ? a.name.localeCompare(b.name) : 0)); // English grouped by sentence
fs.writeFileSync(path.join(WEB, "llm_presets.json"), JSON.stringify(presets, null, 1));
console.log(md);
console.log(`${presets.length} presets -> demo/ys_web/web/llm_presets.json`);
