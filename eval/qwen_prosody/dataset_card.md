---
license: cc-by-sa-4.0
language:
  - ja
task_categories:
  - text-to-speech
  - automatic-speech-recognition
pretty_name: JSUT sentences read by Qwen3-TTS in a Kokoro voice
size_categories:
  - 1K<n<10K
---

# JSUT sentences read by Qwen3-TTS in a Kokoro voice

Japanese single-speaker speech: the JSUT BASIC5000 sentences whose reading we have, read by Qwen3-TTS 1.7B Base in
a voice cloned from Kokoro-82M's `jf_alpha`. Every clip comes with its YomiScript (the pronunciation, mora by mora),
a reading check against JSUT's hand-checked kana, and, for the clips read right, its prosody: pitch at three points
of every mora, the time of every mora, and the pauses.

Made by the [yomiscript](https://github.com/receptron/yomiscript) project (`eval/qwen_prosody`), where it is used to
learn the Japanese pitch of the Kokoro Katarite.

## Contents

`metadata.jsonl`, one row per clip; the audio is `audio/text/<id>.flac` (Qwen was given the sentence as it is) or
`audio/kana/<id>.flac` (the sentences Qwen misread from the text, given again with every word that has a kanji in
kana). Mono, 24 kHz.

| field | |
|---|---|
| `id` | the JSUT id (BASIC5000_0001 …) |
| `given` | `text` or `kana` |
| `spoken_text` | what Qwen was given |
| `text` | the sentence |
| `ys` | the [YomiScript](https://github.com/receptron/yomiscript/tree/main/spec/yomiscript) of the sentence, read as JSUT's gold reads it |
| `read_right` | whether Whisper heard the gold reading in the clip (large-v3-turbo, as usual or with a kana prompt; as katakana by pronunciation) |
| `whisper` | the two transcripts |
| `duration` | seconds |
| `units` | the units of the YomiScript (morae; ɴ, the geminate and ː are units of their own); clips read right only |
| `f0` | per unit: the pitch at the start, middle and end of its voiced frames, in semitones from the sentence's median (Praat); `null` where it has no voiced frame |
| `spans` | per unit: [start, end] in seconds (forced alignment, MMS_FA) |
| `pauses`, `gaps` | `{unit index: seconds}`: a pause after that unit, where the YomiScript has one (`pauses`) or not (`gaps`) |
| `align` | the alignment's mean probability |

The clips given in kana (`given: "kana"`) read right but speak a worse accent: read from the pitch, their accent
nucleus is JSUT's gold one in 45.8% of the phrases, against 70.5% for the clips given the text (without the kanji
Qwen does not know the words). Use them for the timing or the reading, not as an accent reference.

A clip with `read_right` false has a reading other than the gold's somewhere (Qwen reads text, and misreads
some kanji); its prosody is not given, and it should not be used where the reading matters.

## How it was made

- Qwen3-TTS-12Hz-1.7B-Base (MLX bf16, `mlx-community`), voice cloning from a 5 s clip of Kokoro-82M `jf_alpha`
  speaking この先は下り坂なので、自転車をこぐのが楽になるよ。 (made with the yomiscript CLI), the checkpoint's
  sampling defaults, one take per sentence, `language` japanese.
- The sentences: the JSUT BASIC5000 sentences for which an LLM-written YomiScript reads as the gold does.

## License and attribution

**CC BY-SA 4.0**, because of the text: the JSUT sentences, from
[jsut-label](https://github.com/sarulab-speech/jsut-label) (Saruwatari Lab, The University of Tokyo), whose sources
are Wikipedia (CC BY-SA 3.0), the Tanaka Corpus (CC BY 2.0) and JSUT (CC BY-SA 4.0).

The speech was synthesized by [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) (Alibaba Cloud, Apache-2.0) in a voice
cloned from [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0). No recording of a person is
included, and the voice is not a cloned human voice.
