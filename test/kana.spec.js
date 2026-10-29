import { describe, expect, it } from "vitest";
import { toKana, toText } from "../katarite/supertonic/kana.js";

describe("Supertonic Katarite: YomiScript -> kana", () => {
  it.each([
    ["ja /kʲoː wa iː teŋki desɯ ne ↘/", "きょーわいーてんきですね。"],
    ["ja /ɕɯːmatsɯ wa ‖ tomodatɕi to kʲoːto e ikɯ ↘/", "しゅーまつわ、ともだちときょーとえいく。"],
    ["ja /kitte o katta ↘ hoɴja ɲi ikɯ ↗/", "きっておかった。ほんやにいく？"],
    ["ja /paːtʲiː de ɸaɴ ɡa vaioɾiɴ o çiki ↘/", "ぱーてぃーでふぁんがゔぁいおりんおひき。"],
    ["ja /kʲo<f0:2>ꜜː<f0:-2> wa ↘/", "きょーわ。"],
  ])("%s", (ys, kana) => expect(toKana(ys)).toBe(kana));
  it("refuses a section in another language", () => expect(() => toKana("ja /koɾe wa {en-US ˈæp.əl} ↘/")).toThrow(/en-US/));
});

describe("Supertonic Katarite: original text with reading hints (D23)", () => {
  const ambiguous = new Set(["上手", "一日", "市"]);
  it.each([
    ["ja /kaɾe<t:彼> wa<t:は> ɾʲoːɾi<t:料理> ɡa<t:が> dʑoːzɯ<t:上手> da<t:だ。> ↘/", "彼は料理がじょーずだ。"],
    ["ja /tsɯitatɕi<t:一日> kaɾa<t:から> mikka<t:三日> made<t:まで> ↘/", "ついたちからみっかまで"],
    ["ja /ɕijakɯɕo<t:市役所> wa<t:は> ‖<t:、> sen ɡohʲakɯ ɲiɴ<t:1500人> desɯ<t:です。> ↘/", "市役所は、せんごひゃくにんです。"],
    ["en-US /ˈhɛ.loʊ<t:Hello,> ‖ ˈwɝld<t: world.> ↘/", "Hello, world."],
  ])("%s", (ys, text) => expect(toText(ys, ambiguous)).toBe(text));
  it("without annotations, falls back to kana", () => expect(toText("ja /kʲoː wa ↘/")).toBe("きょーわ。"));
});
