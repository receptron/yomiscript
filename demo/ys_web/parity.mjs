import fs from "fs";
import * as Y from "./web/ys.js";
Y.setData(JSON.parse(fs.readFileSync("web/data.json")));
const R = JSON.parse(fs.readFileSync("pyref.json"));
const P = JSON.parse(fs.readFileSync("web/presets.json"));
let bad = 0;
for (const { name, ys } of P) {
  const js = Y.plan(ys);
  const py = R[name];
  if (!py) {
    console.log(name, "(no py ref) sections", js.length, js.map((s) => s.voice).join(","));
    continue;
  }
  const close = (a, b) =>
    JSON.stringify(a.map((u) => [u[0], u[1] && u[1].map((v) => +v.toFixed(6)), u[2]])) ===
    JSON.stringify(b.map((u) => [u[0], u[1] && u[1].map((v) => +v.toFixed(6)), u[2]]));
  const ok =
    js.length === py.length &&
    js.every((s, i) => s.ys === py[i].ys && s.voice === py[i].voice && JSON.stringify(s.ids) === JSON.stringify(py[i].ids) && close(s.U, py[i].U));
  if (!ok) {
    bad++;
    console.log("MISMATCH", name);
    js.forEach((s, i) => {
      const p = py[i] || {};
      if (JSON.stringify(s.ids) !== JSON.stringify(p.ids) || s.voice !== p.voice || !close(s.U, p.U || []))
        console.log(" js", s.ys, s.voice, JSON.stringify(s.U), "\n py", p.ys, p.voice, JSON.stringify(p.U));
    });
  } else console.log("ok", name);
}
console.log("mismatches", bad);
