// Score the accent-mark trial runs (runs/claude/<prompt>.<set>.<rep>.json): the readings, and the accent of what Kokoro would
// say, measured on the F0 it is given, against the pyopenjtalk reference (accent_ref.json, provisional).
//   reading   hard: right by the gold readings; ja: the same reading as the original Kokoro front end
//   kept      addmarks: removing ꜛ ꜜ | gives back the input (the reading is the `none` run's)
//   marks     share of the aligned morae inside marked phrases whose H / L matches the reference
//   pitch     share of the reference's rises and falls (between neighbouring morae of one accent phrase) that the F0
//             follows, by at least 0.3 semitones: Kokoro's own prediction, the rules on the marked phrases (as in the
//             reverted change), and the same values halved (gentler); "late" also accepts Kokoro's move one mora
//             later (a fall realized on the next mora, as in natural speech)
// usage: node score.mjs   -> results.md, results.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse, realize } from "@yomiscript/core";
import { engine, K } from "../../../../demo/ys_web/node.mjs";
import { SETS } from "../../sets.mjs";
import { loose, ps } from "../../reading.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REFS = JSON.parse(fs.readFileSync(path.join(HERE, "../../refs.json"), "utf8"));
const ACC = JSON.parse(fs.readFileSync(path.join(HERE, "accent_ref.json"), "utf8"));
const E = await engine("fp32"); // what the CLI and the MCP server use
const DEAD = 0.3;

const strip = (ys) => ys.replace(/[ꜛꜜ]/g, "").replace(/ \| /g, " ").replace(/\s+/g, " ").trim();
const VKEY = { a: "a", i: "i", ɯ: "u", ɨ: "u", e: "e", o: "o" };
function phraseHL(M, hl) {
  let st = M[0].hasRise ? "L" : "H";
  for (const m of M) {
    hl.set(m, st);
    if (m.rise) st = "H";
    if (m.fall) st = "L";
  }
}
function ruleHL(sec) {
  // the H / L the rules give each mora of a marked accent phrase (as in jaPhrase in packages/core)
  const chunks = {};
  for (const t of sec.toks.filter((x) => x.kind === "unit")) {
    chunks[t.chunk] ??= [];
    chunks[t.chunk].push(t);
  }
  const hl = new Map();
  for (const M of Object.values(chunks).filter((C) => C.some((m) => m.rise || m.fall))) phraseHL(M, hl);
  return hl;
}
const SPECIAL = { Q: "cl", N: "N" };
/** the Japanese morae of a YomiScript, in order: alignment key, section and unit index in the plan, rule H / L if marked */
function morae(ys) {
  const out = [];
  parse(ys).sections.forEach((sec, si) => {
    if (sec.lang !== "ja") return;
    const hl = ruleHL(sec);
    let u = -1,
      prev = null;
    for (const t of sec.toks) {
      if (t.kind === "bound") continue;
      u++;
      if (t.kind !== "unit") continue;
      if (t.mk === "mora") prev = VKEY[t.v];
      const key = t.mk === "mora" || t.mk === "R" ? prev : SPECIAL[t.mk];
      out.push({ key, sec: si, u, rule: hl.get(t) ?? null });
    }
  });
  return out;
}
function align(a, b) {
  // longest common subsequence of the keys: pairs [i, j]
  const n = a.length,
    m = b.length,
    L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i].key === b[j].key ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const P = [];
  for (let i = 0, j = 0; i < n && j < m;)
    if (a[i].key === b[j].key) P.push([i++, j++]);
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  return P;
}
const st = (hz) => (hz > 60 ? 12 * Math.log2(hz / 100) : NaN);
async function unitPitch(ys) {
  // per section: mean semitones of each plan unit, for Kokoro's F0 and for the F0 with the YomiScript's values
  return Promise.all(
    K.plan(ys).map(async (sec) => {
      const { dur, f0 } = await E.predict(sec);
      const F = K.f0Override(f0, sec.uid, dur, sec.U);
      const per = (arr) => {
        const s = new Float64Array(sec.U.length),
          c = new Float64Array(sec.U.length);
        let fr = 0;
        dur.forEach((d, l) => {
          for (let r = 0; r < d * 2 && fr < arr.length; r++, fr++) {
            const k = sec.uid[l],
              v = st(arr[fr]);
            if (k >= 0 && !isNaN(v)) ((s[k] += v), c[k]++);
          }
        });
        return Array.from(s, (v, k) => (c[k] ? v / c[k] : NaN));
      };
      return { kokoro: per(f0), given: per(F) };
    }),
  );
}
const halve = (ys) =>
  ys.replace(
    /<f0:([^>]*)>/g,
    (_, v) =>
      `<f0:${v
        .split(",")
        .map((x) => Math.round(50 * Number(x)) / 100)
        .join(",")}>`,
  );

async function scoreItem(set, name, ys) {
  const ref = ACC[set][name],
    M = morae(ys),
    P = align(M, ref);
  const marked = realize(ys, { markedOnly: true });
  const [k, r, h] = [await unitPitch(ys), await unitPitch(marked), await unitPitch(halve(marked))];
  const pitchOf = { kokoro: (m) => k[m.sec].kokoro[m.u], rules: (m) => r[m.sec].given[m.u], halved: (m) => h[m.sec].given[m.u] };
  const res = { aligned: P.length, refMorae: ref.length, markN: 0, markOk: 0, trans: 0, follow: { kokoro: 0, late: 0, rules: 0, halved: 0 } };
  for (const [i, j] of P)
    if (M[i].rule) {
      res.markN++;
      res.markOk += M[i].rule === ref[j].hl;
    }
  for (let q = 0; q + 1 < P.length; q++) {
    const [i, j] = P[q],
      [i2, j2] = P[q + 1];
    if (j2 !== j + 1 || ref[j].phrase !== ref[j2].phrase || ref[j].hl === ref[j2].hl || M[i].sec !== M[i2].sec) continue;
    res.trans++;
    const up = ref[j2].hl === "H";
    const ok = (d) => !isNaN(d) && (up ? d > DEAD : d < -DEAD);
    for (const [s, f] of Object.entries(pitchOf)) if (ok(f(M[i2]) - f(M[i]))) res.follow[s]++;
    const n = P[q + 2];
    const later = n && n[1] === j2 + 1 && ref[n[1]].phrase === ref[j2].phrase && M[n[0]].sec === M[i2].sec;
    if (ok(pitchOf.kokoro(M[i2]) - pitchOf.kokoro(M[i])) || (later && ok(pitchOf.kokoro(M[n[0]]) - pitchOf.kokoro(M[i2])))) res.follow.late++;
  }
  return res;
}

function reading(set, i, ys) {
  const g = ps(ys);
  if (g === null) return false;
  if (set === "hard") return REFS.hard[i].gold.map(ps).some((w) => w && loose(w) === loose(g));
  return loose(g) === loose(REFS.ja[i].ps.join(" "));
}
const phrases = (ys) => {
  const C = {};
  for (const sec of parse(ys).sections) for (const t of sec.toks) if (t.kind === "unit" && sec.lang === "ja") C[`${t.ph}/${t.chunk}`] ||= !!(t.rise || t.fall);
  return [Object.keys(C).length, Object.values(C).filter(Boolean).length];
};

const runs = fs
  .readdirSync(path.join(HERE, "runs", "claude"))
  .filter((f) => f.endsWith(".json"))
  .sort();
const out = [],
  wrong = {};
for (const f of runs) {
  const R = JSON.parse(fs.readFileSync(path.join(HERE, "runs", "claude", f), "utf8")),
    { prompt, set, rep } = R;
  const base = prompt === "addmarks" ? JSON.parse(fs.readFileSync(path.join(HERE, "runs", "claude", `none.${set}.${rep}.json`), "utf8")).output : null;
  const row = {
    prompt,
    set,
    rep,
    items: 0,
    valid: 0,
    right: 0,
    kept: 0,
    ph: 0,
    mph: 0,
    markN: 0,
    markOk: 0,
    trans: 0,
    follow: { kokoro: 0, late: 0, rules: 0, halved: 0 },
  };
  for (const [i, x] of SETS[set].entries()) {
    const ys = R.output?.[x.name];
    row.items++;
    if (!ys) continue;
    try {
      parse(ys);
    } catch {
      continue;
    }
    row.valid++;
    if (reading(set, i, ys)) row.right++;
    else {
      const k = `${set} ${x.name} ${x.text}`;
      wrong[k] ??= [];
      wrong[k].push(`${prompt}${rep}`);
    }
    if (base) row.kept += strip(ys) === strip(base[x.name] ?? "");
    const [a, b] = phrases(ys);
    row.ph += a;
    row.mph += b;
    if (x.name === "long") continue; // over Kokoro's 510 phonemes
    const s = await scoreItem(set, x.name, ys);
    row.markN += s.markN;
    row.markOk += s.markOk;
    row.trans += s.trans;
    for (const k of Object.keys(row.follow)) row.follow[k] += s.follow[k];
  }
  out.push(row);
  console.log(f);
}
fs.writeFileSync(path.join(HERE, "results.json"), JSON.stringify({ runs: out, wrong }, null, 1));

const pc = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : "-");
const md = [
  "# Accent-mark trial: results (`node score.mjs`)",
  "",
  "| prompt | set | rep | valid | reading (hard: gold; ja: same as the original Kokoro) | kept | marked phrases | marks match ref | pitch follows ref: Kokoro | Kokoro, late ok | rules | halved |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|",
];
for (const r of out) {
  const kept = r.prompt === "addmarks" ? `${r.kept}/${r.items}` : "-";
  md.push(
    `| ${r.prompt} | ${r.set} | ${r.rep} | ${r.valid}/${r.items} | ${pc(r.right, r.items)} (${r.right}) | ${kept} | ${pc(r.mph, r.ph)} | ${pc(r.markOk, r.markN)} | ${pc(r.follow.kokoro, r.trans)} | ${pc(r.follow.late, r.trans)} | ${r.markN ? pc(r.follow.rules, r.trans) : "-"} | ${r.markN ? pc(r.follow.halved, r.trans) : "-"} |`,
  );
}
md.push("", "## Readings that were wrong, and in which runs", "");
for (const [k, v] of Object.entries(wrong).sort()) md.push(`- ${k}: ${v.join(", ")}`);
fs.writeFileSync(path.join(HERE, "results.md"), md.join("\n") + "\n");
console.log(md.join("\n"));
