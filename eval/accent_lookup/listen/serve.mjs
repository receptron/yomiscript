// The listening page of eval/accent_lookup on http://127.0.0.1:<port>/ (bound to this machine only; port 8829, or a
// free one when that is taken). It serves the page, shuffle.mjs (eval/tts_readings/listen's), the set without its key
// (which clip is which method: /set.json) and each clip by its opaque id (/clip/<id>.wav). Builds the set first when
// set.json or its audio is missing.
// usage: node serve.mjs [port] [--dir D]   (D: another set made by renderSet of build.mjs; default this directory)
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { build } from "./build.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PORT = 8829;
const FILES = {
  "/": [path.join(HERE, "index.html"), "text/html; charset=utf-8"],
  "/shuffle.mjs": [path.join(HERE, "../../tts_readings/listen/shuffle.mjs"), "text/javascript; charset=utf-8"],
};

/** what the page may know of an item: the text with the changed words, and its two clips as X and Y */
export function publicSet(set) {
  const items = set.items.map((it) => ({ item: it.item, words: it.words.map((w) => ({ t: w.t, changed: w.changed })), x: it.x.id, y: it.y.id }));
  return { seed: set.seed, items };
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
const complete = (set, audio) => set.items.every((it) => [it.x, it.y].every((c) => fs.existsSync(path.join(audio, `${c.id}.wav`))));

export async function serve(port = PORT, dir = HERE) {
  const file = path.join(dir, "set.json"),
    AUDIO = path.join(dir, "audio");
  let set = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  if (dir !== HERE && (!set || !complete(set, AUDIO))) throw new Error(`${dir}: no complete set (build it first)`);
  if (!set || !complete(set, AUDIO)) set = await build(set?.seed);
  const ids = new Set(set.items.flatMap((it) => [it.x.id, it.y.id])),
    body = JSON.stringify(publicSet(set));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1").pathname,
      clip = /^\/clip\/(c\d{6})\.wav$/.exec(url)?.[1];
    if (url === "/set.json") return send(res, 200, "application/json; charset=utf-8", body);
    if (clip && ids.has(clip)) return send(res, 200, "audio/wav", fs.readFileSync(path.join(AUDIO, `${clip}.wav`)));
    if (FILES[url]) return send(res, 200, FILES[url][1], fs.readFileSync(FILES[url][0]));
    return send(res, 404, "text/plain", "not found");
  });
  return listen(server, port);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2),
    at = args.indexOf("--dir"),
    dir = at >= 0 ? path.resolve(args.splice(at, 2)[1]) : HERE;
  const server = await serve(Number(args[0] ?? PORT), dir);
  console.log(`listening page: http://127.0.0.1:${server.address().port}/  (Ctrl+C to stop)`);
}
