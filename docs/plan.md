# Plan: a TTS with few misreadings, distributed on npm

Written 2026-10-29. It records what was decided with the user and what is still open; decisions that change the
notation or who decides what still go to `decisions.md` (D24 records this plan).

## The idea

The LLM that writes a sentence also writes how it is read, as YomiScript; a Katarite turns that into sound. The TTS
itself has no front end and no LLM of its own: in an MCP server or a gui-chat-protocol plugin, the calling LLM writes
the YomiScript as the tool's argument. It is offered as a replacement for the OpenAI and Gemini speech APIs, with
fewer misreadings, above all in Japanese, where a written form often has several readings (homographs: 一日, 上手, 人気).

Evidence so far (`eval/browser_tts`, one run each, provisional gold):

- Readings on the 70-sentence hard set: Codex 100%, Claude 98.6%, pyopenjtalk (= piper-plus's front end) 78.6%,
  the original Kokoro front end 32.9%.
- Intelligibility (Whisper): LLM YomiScript with Kokoro is the best of the systems measured; Supertonic 3 is best when
  given the reading as kana only where a word is ambiguous.

## What runs where

| Where | Katarite | Model |
|---|---|---|
| Browser (gui-chat-protocol plugin) | Kokoro | w16 (fp16 weights, 163 MB), onnxruntime-web, WASM or WebGPU |
| CLI, MCP server (Node) | Kokoro | fp32 (identical to the original Kokoro, D21 / D22), onnxruntime-node |
| Either, second Katarite | Supertonic 3 | its ONNX models (385 MB), with the text of each span and kana hints (D23) |

## Everything in TypeScript, distributed on npm

The shipped packages contain no Python. Python stays only in research and evaluation that is not shipped
(Yomi-0, the ONNX export, `eval/`, the Kokoro Yomites that reproduce the original front end for the parity checks).

Packages (names to decide):

1. **core**: the YomiScript parser and types (`demo/ys_web/web/yomiscript.js` today), the Katarite interface, the
   YomiScript text of the tool description (the prompt: the subset a Katarite needs, examples).
2. **katarite-kokoro**: the plan and engine of `demo/ys_web/web/ys.js`, with a loader for onnxruntime-web (w16) and
   onnxruntime-node (fp32).
3. **katarite-supertonic**: `katarite/supertonic/kana.js` and `ambiguous.json`, plus Supertonic's inference ported
   to TypeScript (text indexing, duration predictor, the flow-matching loop, vocoder). Supertonic ships an
   onnxruntime-web example to start from. Today the comparison runs it from Python (`eval/browser_tts/audio_supertonic.py`).
4. **mcp**: an MCP server with a `speak` tool (YomiScript in; plays it or returns audio), and a CLI on the same code.
5. **gui-chat-protocol plugin**: speaks the YomiScript and shows the original text (`<t:…>`, D23) while it is spoken,
   highlighting the current word.

Models are not in the npm packages: they are downloaded on first use (Hugging Face) and cached.

## To do before release

- Katarite: split a long utterance at its inner ↘ / ↗ so that each piece fits Kokoro's 510 phonemes (today a long
  LLM utterance fails; the original front end chunks before Kokoro).
- Katarite: whether to accept phonemic `hi` / `ni` for Japanese as `çi` / `ɲi` (LLMs sometimes write them; the
  original never does, so parity is unaffected). A behaviour change, to decide explicitly.
- Move the JavaScript to TypeScript. CLAUDE.md says "no TypeScript, no build step" for the demo today; that rule
  changes with this plan.
- Check fp32 on onnxruntime-node against the parity results (`eval/kokoro_parity` was measured with onnxruntime-web 1.22.0).
- Licenses: Kokoro (Apache 2.0); Supertonic 3 weights (OpenRAIL-M, with use-based restrictions that must be passed
  on); IPAdic, from which `ambiguous.json` is built (its notice must be kept).
- How well smaller and local LLMs write YomiScript (the MCP server will be called by many kinds of LLM).

## Paper

The misreading result is worth a paper: Japanese homographs read from context by the LLM that wrote the text, with a
small TTS that runs in the browser. Still needed: independent human gold readings (several annotators, agreement), a
few hundred homograph sentences, context-aware baselines, repeated runs, LLMs of several sizes, listening tests, and
the cost (tokens, time to first audio).
