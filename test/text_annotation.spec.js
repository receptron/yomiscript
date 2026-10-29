// <t:…> (the original text, D23) is read alongside the pronunciation and never changes it: the same plan with and
// without the annotations, the rule Yomite keeps them in place, and the spans give back the text.
import fs from "fs";
import { describe, expect, it } from "vitest";
import { parse } from "../demo/ys_web/web/yomiscript.js";
import { plan, setData } from "../demo/ys_web/web/ys.js";
import { realize } from "../demo/ys_web/web/yomite.js";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
setData(read("../demo/ys_web/web/data.json"));
const ORIGINAL = read("./fixtures/kokoro_original.json");
const annotate = (ys) => ys.replace(/(\S)(?= |\s*[↘↗]\/$)/g, "$1<t:w>"); // a <t:…> after every word
const strip = (ys) => ys.replace(/<t:[^>]*>/g, "");
const kokoroInput = (ys) => plan(ys).map((s) => [s.ps, s.ids]);

describe("text annotations do not change the pronunciation", () => {
  it.each(ORIGINAL.map((c) => [c.name, c.ys]))("%s", (_, ys) => {
    const a = annotate(ys);
    expect(a).not.toBe(ys);
    expect(kokoroInput(a)).toEqual(kokoroInput(ys));
    expect(strip(realize(a))).toBe(realize(ys));
  });
});

describe("spans", () => {
  it("gives each unit the text it reads; a text with no units is not spoken", () => {
    const r = parse("ja /kʲoː<t:今日> wa<t:は> ‖<t:、> teŋki<t:天気> desɯ<t:です。> ↘/");
    expect(r.texts.join("")).toBe("今日は、天気です。");
    const units = r.sections[0].toks.filter((t) => t.kind === "unit");
    expect(units.map((t) => t.span)).toEqual([0, 0, 1, 3, 3, 3, 4, 4]);
  });
  it("keeps offsets in the string as written", () => {
    const ys = "en-US /ˈhɛ.loʊ<t:Hello,> ‖ ˈwɝld<t: world.> ↘/";
    const u = parse(ys).sections[0].toks.filter((t) => t.kind === "unit");
    expect(u.map((t) => ys.slice(t.start, t.end))).toEqual(["ˈhɛ", "loʊ", "ˈwɝld"]);
  });
});
