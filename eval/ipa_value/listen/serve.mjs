// The listening page of eval/ipa_value on http://127.0.0.1:<port>/ (bound to this machine only; port 8817, or a free
// one when that is taken). It serves the page, shuffle.mjs (eval/tts_readings/listen's), the set without its key
// (no condition, item or sentence text of A: /set.json) and each clip by its opaque id (/clip/<id>.wav): an A clip is
// cut from its sentence's wav here, faded in and out. Builds set.json first when it is missing.
// usage: node serve.mjs [port]
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { wav } from "@yomiscript/kokoro";
import { AUDIO, SET, build } from "./build.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PORT = 8817;
const FADE_IN = 0.01,
  FADE_OUT = 0.025;
const FILES = {
  "/": [path.join(HERE, "index.html"), "text/html; charset=utf-8"],
  "/shuffle.mjs": [path.join(HERE, "../../tts_readings/listen/shuffle.mjs"), "text/javascript; charset=utf-8"],
};

// what the page may know of a clip: A, the words of its minimal set and their kana; B, the sentence, English hidden
export function publicSet(set) {
  const clips = set.clips.map((c) =>
    c.part === "A" ? { id: c.id, part: "A", kana: c.kana, choices: c.members.map((m) => m.word) } : { id: c.id, part: "B", text: c.shown },
  );
  return { seed: set.seed, clips };
}

// the samples of a 16-bit mono WAV as the Kokoro Katarite writes it (K.wav: a 44-byte header), and its rate
function samples(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 36, 40) !== "data" || b.readUInt16LE(34) !== 16 || b.readUInt16LE(22) !== 1) throw new Error(`${file}: not K.wav's format`);
  const n = Math.min(b.readUInt32LE(40), b.length - 44) / 2,
    a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = b.readInt16LE(44 + 2 * i) / 32767;
  return { a, rate: b.readUInt32LE(24) };
}

// the stretch [from, to] seconds of a wav, faded in and out, as a WAV
export function cutWav(file, from, to) {
  const { a, rate } = samples(file),
    out = a.slice(Math.round(from * rate), Math.min(a.length, Math.round(to * rate))),
    fin = Math.round(FADE_IN * rate),
    fout = Math.round(FADE_OUT * rate);
  for (let i = 0; i < Math.min(fin, out.length); i++) out[i] *= i / fin;
  for (let i = 0; i < Math.min(fout, out.length); i++) out[out.length - 1 - i] *= i / fout;
  return Buffer.from(wav(out, rate));
}

function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-cache" });
  res.end(body);
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", (e) => (e.code === "EADDRINUSE" && port !== 0 ? listen(server, 0).then(resolve, reject) : reject(e)));
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

export function serve(port = PORT) {
  const set = fs.existsSync(SET) ? JSON.parse(fs.readFileSync(SET, "utf8")) : build(),
    clips = new Map(set.clips.map((c) => [c.id, c])),
    cache = new Map(),
    body = JSON.stringify(publicSet(set));
  const audio = (c) => (c.part === "A" ? cutWav(path.join(AUDIO, c.audio), c.from, c.to) : fs.readFileSync(path.join(AUDIO, c.audio)));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1").pathname,
      clip = /^\/clip\/([ab]\d+)\.wav$/.exec(url)?.[1];
    if (url === "/set.json") return send(res, 200, "application/json; charset=utf-8", body);
    if (clip && clips.has(clip)) {
      if (!cache.has(clip)) cache.set(clip, audio(clips.get(clip)));
      return send(res, 200, "audio/wav", cache.get(clip));
    }
    if (FILES[url]) return send(res, 200, FILES[url][1], fs.readFileSync(FILES[url][0]));
    return send(res, 404, "text/plain", "not found");
  });
  return listen(server, port);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await serve(Number(process.argv[2] ?? PORT));
  console.log(`listening page: http://127.0.0.1:${server.address().port}/  (Ctrl+C to stop)`);
}
