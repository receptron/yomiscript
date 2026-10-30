# @mulmovoice/gui-chat-plugin

A [GUI Chat Protocol](https://github.com/receptron/gui-chat-protocol) plugin that lets the LLM speak. The LLM calls
the `speak` tool with one YomiScript utterance it wrote itself; the plugin speaks it in the browser with the Kokoro
Katarite (fp16 weights on onnxruntime-web, D24) and shows the original text (`<t:…>`, D23), highlighting the word
being spoken.

- **Tool:** `speak({ yomiscript })`. Its description is `YOMISCRIPT_INSTRUCTIONS` from `@mulmovoice/core` with a short
  preface. `execute` checks the YomiScript with the parser. A parse error goes back to the LLM as the result message
  (no card) with instructions to fix it and call again.
- **View:** the text with the current span highlighted (requestAnimationFrame against the AudioContext clock), play /
  stop, a status while the models load, and the YomiScript in a collapsible detail. It plays when it mounts; when the
  browser does not allow audio yet, it waits for Play. **Preview:** the text.
- **Exports:** `.` and `./vue` export the Vue plugin (`plugin`, `View`, `Preview`) and the core. `./core` exports the
  framework-agnostic parts: `TOOL_DEFINITION`, `executeSpeak`, `pluginCore`, `SAMPLES`, `configureSpeaker`,
  `synthesize`, `play`, `spanAt`.
- **Vue only for now; React comes later.** The components are render functions in `.ts` files, not `.vue` files.

## Setup in a host

```ts
import { plugin, configureSpeaker } from "@mulmovoice/gui-chat-plugin";

configureSpeaker({
  modelBase: "https://example.com/kokoro/", // models/{enc,f0n,dec}_w16.onnx and voices/<voice>.bin
  ortWasmBase: "https://example.com/ort/", // onnxruntime-web's dist/ (its .wasm and .mjs files)
  // executionProviders: ["webgpu", "wasm"],
});
```

The models are downloaded on first use: about 163 MB, plus 0.5 MB per voice. The browser caches them.
`onnxruntime-web` is pinned to 1.22.0 through `@mulmovoice/katarite-kokoro`.

## Demo

```bash
cd packages/gui-chat-plugin && npx vite        # http://localhost:5173
```

The dev server serves the Kokoro models and voices from `demo/ys_web/web/`, and onnxruntime's files from
`node_modules/onnxruntime-web/dist/`, where they already are (`vite.config.ts`); nothing is copied. The sample calls
are YomiScript written by Codex for `eval/browser_tts` (Japanese homographs, a date, English). A text box takes any
YomiScript, so the error path can be tried too.

## Checks

- `npx vitest run packages/gui-chat-plugin` (from the repository root): the tool definition, the samples parse,
  execute's validation, and the timeline.
- `npx tsc -p packages/gui-chat-plugin/tsconfig.json`, and `npx eslint packages/gui-chat-plugin`.
