// Dev demo: call the tool as an LLM would (the samples, or a YomiScript you paste) and show the result's view.
import { createApp, defineComponent, h, ref, shallowRef } from "vue";
import type { ToolResultComplete } from "gui-chat-protocol";
import { configureSpeaker, executeSpeak, plugin, SAMPLES, TOOL_DEFINITION, type SpeakData } from "../src/index.ts";

configureSpeaker({ modelBase: "/kokoro/", ortWasmBase: "/ort/", accentBase: "/ja-dict/" }); // served by vite.config.ts

const App = defineComponent({
  setup() {
    const input = ref(String(SAMPLES[0].args.yomiscript)),
      result = shallowRef<ToolResultComplete<SpeakData> | null>(null),
      n = ref(0);
    const call = async (ys: string) => {
      input.value = ys;
      const r = await executeSpeak({}, { yomiscript: ys });
      result.value = { ...r, toolName: r.toolName ?? TOOL_DEFINITION.name, uuid: `demo-${++n.value}` };
    };
    return () =>
      h("div", [
        h("h1", { style: { fontSize: "20px" } }, "speak: a gui-chat-protocol plugin"),
        h(
          "div",
          SAMPLES.map((s) => h("button", { onClick: () => call(String(s.args.yomiscript)), "data-sample": s.name }, s.name)),
        ),
        h("textarea", { value: input.value, onInput: (e: Event) => (input.value = (e.target as HTMLTextAreaElement).value) }),
        h("button", { onClick: () => call(input.value), "data-call": "custom" }, "Call speak"),
        result.value ? h("p", { class: "message", "data-message": "" }, `Tool result message: ${result.value.message}`) : null,
        result.value?.data ? h("div", { class: "card" }, [h(plugin.viewComponent!, { key: result.value.uuid, selectedResult: result.value })]) : null,
        h("details", { style: { marginTop: "16px" } }, [
          h("summary", "Tool description the LLM gets"),
          h("pre", { style: { whiteSpace: "pre-wrap", fontSize: "12px" } }, TOOL_DEFINITION.description),
        ]),
      ]);
  },
});
createApp(App).mount("#app");
