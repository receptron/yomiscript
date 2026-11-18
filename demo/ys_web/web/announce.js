// A station announcement as YomiScript (announce.html): the train, its number, where it goes, the platform and the
// time, read by rule, as a person reading the board would: 8号 はちごう, 15番線 じゅうごばんせん, 8:35 はちじ
// さんじゅうごふん, 6:10 ろくじ じゅっぷん, 9:00 くじ ちょうど. The readings are written here; each word's text
// (<t:…>) carries the number in kanji. The accent is the template's own (Tokyo): a number is said in groups (にひゃく |
// よꜜんじゅう | ななꜜごう, as OpenJTalk's number rules group it), the last before 号, 時 or 分 with its nucleus on its last
// mora; 〜番線 and 〜行き are flat; the fixed words have theirs. The moraic nasal is written as it is said (ŋ, m, n).
import { parse } from "@yomiscript/core";

export const TRAINS = {
  こだま: "kodama",
  ひかり: "çikaɾi",
  のぞみ: "nodzomi",
};
export const PLACES = {
  東京: "toːkʲoː",
  新横浜: "ɕiɴjokohama",
  静岡: "ɕidzɯoka",
  名古屋: "naɡoja",
  京都: "kʲoːto",
  新大阪: "ɕiɴoːsaka",
  岡山: "okajama",
  広島: "çiɾoɕima",
  博多: "hakata",
};
/** @typedef {keyof typeof TRAINS} Train */
/** @typedef {keyof typeof PLACES} Place */
/** @typedef {[ipa: string, text: string]} Word */

const DIGIT = ["", "itɕi", "ɲi", "saɴ", "joɴ", "ɡo", "ɾokɯ", "nana", "hatɕi", "kʲɯː"],
  KANJI = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"],
  HUNDRED = ["", "çakɯ", "ɲiçakɯ", "saɴbʲakɯ", "joɴçakɯ", "ɡoçakɯ", "ɾoppʲakɯ", "nanaçakɯ", "happʲakɯ", "kʲɯːçakɯ"];

/** a place of a number in kanji: 十, 二十, nothing for 0 (one is the unit alone)
 * @param {number} d @param {string} unit */
const place = (d, unit) => {
  if (!d) return "";
  return (d > 1 ? KANJI[d] : "") + unit;
};
/** a number from 0 to 999 in kanji (十五, 百二十)
 * @param {number} n */
export function kanji(n) {
  if (n === 0) return "零";
  return place(Math.floor(n / 100), "百") + place(Math.floor(n / 10) % 10, "十") + KANJI[n % 10];
}
/** a number from 1 to 999 as it is read before 号 or 番線 (no sound change there)
 * @param {number} n */
export function number(n) {
  const t = Math.floor(n / 10) % 10;
  let tens = "";
  if (t) tens = (t > 1 ? DIGIT[t] : "") + "dʑɯː";
  return HUNDRED[Math.floor(n / 100)] + tens + DIGIT[n % 10];
}

const HOUR = ["ɾeː", "itɕi", "ɲi", "saɴ", "jo", "ɡo", "ɾokɯ", "ɕitɕi", "hatɕi", "kɯ"];
/** the hour (0 to 23) before 時: 4 よじ, 7 しちじ, 9 くじ
 * @param {number} h */
export function hour(h) {
  if (h < 10) return HOUR[h] + "dʑi";
  return (h >= 20 ? "ɲi" : "") + "dʑɯː" + (h % 10 ? HOUR[h % 10] : "") + "dʑi";
}
const MINUTE = ["", "ippɯɴ", "ɲiɸɯɴ", "saɴpɯɴ", "joɴpɯɴ", "ɡoɸɯɴ", "ɾoppɯɴ", "nanaɸɯɴ", "happɯɴ", "kʲɯːɸɯɴ"],
  TENS = ["", "", "ɲi", "saɴ", "joɴ", "ɡo"];
/** the minutes (0 to 59) with 分: 1 いっぷん, 10 じゅっぷん, 35 さんじゅうごふん; 0 is ちょうど
 * @param {number} m */
export function minute(m) {
  const [t, u] = [Math.floor(m / 10), m % 10];
  if (m === 0) return "tɕoːdo";
  if (!u) return TENS[t] + "dʑɯppɯɴ";
  return (t ? TENS[t] + "dʑɯː" : "") + MINUTE[u];
}

/** "8:35", "8時35分", "835" or "8" -> [8, 35], or null
 * @param {unknown} s
 * @returns {[number, number] | null} */
export function parseTime(s) {
  const t = String(s).normalize("NFKC").replace(/\s/g, "").replace(/分$/, "");
  let parts = t.split(/[:時]/);
  if (parts.length === 1 && /^\d{3,4}$/.test(t)) parts = [t.slice(0, -2), t.slice(-2)];
  if (parts.length > 2 || !parts.every((p, i) => /^\d{1,2}$/.test(p) || (i === 1 && p === ""))) return null;
  const [h, mi] = [Number(parts[0]), Number(parts[1] || 0)];
  return h < 24 && mi < 60 ? [h, mi] : null;
}

/** the moraic nasal as it is said before the next sound: ŋ before k / ɡ, m before p / b / m, n before t / d / n / s /
 * z / ɕ / ʑ / ɾ (しんかんせん ɕiŋkanseɴ); ɴ elsewhere
 * @param {string} ipa */
export const nasal = (ipa) =>
  ipa
    .replace(/ɴ(?=[kɡ])/g, "ŋ")
    .replace(/ɴ(?=[pbm])/g, "m")
    .replace(/ɴ(?=[tdnszɕʑɾ])/g, "n");
/** the morae of an IPA word: where each ends and whether it can carry the nucleus (not ɴ, Q or a long vowel)
 * @param {string} ipa */
function morae(ipa) {
  return parse(`ja /${ipa} ↘/`)
    .sections[0].toks.filter((t) => t.kind === "unit")
    .map((t) => ({ end: (t.end ?? 0) - 4, mora: t.mk === "mora" }));
}
/** an accent phrase's words with Tokyo marks: ꜜ after mora n of the phrase (-1: none, flat) and ꜛ after its first
 * mora unless the nucleus is there
 * @param {Word[]} words
 * @param {number} n
 * @returns {string[]} */
function phrase(words, n) {
  const W = words.map(([ipa, text]) => [nasal(ipa), text]),
    M = W.map(([ipa]) => morae(ipa)),
    /** @type {[word: number, offset: number, mark: string][]} */
    at = [];
  const total = M.reduce((s, m) => s + m.length, 0);
  let k = 0;
  M.forEach((m, w) =>
    m.forEach((x) => {
      if (k === 0 && n !== 0 && total > 1) at.push([w, x.end, "ꜛ"]);
      if (k === n) at.push([w, x.end, "ꜜ"]);
      k++;
    }),
  );
  return W.map(([ipa, text], w) => {
    let s = ipa;
    for (const [, o, c] of at.filter((x) => x[0] === w).sort((a, b) => b[1] - a[1])) s = s.slice(0, o) + c + s.slice(o);
    return `${s}<t:${text}>`;
  });
}
/** the nucleus of a number before a counter (号, 時, 分): on the number's last mora that can carry it (はちꜜじ,
 * いꜜっぷん, さꜜんじ, よんじゅꜜっぷん); counter: how many morae of the word are the counter's
 * @param {string} ipa */
function numberNucleus(ipa, counter = 0) {
  const m = morae(nasal(ipa));
  return m.slice(0, m.length - counter).findLastIndex((x) => x.mora);
}
const TENS_READ = ["", "dʑɯː", "ɲidʑɯː", "saɴdʑɯː", "joɴdʑɯː", "ɡodʑɯː", "ɾokɯdʑɯː", "nanadʑɯː", "hatɕidʑɯː", "kʲɯːdʑɯː"];
/** a number said in groups, as station announcements say it: its hundreds (flat: にひゃく) and its tens of twenty or
 * more (accented on the first mora: さꜜんじゅう) as phrases of their own when more follows, and the rest (the units
 * with the teens, or the last group) to go with the counter. -> { groups: phrases, last: the value of the rest }
 * @param {number} n */
function groups(n) {
  const [h, t, u] = [Math.floor(n / 100), Math.floor(n / 10) % 10, n % 10];
  let last = h * 100;
  if (u) last = t === 1 ? 10 + u : u;
  else if (t) last = t * 10;
  const out = [];
  if (h && last !== h * 100) out.push(phrase([[HUNDRED[h], kanji(h * 100)]], -1));
  if (t >= 2 && u) out.push(phrase([[TENS_READ[t], kanji(t * 10)]], 0));
  return { groups: out, last };
}
// the fixed words: their accent nucleus (-1 flat)
const TRAIN_ACCENT = { こだま: -1, ひかり: 2, のぞみ: -1 };

/** a number's groups, then its last group with the counter (make: the last value -> that phrase)
 * @param {number} v
 * @param {(last: number) => string[]} make */
function counted(v, make) {
  const g = groups(v);
  return [...g.groups, make(g.last)];
}
/** @param {number} no */
const trainNo = (no) =>
  counted(no, (v) =>
    phrase(
      [
        [number(v), kanji(v)],
        ["ɡoː", "号"],
      ],
      numberNucleus(number(v)),
    ),
  );
/** @param {number} track */
const platform = (track) =>
  counted(track, (v) =>
    phrase(
      [
        [number(v), kanji(v)],
        ["baɴseɴ", "番線"],
        ["kaɾa", "から"],
      ],
      -1,
    ),
  );
/** @param {number} h */
const hours = (h) => counted(h, (v) => phrase([[hour(v), `${kanji(v)}時`]], numberNucleus(hour(v), 1)));
/** @param {number} m */
function minutes(m) {
  if (!m)
    return [
      phrase(
        [
          [minute(0), "ちょうど"],
          ["ɲi", "に"],
        ],
        -1,
      ),
    ];
  return counted(m, (v) =>
    phrase(
      [
        [minute(v), `${kanji(v)}分`],
        ["ɲi", "に"],
      ],
      numberNucleus(minute(v), 2),
    ),
  );
}

/** the announcement's text and its YomiScript: readings and accent by the rules above (a flat 〜行き, 〜番線)
 * @param {{ train: Train, no: number, place: Place, track: number, time: [number, number] }} a */
export function announce({ train, no, place, track, time }) {
  const [h, m] = time;
  const text = `新幹線${train}${no}号${place}行きは、${track}番線から${h}:${String(m).padStart(2, "0")}に出発します。`;
  const phrases = [
    phrase([["ɕiɴkaɴseɴ", "新幹線"]], 2),
    phrase([[TRAINS[train], train]], TRAIN_ACCENT[train]),
    ...trainNo(no),
    phrase(
      [
        [PLACES[place], place],
        ["jɯki", "行き"],
        ["wa", "は"],
      ],
      -1,
    ),
    ["‖<t:、>"],
    ...platform(track),
    ...hours(h),
    ...minutes(m),
    phrase(
      [
        ["ɕɯppatsɯ", "出発"],
        ["ɕimasɯ", "します。"],
      ],
      5,
    ),
  ];
  const body = phrases.map((p) => p.join(" ")).reduce((a, p) => (p.startsWith("‖") || a.endsWith("‖<t:、>") ? `${a} ${p}` : `${a} | ${p}`));
  return { text, ys: `ja /${body} ↘/` };
}
