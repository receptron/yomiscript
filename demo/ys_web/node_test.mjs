import fs from "fs";
import * as ort from "onnxruntime-web";
import * as Y from "./web/ys.js";
Y.setData(JSON.parse(fs.readFileSync("web/data.json")));
const r = JSON.parse(fs.readFileSync("f0ref.json"));
const f1 = Y.f0Override(Float32Array.from(r.f0), r.uid, r.dur, r.U);
let md = 0;
f1.forEach((v, i) => (md = Math.max(md, Math.abs(v - r.f1[i]))));
console.log("f0Override max abs diff Hz", md.toFixed(4));
ort.env.wasm.numThreads = 1;
const E = new Y.Engine(ort, async (p) => {
  const b = fs.readFileSync("web/" + p);
  return p.endsWith(".bin") ? b.buffer.slice(b.byteOffset, b.byteOffset + b.length) : new Uint8Array(b);
});
let t = Date.now();
await E.init();
console.log("init s", (Date.now() - t) / 1000);
fs.mkdirSync("out", { recursive: true });
const P = JSON.parse(fs.readFileSync("web/presets.json"));
for (const { name, ys } of P) {
  t = Date.now();
  const { audio } = await E.synth(ys);
  fs.writeFileSync(`out/${name}_js.wav`, Buffer.from(Y.wav(audio)));
  console.log(name, (audio.length / 24000).toFixed(2) + "s audio", ((Date.now() - t) / 1000).toFixed(1) + "s");
}
