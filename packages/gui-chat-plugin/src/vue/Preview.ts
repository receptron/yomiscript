// The small preview of a spoken result: its text.
import { defineComponent, h, type PropType } from "vue";
import type { ToolResultComplete } from "gui-chat-protocol";
import type { SpeakData } from "../core/types.ts";
import { styles } from "./styles.ts";

export default defineComponent({
  name: "SpeakPreview",
  props: { result: { type: Object as PropType<ToolResultComplete<SpeakData>>, required: true } },
  setup(props) {
    return () => h("div", { style: styles.preview }, props.result.data?.texts.join("") || props.result.message);
  },
});
