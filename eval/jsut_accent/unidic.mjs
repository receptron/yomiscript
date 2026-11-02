// UniDic's accent as another source for the entries of the D31 path (an AccentSource of @yomiscript/ja-accent).
// UniDic (cwj 3.1.0, NINJAL; GPL / LGPL / BSD, used here under the BSD licence) is read from ~/.cache/unidic
// (download unidic-cwj-3.1.0.zip from https://clrd.ninjal.ac.jp/unidic/ and unzip it there; not in the repository).
// An entry is matched by its surface (NFKC) and pronunciation; when UniDic's entries for that pair give more than
// one accent type, the most frequent is taken, and none on a tie. Only words that do not conjugate are taken: a
// conjugated form in UniDic carries its base form's accent type, where NAIST-JDIC has the form's own.
import fs from "fs";
import path from "path";

export const UNIDIC = path.join(process.env.HOME, ".cache/unidic/unidic-cwj-3.1.0/lex_3_1.csv");
// columns of lex_3_1.csv: surface, left id, right id, cost, then the features of its dicrc (f[0] at 4)
const POS1 = 4 + 0,
  CTYPE = 4 + 4,
  ORTH = 4 + 8,
  PRON = 4 + 9,
  ATYPE = 4 + 24,
  ACON = 4 + 25;

/** the fields of a CSV line (a field may be quoted, with commas inside) */
function fields(line) {
  const out = [];
  let cur = "",
    quoted = false;
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** surface + pronunciation -> the accent types and combination rules UniDic gives, with their counts */
export function loadUnidic(file = UNIDIC) {
  const M = new Map();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    const f = fields(line),
      a = f[ATYPE]?.split(",")[0];
    if (!/^\d+$/.test(a ?? "")) continue;
    // a word that conjugates carries its base form's accent type (aModType says how a form changes it): left out
    if (f[CTYPE] !== "*") continue;
    const k = `${f[ORTH].normalize("NFKC")}\t${f[PRON]}`,
      v = `${a}\t${f[ACON] === "*" ? "" : f[ACON].replace(/,/g, "/")}\t${f[POS1]}`,
      m = M.get(k) ?? new Map();
    m.set(v, (m.get(v) ?? 0) + 1);
    M.set(k, m);
  }
  return M;
}

/** the entries OpenJTalk's rules treat by their own conventions (NAIST-JDIC's part of speech): formal nouns (こと,
 * ため), suffixes, numbers, particles, auxiliaries and marks keep NAIST-JDIC's accent with `content` */
const FUNCTION = /^(名詞,(非自立|接尾|数)|助詞|助動詞|記号|フィラー)/;
/** UniDic's parts of speech that can be the same word as one of NAIST-JDIC's (the first field of each) */
const SAME_POS = { 名詞: ["名詞", "代名詞", "形状詞"], 副詞: ["副詞"], 連体詞: ["連体詞"], 接続詞: ["接続詞"], 感動詞: ["感動詞"], 接頭詞: ["接頭辞"] };
/** an AccentSource from UniDic: its accent type, with `chain` also its combination rule, with `content` only for
 * content words */
export function unidicSource(M, { chain = false, content = false } = {}) {
  const stats = { entries: 0, found: 0, changed: 0 };
  const source = (e) => {
    if (e.pron.includes("+")) return undefined; // a compound entry keeps its own
    if (content && FUNCTION.test(e.pos)) return undefined;
    stats.entries++;
    const ok = SAME_POS[e.pos.split(",")[0]] ?? [],
      m = [...(M.get(`${e.surface.normalize("NFKC")}\t${e.pron}`) ?? [])].filter(([v]) => ok.includes(v.split("\t")[2]));
    if (!m.length) return undefined;
    const best = m.sort((x, y) => y[1] - x[1]);
    if (best.length > 1 && best[0][1] === best[1][1] && best[0][0].split("\t")[0] !== best[1][0].split("\t")[0]) return undefined;
    stats.found++;
    const [a, c] = best[0][0].split("\t");
    return { a: Number(a), ...(chain && c ? { chain: c } : {}) };
  };
  return { source, stats };
}
