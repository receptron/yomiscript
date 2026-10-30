// The plugin's pure parts, without models: the tool definition, execute's validation, the timeline.
import { describe, expect, it } from "vitest";
import { YOMISCRIPT_INSTRUCTIONS, parse } from "@yomiscript/core";
import { TOOL_DEFINITION, TOOL_NAME } from "../src/core/definition.ts";
import { executeSpeak } from "../src/core/plugin.ts";
import { SAMPLES } from "../src/core/samples.ts";
import { spanAt } from "../src/core/timeline.ts";

describe("tool definition", () => {
  it("takes one YomiScript and tells the LLM how to write it", () => {
    expect(TOOL_DEFINITION.name).toBe(TOOL_NAME);
    expect(TOOL_DEFINITION.description).toContain(YOMISCRIPT_INSTRUCTIONS);
    expect(TOOL_DEFINITION.parameters?.required).toEqual(["yomiscript"]);
  });
  it.each(SAMPLES.map((s) => [s.name, String(s.args.yomiscript)]))("sample %s parses and carries its text", (_, ys) => {
    expect(parse(ys).texts.length).toBeGreaterThan(0);
  });
});

describe("execute", () => {
  it("hands a valid YomiScript and its text to the view", async () => {
    const r = await executeSpeak({}, { yomiscript: "ja /kʲoː<t:今日> wa<t:は> ‖<t:、> haɾe<t:晴れ> desɯ<t:です。> ↘/" });
    expect(r.data).toEqual({
      yomiscript: "ja /kʲoː<t:今日> wa<t:は> ‖<t:、> haɾe<t:晴れ> desɯ<t:です。> ↘/",
      texts: ["今日", "は", "、", "晴れ", "です。"],
      lang: "ja",
    });
    expect(r.message).toBe("Speaking: 今日は、晴れです。");
  });
  it("returns the parser's error to the LLM, with no card", async () => {
    const r = await executeSpeak({}, { yomiscript: "ja /kore wa ↘/" });
    expect(r.data).toBeUndefined();
    expect(r.message).toMatch(/not Japanese YomiScript IPA: "r"/);
    expect(r.instructions).toMatch(/call speak again/);
  });
  it("asks again when the argument is missing", async () => {
    const r = await executeSpeak({}, {} as { yomiscript: string });
    expect(r.data).toBeUndefined();
    expect(r.message).toMatch(/missing or empty/);
  });
});

describe("timeline", () => {
  const times = [
    { span: 0, start: 0.3, end: 0.8 },
    { span: 2, start: 0.8, end: 1.2 },
  ];
  it.each([
    [0.1, -1],
    [0.3, 0],
    [0.79, 0],
    [0.8, 2],
    [1.3, -1],
  ])("at %s s -> span %s", (t, span) => expect(spanAt(times, t)).toBe(span));
});
