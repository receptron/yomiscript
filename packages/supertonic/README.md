# @yomiscript/supertonic

The Supertonic 3 Katarite: YomiScript in, 44.1 kHz audio out, in TypeScript with no Python (D24). It runs on
onnxruntime-node (CLI, MCP) and onnxruntime-web (browser).

[Supertonic 3](https://github.com/supertone-inc/supertonic) reads characters, not IPA. So the Katarite gives it the
original text of each span (`<t:…>`, D23), and replaces a span with its reading only where the engine might read the text
wrong (`text.ts`, `toText`). The reading comes from the YomiScript, written as kana by pronunciation: は → わ, を → お,
ー for every long vowel, っ, ん. The YomiScript must carry `<t:…>`; a text engine has nothing to read without it.

- rule `ambiguous` (default): a span becomes kana when its written form, or a 2-8 character form inside it, has more
  than one reading in `data/ambiguous.json`, or when it contains a number, a Latin letter, a symbol or a kanji numeral.
- rule `kanji`: every span with kanji, numbers or symbols becomes kana.

Pitch values and accent marks are dropped: Supertonic makes its own prosody. `speak()` returns no span times:
Supertonic predicts only the length of the whole utterance and aligns text and speech inside the model.

## Use

```ts
import { nodeSupertonic } from "@yomiscript/supertonic/node";
const k = await nodeSupertonic({ dir: `${process.env.HOME}/.cache/supertonic3` }); // voice F1, 8 steps, speed 1.05
const speech = await k.speak("ja /tsɯitatɕi<t:一日> kaɾa<t:から> mikka<t:三日> made<t:まで> jasɯmi<t:休み> desɯ<t:です。> ↘/");
```

In the browser, build a `SupertonicEngine` with onnxruntime-web and a loader that fetches the model files, then wrap it
in a `SupertonicKatarite` with the ambiguous set (`AMBIGUOUS_URL`, `ambiguousSet`).

The model directory is laid out as the Hugging Face repository `Supertone/supertonic-3` (`onnx/…`, `voice_styles/…`,
385 MB); the Python SDK caches it in `~/.cache/supertonic3`.

## The port

`preprocess.ts` and `engine.ts` follow the Python SDK, supertonic 1.3.1 (`core.py`, `pipeline.py`, `utils.py`): NFKD
normalization and symbol clean-up, `<lang>…</lang>` tags, per-code-point input ids, chunks of at most 300 characters
(120 for Korean) split by paragraph and sentence, duration / speed, the noisy latent and its mask in float32 as numpy
computes them, 8 flow-matching steps, the vocoder, and 0.3 s of silence between chunks.

Checked against the SDK with the same initial noise (3 Japanese and 2 English texts, one of them two chunks): text,
chunks and input ids identical; durations within 3e-6 s; audio of identical length, max abs difference at most 3.3e-4,
correlation 1.000000. `test/preprocess.spec.ts` holds the SDK's preprocessing and chunking results and runs without
models.

Differences from the SDK, none of which change the checked outputs: the default noise is drawn from `crypto` with
Box–Muller instead of numpy's generator (pass `noise` for reproducible output); `\s` and `\b` follow JavaScript, which
differs from Python's Unicode classes only for rare control characters and for a single capital letter right after a
non-ASCII letter.

## Data and licenses

`data/ambiguous.json` lists the 12,875 written forms with kanji that IPAdic gives more than one pronunciation
(long-vowel spellings merged), built by `tools/build-ambiguous.ts` from the IPAdic CSV files
(github.com/taku910/mecab, `mecab-ipadic/`; copyright Nara Institute of Science and Technology, see its COPYING). Only
this list is derived from it.

Supertonic's weights are under OpenRAIL-M, with use-based restrictions that must be passed on; they are not part of
this package.
