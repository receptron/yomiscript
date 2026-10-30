// The card for one spoken result: the original text with the span being spoken highlighted, play / stop, a status
// while the models load, and the YomiScript in a collapsible detail. Written as a render function (no .vue file).
import { defineComponent, h, type PropType } from "vue";
import type { ToolResultComplete } from "gui-chat-protocol";
import { pieces } from "../core/timeline.ts";
import type { SpeakData } from "../core/types.ts";
import { styles } from "./styles.ts";
import { useSpeech, type SpeechState, type Status } from "./useSpeech.ts";

const NOTE: Record<Status, string> = { loading: "Preparing the voice…", ready: "", playing: "", blocked: "Press play to hear it.", error: "" };

function controls(s: SpeechState) {
  const note = s.status.value === "error" ? `Could not speak: ${s.error.value}` : NOTE[s.status.value];
  return h("div", { style: styles.controls }, [
    s.status.value === "playing"
      ? h("button", { style: styles.button, onClick: s.stop }, "Stop")
      : h("button", { style: styles.button, onClick: s.start, disabled: s.status.value === "loading" }, "Play"),
    note ? h("span", { style: styles.status }, note) : null,
  ]);
}

export default defineComponent({
  name: "SpeakView",
  props: {
    selectedResult: { type: Object as PropType<ToolResultComplete<SpeakData>>, required: true },
    autoplay: { type: Boolean, default: true },
  },
  setup(props) {
    const s = useSpeech(() => props.selectedResult.data?.yomiscript, props.autoplay);
    return () => {
      const data = props.selectedResult.data;
      const texts = data?.texts.length ? pieces(data.texts) : [{ span: -1, text: props.selectedResult.message }];
      return h("div", { style: styles.card, "data-status": s.status.value }, [
        h(
          "p",
          { style: styles.text, lang: data?.lang },
          texts.map((p) => h("span", { style: p.span === s.current.value ? styles.current : undefined, "data-span": p.span }, p.text)),
        ),
        controls(s),
        data ? h("details", { style: styles.details }, [h("summary", null, "YomiScript"), h("code", { style: styles.code }, data.yomiscript)]) : null,
      ]);
    };
  },
});
