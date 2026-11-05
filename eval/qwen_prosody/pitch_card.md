---
license: cc-by-sa-4.0
language: [ja]
tags: [text-to-speech, pitch-accent, yomiscript]
---

# yomiscript-ja-pitch

The pitch model of `@yomiscript/ja-accent` (`pitchYomite`, decisions D33 and D35 of
[YomiScript](https://github.com/receptron/yomiscript)): a two-layer bidirectional LSTM (2.12 million parameters) that
reads the morae of a Japanese sentence with a dictionary's accent nuclei, and predicts three pitch values per mora.
It runs in plain TypeScript, in Node and in the browser.

`qwen-2/` holds `pitch.json.gz` (vocabularies, tensor shapes, the linear pitch model it adds to) and `pitch.bin.gz` (the
weights, little-endian float32). `qwen-1/` is the previous version (1.78 million parameters, 3,312 sentences), kept for the
package versions that load it.

Trained on the pitch of Qwen3-TTS (1.7B Base, a cloned voice) reading 1,144 even-numbered JSUT BASIC5000 sentences and
4,763 Japanese Wikipedia sentences; 368 more chose the epoch. Its vocabulary holds words from those texts, so it is under
CC BY-SA 4.0, as they are. [receptron/yomiscript-ja-qwen-speech](https://huggingface.co/datasets/receptron/yomiscript-ja-qwen-speech)
holds the speech of the sentences of `qwen-1`, not the 2,595 Wikipedia sentences added for `qwen-2`.

Distance to Qwen's pitch on 1,214 sentences it did not see (semitones, each sentence centred): the dictionary's nuclei
1.871, `qwen-1` 1.592, `qwen-2` 1.543, nuclei read from Qwen's own pitch of each sentence 1.494. Blind, 12 sentences and 2
repeats, one listener: 13 the same as `qwen-1`, 1 better, none worse. Rebuilt by `eval/qwen_prosody/more_train.py`.
