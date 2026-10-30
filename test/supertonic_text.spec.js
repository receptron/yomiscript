import { describe, expect, it } from "vitest";
import { toText } from "@mulmovoice/katarite-supertonic";

describe("Supertonic Katarite: the reading as kana, by pronunciation", () => {
  // one span with kanji over the whole utterance: the rule "kanji" gives all of it as kana
  const kana = (ys, text) => toText(ys.replace(/ ([↘↗])\/$/, `<t:${text}> $1/`), new Set(), "kanji");
  it.each([
    ["ja /kʲoː wa iː teŋki desɯ ne ↘/", "今日はいい天気ですね。", "きょーわいーてんきですね。"],
    ["ja /ɕɯːmatsɯ wa tomodatɕi to kʲoːto e ikɯ ↘/", "週末は友達と京都へ行く", "しゅーまつわともだちときょーとえいく"],
    ["ja /kitte o katta ↘/", "切手を買った", "きっておかった"],
    ["ja /paːtʲiː de ɸaɴ ɡa vaioɾiɴ o çiki ↘/", "パーティーでファンがヴァイオリンを弾き", "ぱーてぃーでふぁんがゔぁいおりんおひき"],
    ["ja /kʲo<f0:2>ꜜː<f0:-2> wa ↘/", "今日は", "きょーわ"],
  ])("%s", (ys, text, want) => expect(kana(ys, text)).toBe(want));
});

describe("Supertonic Katarite: original text with reading hints (D23)", () => {
  const ambiguous = new Set(["上手", "一日", "市"]);
  it.each([
    ["ja /kaɾe<t:彼> wa<t:は> ɾʲoːɾi<t:料理> ɡa<t:が> dʑoːzɯ<t:上手> da<t:だ。> ↘/", "彼は料理がじょーずだ。"],
    ["ja /tsɯitatɕi<t:一日> kaɾa<t:から> mikka<t:三日> made<t:まで> ↘/", "ついたちからみっかまで"],
    ["ja /ɕijakɯɕo<t:市役所> wa<t:は> ‖<t:、> sen ɡohʲakɯ ɲiɴ<t:1500人> desɯ<t:です。> ↘/", "市役所は、せんごひゃくにんです。"],
    ["en-US /ˈhɛ.loʊ<t:Hello,> ‖ ˈwɝld<t: world.> ↘/", "Hello, world."],
  ])("%s", (ys, text) => expect(toText(ys, ambiguous)).toBe(text));
  it("needs the original text", () => expect(() => toText("ja /kʲoː wa ↘/")).toThrow(/<t:…>/));
  it("refuses a span in another language without text", () => expect(() => toText("ja /koɾe<t:これ> {en-US ˈæp.əl} ↘/")).toThrow(/another language/));
});
