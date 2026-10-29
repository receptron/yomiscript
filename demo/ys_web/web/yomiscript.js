// YomiScript notation — no engine, voice or language rules.
// Utterance: `<lang> /… ↘/` (or ↗ for a question), lang = BCP 47 language (no dialect tags). Inside: ` | ` accent phrase,
// ` ‖ ` breath group / pause, `{<lang> …}` a section in another language.
// parse(): utterance -> language sections -> tokens (units = mora / syllable, plus space / pause / boundary / end).
// Accent, stress and tone marks are kept on the tokens; pitch values <f0:v,…> (semitones relative to the
// speaker's register) attach to the unit right before them. Offsets point into the trimmed utterance string.
const LANG = "[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*";
const UTT = new RegExp(`^(${LANG})\\s*/(.*?)\\s*([↘↗])\\s*/$`, "s");
const TAG = new RegExp(`\\{(${LANG}) ([^{}]*)\\}`, "g");
export const isJa = (l) => l === "ja" || l.startsWith("ja-");
export const VOWELS = "aeiouæɑɒɔəɚɛɜɪʊʌᵊɐøœ"; // IPA vowel letters of the syllable languages (en, fr); diacritics follow them
const SEPS = { "|": "#", "‖": "_" }; // internal names: '#' accent phrase, '_' pause
const SEP = (s) => SEPS[s] ?? null;
const inStr = (ch, s) => s.includes(ch);
function f0At(s, i) {
  // '<f0:1.5,-2>' at i -> [values, index after '>'] or null
  if (!s.startsWith("<f0:", i)) return null;
  const j = s.indexOf(">", i);
  if (j < 0) throw new Error(`unclosed <f0: in ${JSON.stringify(s)}`);
  const v = s
    .slice(i + 4, j)
    .split(",")
    .map(Number);
  if (v.some(isNaN)) throw new Error(`bad pitch value ${s.slice(i, j + 1)}`);
  return [v, j + 1];
}
function whyNot(s) {
  if (!s) return "empty input";
  if (/^\^|[$?]$/.test(s)) return "old notation (^…$ / ^lang|…); write  <lang> /… ↘/";
  if (!new RegExp(`^${LANG}\\s*/`).test(s)) return 'missing language tag before the opening "/" (e.g. "ja /")';
  if (!/\/\s*$/.test(s)) return 'missing closing "/"';
  if (!/[↘↗]\s*\/\s*$/.test(s)) return 'missing sentence-final ↘ or ↗ before the closing "/"';
  return "not YomiScript";
}
// <t:…> the original text (D23). Each one closes a span: the units since the previous <t:…> are the reading of that
// text; a <t:…> with no units before it is text that is not spoken (punctuation, brackets). The annotations are taken
// out before parsing, so they never change the pronunciation; offsets are mapped back to the string as written.
function takeTexts(ys) {
  let out = "";
  const map = [],
    texts = [];
  for (let i = 0; i < ys.length;) {
    if (ys.startsWith("<t:", i)) {
      const j = ys.indexOf(">", i);
      if (j < 0) throw new Error(`unclosed <t: in ${JSON.stringify(ys)}`);
      texts.push({ text: ys.slice(i + 3, j), at: out.length });
      i = j + 1;
    } else {
      map.push(i);
      out += ys[i++];
    }
  }
  map.push(ys.length);
  return { out, map, texts };
}
function spanOf(texts, t) {
  if (t.kind !== "unit" || !texts.length) return;
  const k = texts.findIndex((x) => x.at >= t.end);
  if (k >= 0) t.span = k;
}
function mapOffsets(map, t) {
  if (typeof t.start === "number") t.start = map[t.start];
  for (const f of ["end", "vend"]) if (t[f] > 0) t[f] = map[t[f] - 1] + 1; // exclusive ends: one past the last character
}
function placeTexts(S, T) {
  // each unit gets the span it reads (index into texts), then offsets go back to the annotated string
  for (const sec of S) {
    sec.base = T.map[sec.base];
    for (const t of sec.toks) {
      spanOf(T.texts, t);
      mapOffsets(T.map, t);
    }
  }
}
export function parse(written) {
  written = written.trim();
  const T = takeTexts(written),
    ys = T.out;
  const m = ys.match(UTT);
  if (!m) throw new Error(`${whyNot(ys)} — got ${JSON.stringify(ys.length > 60 ? ys.slice(0, 60) + "…" : ys)}. YomiScript looks like  ja /kʲoꜜːwa | aꜜmeɡa ↘/`);
  const top = m[1],
    b = m[2],
    end = m[3] === "↗" ? "?" : "$",
    b0 = ys.indexOf("/") + 1;
  const P = [];
  let pos = 0;
  for (const mm of b.matchAll(TAG)) {
    P.push([top, pos, b.slice(pos, mm.index)], [mm[1], mm.index + mm[1].length + 2, mm[2]]);
    pos = mm.index + mm[0].length;
  }
  P.push([top, pos, b.slice(pos)]);
  const S = [];
  for (const [l, s, x] of P) {
    let a = 0,
      z = x.length;
    while (a < z && inStr(x[a], " |‖")) a++;
    while (z > a && inStr(x[z - 1], " |‖")) z--;
    if (a < z) S.push({ lang: l, text: x.slice(a, z), base: b0 + s + a });
  }
  S.forEach((sec, i) => {
    sec.end = i === S.length - 1 ? end : "$";
    sec.toks = segment(sec.lang, sec.text, sec.base);
    const last = [...sec.toks].reverse().find((t) => t.kind !== "bound");
    sec.toks.push({ kind: "end", sym: endSym(sec.end, last), ph: last ? last.ph : 0 });
  });
  placeTexts(S, T);
  return { ys: written, top, end, sections: S, texts: T.texts.map((x) => x.text) };
}
// the final ↘ / ↗ is the engine's '.' / '?'; ↘ adds nothing if the utterance already ends with punctuation (<p:!> …)
function endSym(end, last) {
  if (end === "?") return "?";
  return last?.kind === "punct" ? "" : ".";
}
function segment(lang, t, base) {
  if (isJa(lang)) return jaSeg(t, base);
  return lang === "zh" ? zhSeg(t, base) : euSeg(t, base);
}

// ---- Japanese: IPA morae with ꜛ (rise) / ꜜ (accent nucleus); '.' and spaces optional
const JV = "aiɯeouɨ",
  JNAS = "mnɲŋɴ",
  DEVOICE = "̥";
const JAFF = ["tɕ", "dʑ", "ts", "dz", "ʨ", "ʥ", "ʦ", "ʣ"];
const JCONS = "kɡsɕztdnɲhçɸbpmjwɾvʔŋɴʑβ";
function jaTokens(c, base) {
  const T = [];
  for (let i = 0; i < c.length;) {
    const ch = c[i],
      at = base + i;
    if (ch === "." || ch === " ") {
      i++;
      continue;
    }
    const f = f0At(c, i);
    if (f) {
      T.push({ t: "F", v: f[0] });
      i = f[1];
      continue;
    }
    if (ch === "ꜛ" || ch === "ꜜ") {
      T.push({ t: ch });
      i++;
      continue;
    }
    if (ch === "ː") {
      T.push({ t: "R", s: "ː", end: at + 1 });
      i++;
      continue;
    }
    if (inStr(ch, JV)) {
      let dev = false;
      i++;
      if (c[i] === DEVOICE) {
        dev = true;
        i++;
      }
      T.push({ t: "V", s: ch, dev, vend: at + 1, end: base + i });
      continue;
    }
    const [s, j] = jaConsonant(c, i);
    i = j;
    T.push({ t: "C", s, end: base + i });
  }
  return T;
}
function jaConsonant(c, i) {
  // the consonant at i (with ʲ / ʷ) -> [symbol, index after it]
  const ch = c[i],
    two = c.slice(i, i + 2);
  let s = ch;
  if (JAFF.includes(two)) s = two;
  else if (ch === "g")
    s = "ɡ"; // IPA: g = ɡ
  else if (!JAFF.includes(ch) && !inStr(ch, JCONS)) {
    const kana = /[぀-ヿ]/.test(ch) ? " (kana is not YomiScript; write IPA with ꜛ ꜜ)" : "";
    throw new Error(`not Japanese YomiScript IPA: ${JSON.stringify(ch)} in ${JSON.stringify(c)}${kana}`);
  }
  i += JAFF.includes(two) ? 2 : 1;
  if (c[i] === "ʲ" || c[i] === "ʷ") return [s + c[i], i + 1];
  return [s, i];
}
function jaMoras(c, base) {
  // -> morae [{kind:'mora'|'N'|'Q'|'R', on, v, ipa, dev, vend, end, f0, rise, fall}] (as units: kind 'unit', mora kind in mk)
  const T = jaTokens(c, base),
    M = [];
  let on = "";
  const next = (i) => {
    for (let j = i + 1; j < T.length; j++) if (T[j].t === "C" || T[j].t === "V" || T[j].t === "R") return T[j];
    return null;
  };
  const add = (o) => M.push({ rise: false, fall: false, f0: null, dev: false, ...o });
  T.forEach((x, i) => {
    if (x.t === "ꜛ" || x.t === "ꜜ" || x.t === "F") {
      markLast(M, x, on, c);
      return;
    }
    if (x.t === "R") {
      add({ kind: "R", ipa: "ː", end: x.end });
      return;
    }
    if (x.t === "V") {
      add({ kind: "mora", on, v: x.s, ipa: on + x.s, dev: x.dev, vend: x.vend, end: x.end });
      on = "";
      return;
    }
    const kind = on ? null : specialMora(x.s, next(i));
    if (kind) {
      add({ kind, ipa: x.s, end: x.end });
      return;
    }
    if (on && !inStr(x.s, "jw")) throw new Error(`unexpected consonant cluster ${on}${x.s} in ${JSON.stringify(c)}`);
    on += x.s;
  });
  if (on) throw new Error(`consonant ${on} without a vowel in ${JSON.stringify(c)}`);
  return M;
}
function markLast(M, x, on, c) {
  // ꜛ / ꜜ / <f0:…> -> on the mora before it
  if (x.t === "F") {
    if (on || !M.length) throw new Error(`<f0:…> must follow a mora in ${JSON.stringify(c)}`);
    M[M.length - 1].f0 = x.v;
    return;
  }
  if (on) throw new Error(`accent mark inside a mora in ${JSON.stringify(c)}`);
  if (M.length) M[M.length - 1][x.t === "ꜛ" ? "rise" : "fall"] = true;
}
function specialMora(s, n) {
  // a consonant with no onset before it: 'N' (moraic nasal), 'Q' (glottal stop, geminate) or null (an onset)
  if (s === "ɴ") return "N";
  if (s === "ʔ") return "Q";
  if (inStr(s, JNAS) && n?.t !== "V") return "N"; // moraic nasal before a consonant or the end
  if (n?.t === "C" && !inStr(s, "jw") && !inStr(n.s, "jw")) return "Q"; // geminate
  return null;
}
function jaWordSpans(t) {
  // [start, end] of each word; ' | ' and ' ‖ ' are words of their own even without spaces around them
  const W = [];
  for (let i = 0, s = -1; i <= t.length; i++) {
    const c = t[i];
    if (i === t.length || c === " " || SEP(c)) {
      if (s >= 0) W.push([s, i]);
      s = -1;
      if (c && SEP(c)) W.push([i, i + 1]);
    } else if (s < 0) s = i;
  }
  return W;
}
function jaWordItems(w, at) {
  // one word -> morae and <p:…> in order
  const items = [];
  for (let i = 0, s = 0; i <= w.length;) {
    const p = i < w.length ? pAt(w, i) : null;
    if (i === w.length || p) {
      if (i > s) items.push(...jaMoras(w.slice(s, i), at + s));
      if (!p) break;
      items.push({ kind: "punct", sym: p[0] });
      i = s = p[1];
    } else i = w.startsWith("<f0:", i) ? w.indexOf(">", i) + 1 || w.length : i + 1;
  }
  return items;
}
function jaSeg(t, base) {
  // words (spaces), ' | ' / ' ‖ ' / ' ↘ ' / ' ↗ ' between them, <p:…> inside or as a word; morae per accent phrase
  const out = [];
  let ph = 0,
    chunk = 0,
    cur = [];
  const flush = () => {
    // one accent phrase: morae numbered k within it; spaces and <p:…> kept in place
    const M = cur.filter((x) => x.kind !== "space" && x.kind !== "punct"),
      hasRise = M.some((m) => m.rise);
    let k = 0;
    for (const x of cur)
      out.push(x.kind === "space" || x.kind === "punct" ? { ...x, ph } : { ...x, mk: x.kind, kind: "unit", lang: "ja", ph, chunk, k: k++, hasRise });
    if (M.length) chunk++;
    cur = [];
  };
  for (const [a, z] of jaWordSpans(t)) {
    const w = t.slice(a, z),
      b = boundary(w, ph, true);
    if (b) {
      flush();
      out.push(...b.filter((x) => x.kind !== "bound" || x.sym === "#"));
      ph++;
      continue;
    }
    const L = cur.length ? cur[cur.length - 1] : lastTok(out);
    if (L && L.kind !== "pause") cur.push({ kind: "space" });
    cur.push(...jaWordItems(w, base + a));
  }
  flush();
  return out;
}
const lastTok = (out) => [...out].reverse().find((x) => x.kind !== "bound");
function boundary(w, ph, sent = false) {
  // ' | ' / ' ‖ ' -> bound (+ pause); a sentence end inside the utterance ' ↘ ' / ' ↗ ' -> punct; otherwise null
  const sep = SEP(w);
  if (sep)
    return sep === "_"
      ? [
          { kind: "bound", sym: sep, ph },
          { kind: "pause", ph },
        ]
      : [{ kind: "bound", sym: sep, ph }];
  if (w === "↘" || w === "↗") return [{ kind: "punct", sym: w === "↗" ? "?" : ".", ...(sent ? { sent } : {}), ph }];
  return null;
}
function words(t, base, unit) {
  // English / French / Chinese: words separated by spaces; unit(word, offset, ph) -> tokens of one word
  const out = [];
  let ph = 0,
    pos = 0;
  for (const w of t.split(" ")) {
    const o = base + pos;
    pos += w.length + 1;
    if (!w) continue;
    const b = boundary(w, ph);
    if (b) {
      out.push(...b);
      ph++;
      continue;
    }
    const L = lastTok(out);
    if (L && L.kind !== "pause") out.push({ kind: "space", ph });
    out.push(...unit(w, o, ph));
  }
  return out;
}

// ---- English / French: IPA syllables ('.'), words (' '), stress ˈ ˌ, liaison ‿ ; boundaries ' | ' ' ‖ ' as words;
// a sentence end inside the utterance ' ↘ ' / ' ↗ '; punctuation the engine uses as a prosodic cue: <p:…>
function pAt(s, i) {
  if (!s.startsWith("<p:", i)) return null;
  const j = s.indexOf(">", i + 3);
  if (j < 0) throw new Error(`unclosed <p: in ${JSON.stringify(s)}`);
  return [s.slice(i + 3, j), j + 1];
}
function sylls(w, base) {
  // -> syllables {raw,start,end,f0} and punctuation {punct:sym} in order; '.' splits syllables outside <…>
  const R = [];
  let raw = "",
    start = base,
    f0 = null,
    end = base;
  const flush = () => {
    if (raw || f0) R.push({ raw, start, end, f0 });
    raw = "";
    f0 = null;
  };
  for (let i = 0; i <= w.length;) {
    if (i === w.length || w[i] === ".") {
      flush();
      start = base + i + 1;
      end = start;
      i++;
      continue;
    }
    const f = f0At(w, i);
    if (f) {
      f0 = f[0];
      i = f[1];
      continue;
    }
    const p = pAt(w, i);
    if (p) {
      flush();
      R.push({ punct: p[0] });
      i = p[1];
      start = end = base + i;
      continue;
    }
    if (w[i] !== "‿") raw += w[i];
    i++;
    end = base + i;
  }
  return R;
}
function euSeg(t, base) {
  return words(t, base, (w, o, ph) => {
    const S = sylls(w, o),
      N = S.filter((s) => !("punct" in s)).length;
    let j = 0;
    return S.map((s) => {
      if ("punct" in s) return { kind: "punct", sym: s.punct, ph };
      return { kind: "unit", ph, j: j++, nsyl: N, st: inStr(s.raw[0] ?? "", "ˈˌ") ? s.raw[0] : "", ...s };
    });
  });
}

// ---- Chinese (pinyin + tone digits; to be replaced with IPA + tone letters, D17)
function zhSeg(t, base) {
  return words(t, base, (w, o, ph) =>
    sylls(w, o).map((s) => {
      if ("punct" in s) return { kind: "punct", sym: s.punct, ph };
      const m = s.raw.match(/^[a-zü]+(\d)(?:>(\d))?/);
      if (!m) throw new Error(`bad pinyin syllable ${JSON.stringify(s.raw)}`);
      return { kind: "unit", ph, tone: m[2] || m[1], ...s };
    }),
  );
}
