// The Vue plugin: the core plus the view and preview components.
import type { ToolPlugin } from "gui-chat-protocol/vue";
import { pluginCore } from "../core/plugin.ts";
import type { SpeakArgs, SpeakData } from "../core/types.ts";
import View from "./View.ts";
import Preview from "./Preview.ts";

export const plugin: ToolPlugin<SpeakData, unknown, SpeakArgs> = {
  ...pluginCore,
  viewComponent: View,
  previewComponent: Preview,
};
export * from "../core/index.ts";
export { View, Preview };
export default { plugin };
