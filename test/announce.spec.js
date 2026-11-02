// The station announcement demo (demo/ys_web/web/announce.js): numbers read by rule, the time parsed, every phrase
// marked, and the YomiScript valid.
import { describe, expect, it } from "vitest";
import { parse, realize } from "@yomiscript/core";
import { announce, hour, kanji, minute, nasal, number, parseTime } from "../demo/ys_web/web/announce.js";

describe("the numbers", () => {
  it("reads a number before 号 and 番線 without sound changes, and writes it in kanji", () => {
    expect(number(8)).toBe("hatɕi");
    expect(number(15)).toBe("dʑɯːɡo");
    expect(number(247)).toBe("ɲiçakɯjoɴdʑɯːnana");
    expect(number(631)).toBe("ɾoppʲakɯsaɴdʑɯːitɕi");
    expect([kanji(15), kanji(100), kanji(247)]).toEqual(["十五", "百", "二百四十七"]);
  });
  it("reads the hours and minutes with their sound changes", () => {
    expect([4, 7, 9, 17, 23].map(hour)).toEqual(["jodʑi", "ɕitɕidʑi", "kɯdʑi", "dʑɯːɕitɕidʑi", "ɲidʑɯːsaɴdʑi"]);
    expect([1, 6, 10, 35, 40, 0].map(minute)).toEqual(["ippɯɴ", "ɾoppɯɴ", "dʑɯppɯɴ", "saɴdʑɯːɡoɸɯɴ", "joɴdʑɯppɯɴ", "tɕoːdo"]);
  });
  it("parses the times people type", () => {
    expect(["8:35", "8時35分", "835", "9", "１７：１０"].map(parseTime)).toEqual([
      [8, 35],
      [8, 35],
      [8, 35],
      [9, 0],
      [17, 10],
    ]);
    expect(["24:00", "8:60", "abc"].map(parseTime)).toEqual([null, null, null]);
  });
});

describe("nasal", () => {
  it("writes the moraic nasal as it is said before the next sound", () => {
    expect(["ɕiɴkaɴseɴ", "saɴbʲakɯ", "joɴpɯɴ", "ɕiɴoːsaka", "saɴdʑɯː"].map(nasal)).toEqual(["ɕiŋkanseɴ", "sambʲakɯ", "jompɯɴ", "ɕiɴoːsaka", "sandʑɯː"]);
  });
});

describe("announce", () => {
  it("says a number in groups: the hundreds flat, the tens accented, the rest with the counter", () => {
    const { ys } = announce({ train: "のぞみ", no: 247, place: "博多", track: 21, time: [23, 40] });
    expect(ys).toContain("ɲiꜛçakɯ<t:二百> | joꜜndʑɯː<t:四十> | naꜛnaꜜ<t:七> ɡoː<t:号>");
    expect(ys).toContain("ɲiꜜdʑɯː<t:二十> | iꜛtɕi<t:一> banseɴ<t:番線> kaɾa<t:から>");
    expect(ys).toContain("joꜛndʑɯꜜppɯɴ<t:四十分> ɲi<t:に>");
  });
  it("writes a valid YomiScript with every accent phrase marked", () => {
    const { text, ys } = announce({ train: "こだま", no: 8, place: "新大阪", track: 15, time: [8, 35] });
    expect(text).toBe("新幹線こだま8号新大阪行きは、15番線から8:35に出発します。");
    expect(ys).toContain("haꜛtɕiꜜ<t:八> ɡoː<t:号>");
    expect(ys).toContain("ɕiꜛŋkaꜜnseɴ<t:新幹線>");
    expect(ys).toContain("haꜛtɕiꜜdʑi<t:八時> | saꜜndʑɯː<t:三十> | ɡoꜜɸɯɴ<t:五分> ɲi<t:に>");
    const chunks = Map.groupBy(
      parse(ys).sections[0].toks.filter((t) => t.kind === "unit"),
      (t) => t.chunk,
    );
    for (const M of chunks.values()) expect(M.some((m) => m.rise || m.fall)).toBe(true);
    expect(() => realize(ys)).not.toThrow();
  });
});
