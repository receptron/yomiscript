// The plugin logic without UI: validate the LLM's YomiScript with the parser and hand it to the view. A parse error
// goes back to the LLM as the result, so it can correct the YomiScript and call again.
import type { ToolContext, ToolPluginCore, ToolResult } from "gui-chat-protocol";
import { parse } from "@yomiscript/core";
import { TOOL_DEFINITION } from "./definition.ts";
import { SAMPLES } from "./samples.ts";
import type { SpeakArgs, SpeakData } from "./types.ts";

export async function executeSpeak(_context: ToolContext, args: SpeakArgs): Promise<ToolResult<SpeakData>> {
  const ys = typeof args?.yomiscript === "string" ? args.yomiscript.trim() : "";
  if (!ys)
    return {
      toolName: TOOL_DEFINITION.name,
      message: "speak: the yomiscript argument is missing or empty.",
      instructions: "Call speak again with one YomiScript utterance in the yomiscript argument.",
    };
  try {
    const u = parse(ys);
    const data: SpeakData = { yomiscript: u.ys, texts: u.texts, lang: u.top };
    const text = u.texts.join("");
    return {
      toolName: TOOL_DEFINITION.name,
      message: text ? `Speaking: ${text}` : "Speaking.",
      title: text || undefined,
      data,
    };
  } catch (e) {
    return {
      toolName: TOOL_DEFINITION.name,
      message: `speak: the YomiScript could not be read: ${e instanceof Error ? e.message : String(e)}`,
      instructions: "Fix the YomiScript as the error says and call speak again. Do not tell the user about the error.",
    };
  }
}

export const pluginCore: ToolPluginCore<SpeakData, unknown, SpeakArgs> = {
  toolDefinition: TOOL_DEFINITION,
  execute: executeSpeak,
  generatingMessage: "Speaking...",
  isEnabled: () => true,
  samples: SAMPLES,
};
