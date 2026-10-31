# Audio8 TTS in Japanese: is it worth a Katarite? (2026-10-30)

**Answer: not for now.** Against Kokoro as the tools ship it (fp32 with the dictionary accent of D25), Audio8 0.1B
was not heard as more natural in a blind test (Kokoro 6, Audio8 4, no preference 8 of 18), and it misread 2 of the
18 although it was given the right reading in kana (Kokoro 0). Misreadings are what the tools exist to avoid (D24),
and its costs are high: no accent or pitch input, slower than real time on CPU, random sampling, 436 MB, and a
voice that can ship only as a clone of Kokoro's. Worth another look if the 0.6B models come out as ONNX or a release
with better Japanese appears; the scripts here rerun the comparison.

## What was tried

[Audio8 TTS](https://github.com/Edge0-AI/Audio8_TTS) is a zero-shot voice-cloning TTS: a slow AR over codec frames
(24 layers, attention and Mamba) and a fast AR over the 10 codebooks of each frame (the DualAR of Fish Audio S2), and
a 44.1 kHz codec. It reads text, not IPA, and has no pitch or duration input, so a Katarite for it would be a text
Katarite like Supertonic's (D23): the original text of each span with kana where the engine might read it wrong
(`toText` in `packages/supertonic/src/text.ts`), pitch values and accent marks dropped.

- Model: the 0.1B INT8 ONNX export (`Edge0/audio8-TTS-0.1B-ONNX-INT8`, Apache-2.0 by its model card), CPU only, the
  one small enough to ship. The 0.6B models (Preview, INT4 ONNX; Realistic, PyTorch on CUDA) were not tried.
- Texts: the Japanese sets of `eval/browser_tts` (`ja`: the 24 Kokoro parity texts, `hard`: the 70 hard sentences).
- Inputs: the raw text; Claude's and Codex's YomiScript (`eval/browser_tts/results`) as the text the Supertonic
  Katarite gives its engine, with kana for ambiguous words (rule `ambiguous`) or for every word with kanji (`kanji`).
- Voice: cloned from a 5 s reference recording and its transcript (JSUT BASIC5000_4511, not a listening text); later
  also from Kokoro's Japanese voice and the model's bundled voice.
- Sampling: temperature 0.7, top-p 0.9, top-k 50, seed 42, one take per text.
- Scoring: Whisper transcripts, kana error rate, with `eval/browser_tts/asr_score.py` (the same as the other systems);
  then listening, on `eval/browser_tts/listen.html` and the blind test here.

## Results

### Size and speed

- 436 MB for synthesis (codec decoder fp16 262 MB, slow AR int8 134 MB, fast AR int8 35 MB), plus 406 MB for the
  encoder that registers a voice. Kokoro w16 is 163 MB, fp32 325 MB; Supertonic 3 388 MB.
- Apple M2 Max, CPU, 8 threads: real-time factor 1.5-2.0 (about 255 s of audio in 450-520 s for 94 texts); Kokoro
  speaks at about 0.3 (one sentence through the CLI). The prompt, the reference voice included, is fed one position at a time (the export
  is a one-token graph) on every call.
- onnxruntime-node 1.22.0 (the version this repository pins) loads all three graphs.

### Intelligibility (Whisper kana error rate)

Rule `ambiguous`, hard set against the gold reading:

| | hard set (70) | homographs (35) |
|---|---|---|
| Audio8, raw text | 13.9% | 16.4% |
| Audio8, Codex / Claude YomiScript | 6.5% / 6.1% | 8.4% / 8.4% |
| Supertonic 3, raw text | 13.8% | 14.4% |
| Supertonic 3 Katarite, Codex / Claude | 5.6% / 7.6% | 8.2% / 9.2% |
| Kokoro, Codex / Claude | 3.9% / 3.7% | 7.0% / 6.6% |

With `ambiguous`, Audio8 is where Supertonic is: the kana halve its errors, and Kokoro given the IPA stays ahead.

**Kanji misread although the LLM's reading was right.** `ambiguous` leaves a word as kanji when it has one reading
(囲碁, 書道, 山頂, 探査機, 学習, 吾輩), so the engine reads it on its own, and Audio8 read these wrong where
Supertonic did not (書道 → くどう, 山頂 → じゅんちょう, 探査機 → さんさく). With every kanji as kana (`kanji`) all of
them came out right. Its tokenizer splits Japanese into single characters or byte pieces shared with Chinese
(書道 = 書 + 道; 碁, 頂, 輩 are two byte tokens each), so a word's Japanese reading is left to the small model, whose
0.1B release the authors describe as mainly Chinese and English.

Claude's YomiScript, scored against its own reading, on the texts every system spoke:

| Claude's YomiScript to | ja parity (23) | hard set (70) |
|---|---|---|
| Kokoro (IPA) | 6.2% | 4.2% |
| Audio8, rule `ambiguous` | 9.7% | 6.6% |
| Audio8, rule `kanji` | 4.1% | 6.3% |

Several of the remaining hard-set errors are the scoring, not the speech: Whisper writes a word in kanji or Latin
letters and pyopenjtalk reads it back another way (こんにち → 今日 → きょう, なまもの → 生物 → せいぶつ). One is
Audio8's own: h062 (じゅーがつはつか heard as 中月扱い).

Failures with every input:

- `long` (a 200+ character paragraph of 吾輩は猫である in one call): words dropped and garbled. The runtime does not
  split text; a Katarite would have to give it one sentence at a time.
- `colon_semicolon` (持ち物：お弁当；水筒；タオル。): Whisper hears only お弁当 from 4.5 s of audio.

### Voices that could ship

The JSUT recording cannot: its audio may not be redistributed, and commercial use needs permission. Rule `kanji`,
Claude's YomiScript, ja parity (23):

| voice | kana error rate |
|---|---|
| JSUT (not shippable) | 4.1% |
| cloned from Kokoro's Japanese voice (Kokoro is Apache-2.0) | 4.5% |
| the model's bundled voice (a Chinese speaker) | 7.9% |

### Blind test: Kokoro as the tools ship it vs Audio8

The 18 sentences of the accent trial (`eval/browser_tts/trials/accent_marks`), from Claude's YomiScript: the Kokoro
Katarite through `openKatarite`, as `yomiscript speak` (fp32, the D25 dictionary accent), and Audio8 (rule `kanji`,
the voice cloned from Kokoro's, so the voices are close). Both levelled to the same RMS; each was A in 9 of the 18.
The project owner, one listening:

- More natural: Kokoro 6 (h020, h025, h026, plain, ka_question, kanji_names), Audio8 4 (h012, h021, geminate,
  two_sentences), no preference 8.
- Heard as misread: Audio8 2, Kokoro 0. Audio8 was given the right reading in kana for both, so the errors are in its
  sampling, which no hint can fix, and Whisper did not catch them:
  - h026 寒気がするので早く寝る。 (given さむけがするのではやくねる。)
  - kanji_names 鈴木さんと高橋さんは、京都の清水寺を訪れた。 (given すずきさんとたかはしさんは、きょーとのきよみずでらをおとずれた。)

## Reproduce

The runtime is not on PyPI; it is the `onnx_runtime_0_1b_int8` directory of the Audio8 repository.

```bash
git clone --depth 1 https://github.com/Edge0-AI/Audio8_TTS /path/to/Audio8_TTS
RT=/path/to/Audio8_TTS/onnx_runtime_0_1b_int8
uv venv -p 3.12 .venv-audio8 && uv pip install -p .venv-audio8 -r eval/audio8/requirements.txt
huggingface-cli download Edge0/audio8-TTS-0.1B-ONNX-INT8 --local-dir ~/.cache/audio8/model
yarn build                                            # render_text.mjs uses packages/supertonic; blind.mjs the CLI
a8() { .venv-audio8/bin/python eval/audio8/audio8.py --runtime "$RT" "$@"; }

# voices: JSUT, and Kokoro's (that sentence from `yomiscript speak --out kokoro_ref.wav`); the bundled one with
#   python $RT/scripts/register_default_voice.py --model-dir ~/.cache/audio8/model --voices-dir ~/.cache/audio8/voices
a8 --register jsut BASIC5000_4511.wav "この先は下り坂なので、自転車をこぐのが楽になるよ。"
a8 --register kokoro kokoro_ref.wav "この先は下り坂なので、自転車をこぐのが楽になるよ。"

a8                                                   # raw text            -> eval/browser_tts/audio/audio8/
a8 --ys codex; a8 --ys claude                       # rule ambiguous      -> audio8_ys_<llm>_ambiguous/
a8 --ys claude kanji                                 # rule kanji          -> audio8_ys_claude_kanji/
a8 --ys claude kanji --voice kokoro                  # the Kokoro voice    -> audio8_ys_claude_kanji_kokoro/
a8 --ys claude kanji --sets ja --voice default       # the bundled voice
cd eval/browser_tts && python asr.py && python asr_score.py && node page.mjs   # serve it, open listen.html
#   listen.html?systems=claude,audio8_ys_claude_kanji shows only those rows
node eval/audio8/blind.mjs                            # the blind test: serve eval/audio8, open blind.html
```

Audio goes to `eval/browser_tts/audio/` and `eval/audio8/audio/` (not checked in); the transcripts are in
`eval/browser_tts/results/asr.json`.
