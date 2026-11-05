// More sentences for the Qwen corpus, from Japanese Wikipedia (wikimedia/wikipedia 20231101.ja on Hugging Face, CC
// BY-SA 4.0, through the dataset viewer's rows API): articles at seeded random offsets, at most two sentences from
// each, kept only when they are plain prose of 12 to 50 characters in kanji and kana (no digits, Latin letters,
// brackets or other symbols, which a reader may read in more than one way), not starting with a particle (the dump
// drops dates and numbers, leaving "には当時…"), and not already a JSUT sentence.
// usage: node wiki_sentences.mjs [count] [seed]   -> work/wiki/sentences.json ([{ name, text, title, offset }])
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COUNT = Number(process.argv[2] ?? 5000),
  PER_ARTICLE = 2,
  ROWS = 100,
  // a later batch (seed > 1) leaves out the first batch's sentences and names its own
  SEED = Number(process.argv[3] ?? 1),
  PREFIX = SEED === 1 ? "WIKI" : `WIKI${SEED}`;
const API = "https://datasets-server.huggingface.co/rows?dataset=wikimedia/wikipedia&config=20231101.ja&split=train";
const FRAGMENT = /^(?:に|は|を|が|の|で|と|へ|や|も|から|まで|より)/;
const PLAIN = /^[一-鿿々〆ぁ-ゖァ-ヺー、]{11,49}。$/;

/** a small seeded generator (mulberry32), so the same offsets and choices come back on a rerun */
function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** the plain sentences of an article's text */
function plainSentences(text) {
  return text
    .split("\n")
    .flatMap((line) =>
      line
        .split("。")
        .slice(0, -1)
        .map((s) => `${s}。`),
    )
    .map((s) => s.trim())
    .filter((s) => PLAIN.test(s) && /[ぁ-ゖ]/.test(s) && !s.startsWith("、") && !FRAGMENT.test(s));
}

/** the dataset viewer's answer, asked again after a pause when it is busy */
async function get(offset, length) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(`${API}&offset=${offset}&length=${length}`, { headers: { "User-Agent": "yomiscript-eval" } });
    if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) return r.json();
    await new Promise((res) => setTimeout(res, 3000 * (i + 1)));
  }
  throw new Error(`rows at ${offset}: no answer`);
}
const rows = async (offset) => (await get(offset, ROWS)).rows.map((x) => ({ ...x.row, offset: x.row_idx }));

const texts = (f) => JSON.parse(fs.readFileSync(path.join(HERE, f), "utf8")).map((x) => x.text),
  jsut = new Set([...texts("../jsut_accent/data/items.json"), ...(SEED === 1 ? [] : texts("work/wiki/sentences.json"))]),
  rand = rng(SEED),
  seen = new Set(),
  out = [];
const total = (await get(0, 1)).num_rows_total;
while (out.length < COUNT) {
  const offset = Math.floor(rand() * (total - ROWS));
  for (const a of await rows(offset)) {
    const S = plainSentences(a.text).filter((s) => !jsut.has(s) && !seen.has(s));
    for (let k = 0; k < PER_ARTICLE && S.length && out.length < COUNT; k++) {
      const s = S.splice(Math.floor(rand() * S.length), 1)[0];
      seen.add(s);
      out.push({ name: `${PREFIX}_${String(out.length + 1).padStart(5, "0")}`, text: s, title: a.title, offset: a.offset });
    }
  }
  console.log(`${out.length} sentences`);
}
fs.mkdirSync(path.join(HERE, "work/wiki"), { recursive: true });
fs.writeFileSync(path.join(HERE, "work/wiki/sentences.json"), JSON.stringify(out, null, 0));
