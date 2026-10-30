// The tool the LLM calls: one YomiScript utterance in, spoken in the browser while its text is shown.
import type { ToolDefinition } from "gui-chat-protocol";
import { YOMISCRIPT_INSTRUCTIONS } from "@yomiscript/core";

export const TOOL_NAME = "speak";

const PREFACE =
  "Say something aloud to the user. The text is shown while it is spoken, so use this for what you want heard: an answer, a reading, a greeting. " +
  "You write the pronunciation yourself, so names, numbers and words with several readings come out the way you mean them.";

export const TOOL_DEFINITION: ToolDefinition = {
  type: "function",
  name: TOOL_NAME,
  description: `${PREFACE}\n\n${YOMISCRIPT_INSTRUCTIONS}`,
  parameters: {
    type: "object",
    properties: {
      yomiscript: {
        type: "string",
        description: "One YomiScript utterance, e.g. ja /tsɯitatɕi<t:一日> kaɾa<t:から> jasɯmi<t:休み> desɯ<t:です。> ↘/",
      },
    },
    required: ["yomiscript"],
  },
};
