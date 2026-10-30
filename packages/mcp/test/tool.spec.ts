// The MCP tool through a real MCP client over an in-memory transport, with a fake Katarite.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { Katarite, Speech } from "@yomiscript/core";
import { createServer, TOOL_DESCRIPTION, type SpeakDeps } from "../src/tool.ts";

const JA = "ja /kʲoː<t:今日> wa<t:は> ‖<t:、> ame<t:雨> desɯ<t:です。> ↘/";
const fake = (spoken: string[]): Katarite => ({
  name: "fake",
  languages: ["ja"],
  speak: async (ys) => (spoken.push(ys), { samples: new Float32Array(36000), sampleRate: 24000, texts: [], times: [] }),
});
async function connect(deps: SpeakDeps): Promise<Client> {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(deps).connect(a);
  const c = new Client({ name: "test", version: "0" });
  await c.connect(b);
  return c;
}
const wav = (s: Speech) => Buffer.from(`WAV${s.samples.length}`);
type Content = { type: string; text?: string; data?: string; mimeType?: string }[];

describe("speak tool", () => {
  it("is listed with the YomiScript instructions and one string argument", async () => {
    const c = await connect({ katarite: async () => fake([]), wav });
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name)).toEqual(["speak"]);
    expect(tools[0].description).toBe(TOOL_DESCRIPTION);
    expect(tools[0].description).toMatch(/<t:…>/);
    expect(tools[0].inputSchema).toMatchObject({ type: "object", properties: { yomiscript: { type: "string" } }, required: ["yomiscript"] });
  });
  it("speaks, plays and returns the original text and the duration", async () => {
    const spoken: string[] = [],
      played: number[] = [];
    const c = await connect({ katarite: async () => fake(spoken), wav, play: async (s) => (played.push(s.samples.length), true) });
    const r = await c.callTool({ name: "speak", arguments: { yomiscript: JA } });
    expect(r.isError).toBeFalsy();
    expect(r.content).toEqual([{ type: "text", text: 'Spoke "今日は、雨です。" (1.50 s).' }]);
    expect(spoken).toEqual([JA]);
    expect(played).toEqual([36000]);
  });
  it("returns the audio when asked to", async () => {
    const c = await connect({ katarite: async () => fake([]), wav, returnAudio: true });
    const content = (await c.callTool({ name: "speak", arguments: { yomiscript: JA } })).content as Content;
    expect(content[0].text).toBe('Synthesized "今日は、雨です。" (1.50 s).');
    expect(content[1]).toEqual({ type: "audio", mimeType: "audio/wav", data: Buffer.from("WAV36000").toString("base64") });
  });
  it("says so when it could not play", async () => {
    const c = await connect({ katarite: async () => fake([]), wav, play: async () => false });
    const content = (await c.callTool({ name: "speak", arguments: { yomiscript: JA } })).content as Content;
    expect(content[0].text).toMatch(/^Synthesized \(could not play it here\)/);
  });
  it("gives a YomiScript error back so the LLM can fix it, without speaking", async () => {
    const spoken: string[] = [];
    const c = await connect({ katarite: async () => fake(spoken), wav });
    const r = await c.callTool({ name: "speak", arguments: { yomiscript: "ja /こんにちは ↘/" } });
    expect(r.isError).toBe(true);
    expect((r.content as Content)[0].text).toMatch(/^YomiScript error: not Japanese YomiScript IPA: "こ".*call speak again\.$/);
    expect(spoken).toEqual([]);
  });
  it("reports a Katarite that fails", async () => {
    const c = await connect({
      katarite: async () => {
        throw new Error("no models");
      },
      wav,
    });
    const r = await c.callTool({ name: "speak", arguments: { yomiscript: JA } });
    expect(r.isError).toBe(true);
    expect((r.content as Content)[0].text).toBe("could not speak: no models");
  });
});

describe("speak tool, queue", () => {
  it("speaks one utterance at a time", async () => {
    const order: string[] = [];
    const slow: Katarite = {
      name: "slow",
      languages: ["ja"],
      speak: async (ys) => {
        order.push("start " + ys.slice(4, 7));
        await new Promise((r) => setTimeout(r, ys.includes("kʲoː") ? 30 : 1));
        order.push("end " + ys.slice(4, 7));
        return { samples: new Float32Array(10), sampleRate: 24000, texts: [], times: [] };
      },
    };
    const c = await connect({ katarite: async () => slow, wav });
    await Promise.all([c.callTool({ name: "speak", arguments: { yomiscript: JA } }), c.callTool({ name: "speak", arguments: { yomiscript: "ja /ame ↘/" } })]);
    expect(order).toEqual(["start kʲo", "end kʲo", "start ame", "end ame"]);
  });
});
