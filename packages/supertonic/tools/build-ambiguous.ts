// Build data/ambiguous.json: written forms that IPAdic gives more than one pronunciation (一日: イチニチ / ツイタチ),
// with how many readings each has. The Supertonic Katarite gives the engine the reading as kana for these and leaves
// every other word as written. IPAdic is used for its readings only; nothing of it is copied but this list.
// usage: node tools/build-ambiguous.ts <dir with the IPAdic CSV files (EUC-JP), from github.com/taku910/mecab/mecab-ipadic>
import fs from "node:fs";
import path from "node:path";
import { byCodeUnit } from "../src/order.ts";

const KANJI = /[㐀-鿿々]/;
const O_ROW = "オコソトノホモヨロゴゾドボポョォ",
  E_ROW = "エケセテネヘメレゲゼデベペェ";
function pron(p: string): string {
  // one spelling per pronunciation: long vowels as ー (リョウリ / リョーリ, セイ / セー), ヲ / ヅ / ヂ as said
  p = p.replaceAll("ヲ", "オ").replaceAll("ヅ", "ズ").replaceAll("ヂ", "ジ");
  let out = "";
  for (const c of p) {
    const prev = out.at(-1);
    out += prev && ((c === "ウ" && O_ROW.includes(prev)) || (c === "イ" && E_ROW.includes(prev))) ? "ー" : c;
  }
  return out;
}
const dir = process.argv[2];
if (!dir) throw new Error("usage: node tools/build-ambiguous.ts <IPAdic CSV dir>");
const readings = new Map<string, Set<string>>();
const decoder = new TextDecoder("euc-jp");
for (const f of fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".csv"))
  .sort(byCodeUnit)) {
  for (const line of decoder.decode(fs.readFileSync(path.join(dir, f))).split("\n")) {
    const row = line.split(","); // IPAdic fields have no quoted commas
    const [surface] = row,
      reading = row[12]?.trim(); // undefined: fewer than 13 fields
    if (surface === undefined || reading === undefined || !KANJI.test(surface) || reading === "*") continue;
    if (!readings.has(surface)) readings.set(surface, new Set());
    readings.get(surface)?.add(pron(reading));
  }
}
const out: Record<string, number> = {};
for (const w of [...readings.keys()].sort(byCodeUnit)) {
  const n = readings.get(w)?.size ?? 0;
  if (n > 1) out[w] = n;
}
fs.writeFileSync(new URL("../data/ambiguous.json", import.meta.url), JSON.stringify(out));
console.log(`${readings.size} written forms with kanji, ${Object.keys(out).length} with more than one reading`);
