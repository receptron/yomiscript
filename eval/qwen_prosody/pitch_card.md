---
license: cc-by-sa-4.0
language: [ja]
tags: [text-to-speech, pitch-accent, yomiscript]
---

# yomiscript-ja-pitch

The pitch model of `@yomiscript/ja-accent` (`pitchYomite`, decision D33 of
[YomiScript](https://github.com/receptron/yomiscript)): a two-layer bidirectional LSTM (1.78 million parameters) that
reads the morae of a Japanese sentence with a dictionary's accent nuclei, and predicts three pitch values per mora.
It runs in plain TypeScript, in Node and in the browser.

`qwen-1/` holds `pitch.json.gz` (vocabularies, tensor shapes, the linear pitch model it adds to) and `pitch.bin.gz` (the
weights, little-endian float32).

Trained on the pitch of Qwen3-TTS (1.7B Base, a cloned voice) reading 1,287 even-numbered JSUT BASIC5000 sentences and
2,393 Japanese Wikipedia sentences. Its vocabulary holds words from those texts, so it is under CC BY-SA 4.0, as they
and [receptron/yomiscript-ja-qwen-speech](https://huggingface.co/datasets/receptron/yomiscript-ja-qwen-speech) are.

Distance to Qwen's pitch on 1,214 sentences it did not see (semitones, each sentence centred): the dictionary's nuclei
1.871, this model 1.592, nuclei read from Qwen's own pitch of each sentence 1.494. Rebuilt by `eval/qwen_prosody/pitch.py`.
