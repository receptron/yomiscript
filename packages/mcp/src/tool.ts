// The MCP server's one tool, `speak`: the calling LLM writes YomiScript (it decides every reading from the context it
// wrote the text in), a Katarite speaks it. A YomiScript error goes back as a tool error with the parser's message,
// so the LLM can fix what it wrote. Everything it needs from outside comes in through SpeakDeps.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { parse, YOMISCRIPT_INSTRUCTIONS, type Katarite, type Speech } from "@mulmovoice/core";
import { z } from "zod";

export interface SpeakDeps {
  katarite: () => Promise<Katarite>;
  /** plays the audio here; false when it could not */
  play?: (s: Speech) => Promise<boolean>;
  /** encodes the audio as WAV, for returnAudio */
  wav: (s: Speech) => Buffer;
  /** also return the audio to the client as MCP audio content (base64 WAV) */
  returnAudio?: boolean;
}

export const TOOL_DESCRIPTION = `Speak aloud to the user. Give the words as YomiScript: you write the pronunciation, so homographs, names, numbers and abbreviations are read the way you mean them. The user hears it on this machine.

${YOMISCRIPT_INSTRUCTIONS}`;

const error = (text: string): CallToolResult => ({ isError: true, content: [{ type: "text", text }] });

export async function speakTool(ys: string, deps: SpeakDeps): Promise<CallToolResult> {
  let text: string;
  try {
    text = parse(ys).texts.join("");
  } catch (e) {
    return error(`YomiScript error: ${(e as Error).message}. Fix the YomiScript and call speak again.`);
  }
  let s: Speech, played: boolean;
  try {
    const k = await deps.katarite();
    s = await k.speak(ys);
    played = deps.play ? await deps.play(s) : false;
  } catch (e) {
    return error(`could not speak: ${(e as Error).message}`);
  }
  const seconds = s.samples.length / s.sampleRate;
  const what = text ? `"${text}"` : "the YomiScript";
  let status = "Synthesized";
  if (deps.play) status = played ? "Spoke" : "Synthesized (could not play it here)";
  const content: CallToolResult["content"] = [{ type: "text", text: `${status} ${what} (${seconds.toFixed(2)} s).` }];
  if (deps.returnAudio) content.push({ type: "audio", data: deps.wav(s).toString("base64"), mimeType: "audio/wav" });
  return { content };
}

export function createServer(deps: SpeakDeps, version = "0.1.0"): McpServer {
  const server = new McpServer({ name: "mulmovoice", version });
  // one utterance at a time, so two calls do not talk over each other
  let queue: Promise<unknown> = Promise.resolve();
  server.registerTool(
    "speak",
    {
      title: "Speak (YomiScript)",
      description: TOOL_DESCRIPTION,
      inputSchema: { yomiscript: z.string().describe("one YomiScript utterance, e.g. ja /kʲoː<t:今日> wa<t:は> ame<t:雨> desɯ<t:です。> ↘/") },
    },
    async ({ yomiscript }) => {
      const r = queue.then(() => speakTool(yomiscript, deps));
      queue = r.catch(() => undefined);
      return r;
    },
  );
  return server;
}
