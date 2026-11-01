// The listening page on http://127.0.0.1:8793/ (bound to this machine only). It serves the page, shuffle.mjs, the
// set without its key (no system, run or verdict: /set.json) and each clip by its opaque id (/clip/<id>.wav), so the
// page never sees which system a clip is. Builds set.json first when it is missing.
// usage: node serve.mjs [port]
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { AUDIO, SET, build } from "./build.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PORT = 8793;
const FILES = { "/": ["index.html", "text/html; charset=utf-8"], "/shuffle.mjs": ["shuffle.mjs", "text/javascript; charset=utf-8"] };

// what the page may know of a clip: the sentence, the words and every reading to choose from
export function publicSet(set) {
  const clips = set.clips.map((c) => ({ id: c.id, text: c.text, words: c.words.map((w) => ({ word: w.word, readings: [...w.right, ...w.wrong] })) }));
  return { seed: set.seed, clips };
}

function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-cache" });
  res.end(body);
}

export function serve(port = PORT) {
  const set = fs.existsSync(SET) ? JSON.parse(fs.readFileSync(SET, "utf8")) : build(),
    audio = Object.fromEntries(set.clips.map((c) => [c.id, path.join(AUDIO, c.audio)])),
    body = JSON.stringify(publicSet(set));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1").pathname,
      clip = /^\/clip\/(c\d+)\.wav$/.exec(url);
    if (url === "/set.json") return send(res, 200, "application/json; charset=utf-8", body);
    if (clip && audio[clip[1]]) return send(res, 200, "audio/wav", fs.readFileSync(audio[clip[1]]));
    if (FILES[url]) return send(res, 200, FILES[url][1], fs.readFileSync(path.join(HERE, FILES[url][0])));
    return send(res, 404, "text/plain", "not found");
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? PORT);
  await serve(port);
  console.log(`listening page: http://127.0.0.1:${port}/  (Ctrl+C to stop)`);
}
