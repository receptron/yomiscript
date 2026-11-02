// The morae of JSUT's hand-annotated accent and of a marked YomiScript, as Tokyo H / L and accent phrases (score.mjs).
import { isJa, parse } from "@yomiscript/core";

const SMALL = "ァィゥェォャュョヮ";

/** the gold's morae: { kana, hl, phrase } from jsut-label's symbols ([ rise, ] fall, # and _ phrase boundaries) */
export function goldMorae(sym) {
  const out = [];
  let phrase = 0,
    level = "L",
    start = 0;
  const close = () => {
    // a fall before any rise: the morae before it are high (the first mora of an accent on it)
    const P = out.slice(start);
    const fall = P.findIndex((m) => m.after === "]"),
      rise = P.findIndex((m) => m.after === "[");
    if (fall >= 0 && (rise < 0 || fall < rise)) for (let i = 0; i <= fall; i++) P[i].hl = "H";
  };
  for (const c of sym.replace(/^\^|[$?]$/g, "")) {
    if (c === "#" || c === "_") {
      close();
      phrase++;
      level = "L";
      start = out.length;
    } else if (c === "[" || c === "]") {
      out[out.length - 1].after = c;
      level = c === "[" ? "H" : "L";
    } else if (SMALL.includes(c) && out.length) out[out.length - 1].kana += c;
    else out.push({ kana: c, hl: level, phrase, after: null });
  }
  close();
  return out;
}
/** our morae from a marked YomiScript: { hl, phrase, marked, span } (hl null in a phrase with no marks; span: its <t:…>) */
export function ourMorae(ys) {
  const U = [];
  parse(ys).sections.forEach((sec, si) => {
    if (!isJa(sec.lang)) return;
    for (const t of sec.toks) if (t.kind === "unit") U.push({ phrase: `${si}/${t.ph}`, span: t.span, rise: !!t.rise, fall: !!t.fall });
  });
  const groups = Map.groupBy(U, (m) => m.phrase);
  for (const P of groups.values()) {
    const marked = P.some((m) => m.rise || m.fall),
      fall = P.findIndex((m) => m.fall),
      rise = P.findIndex((m) => m.rise);
    let level = "L";
    P.forEach((m, i) => {
      m.marked = marked;
      m.hl = marked ? level : null;
      if (m.rise) level = "H";
      if (m.fall) level = "L";
      if (marked && fall >= 0 && (rise < 0 || fall < rise) && i <= fall) m.hl = "H";
    });
  }
  return U;
}
