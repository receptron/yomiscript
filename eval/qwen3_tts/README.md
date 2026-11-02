# Qwen3-TTS in Japanese against Kokoro: a blind listening test (2026-11-02)

Question: does Qwen3-TTS, the strongest open-weight model of its family, speak Japanese more naturally than the
Kokoro Katarite as the tools ship it? Readings are left out of the question: the 12 sentences of `texts.json` have no
word whose reading depends on the context (no 明日, 十分, 昨日, 私, …), so what is compared is the way of speaking:
accent, rhythm, intonation, voice.

## Systems

| variant | model | input | voice |
|---|---|---|---|
| `kokoro` | Kokoro-82M, fp32, through `openKatarite("kokoro")` (as `yomiscript speak`: the D31 dictionary accent, D29 pitch) | the YomiScript of `texts.json` (written by Claude as the Yomite) | jf_alpha |
| `qwen_anna` | Qwen3-TTS-12Hz-1.7B-CustomVoice (MLX bf16, mlx-community) | the plain text (`<t:…>`) | ono_anna, the model's Japanese speaker |
| `qwen_clone` | Qwen3-TTS-12Hz-1.7B-Base (MLX bf16) | the plain text | cloned from a Kokoro jf_alpha clip of a sentence not in the test (この先は下り坂なので、自転車をこぐのが楽になるよ。) |

The clone is there so that one Qwen side has a voice close to Kokoro's, and a preference is less a preference of
voice. Qwen3-TTS is under Apache-2.0 (weights, tokenizer and code). Sampling: the checkpoint's defaults, seed 42 + the
sentence's index, one take each; `language` japanese. Every side is brought to the same RMS (`../blind_audio.mjs`),
and the order of the three changes from sentence to sentence (each of the 6 orders twice).

Speed and size (Apple M2 Max, MLX on the GPU, bf16; `audio/raw/timing.json`): real-time factor 0.54 (anna, 46.0 s
of audio in 24.7 s) and 0.65 (clone, 43.0 s in 28.1 s), the first sentence's warm-up included; Kokoro fp32 on the CPU
through the CLI: 0.37 (the reference clip, model loading included). Each Qwen checkpoint takes 8.5 GB in the Hugging
Face cache; Kokoro fp32 325 MB.

## Results

**Qwen3-TTS with the voice cloned from Kokoro's was heard as the most natural in 10 of the 12 sentences.** The
project owner, one listening, 2026-11-02 (`results/listening.json`):

| | more natural |
|---|---|
| `qwen_clone` | 10 (bakery, meeting, park, window, library, fridge, cooking, sunset, phone, date) |
| `kokoro` | 2 (summer, cat) |
| `qwen_anna` | 0 |
| no difference | 0 |

None was heard as misread. With three systems and one pick per sentence, 10 of 12 for any one of them is unlikely
by chance (p about 0.002, binomial against 1/3 each, times 3 for the three systems). The listener's note: ono_anna
sounded unpleasant ("気持ちが悪かった"); the clone was clearly better, the accent above all.

Limits: one listener; one take per sentence of a sampling model (another seed may sound different); 12 short
sentences with no reading in question, so the test says nothing about misreadings, which is what the Kokoro Katarite
and YomiScript exist to control (D24); the YomiScript was written by one LLM (Claude).

Qwen3-TTS reads text: as a Katarite it would be a text Katarite like Supertonic (D23), whose readings can be steered
only by writing words in kana, with no input for accent or pitch, and at 1.7B bf16 it does not fit the browser (D24).
The direction taken instead: learn the Japanese prosody from Qwen (the clone), so that the Yomite writes it as
YomiScript values and Kokoro stays the Katarite. The first step is the transplant test below.

## Transplant: Qwen's prosody in Kokoro (`transplant.mjs`, `measure.py`)

Does Kokoro sound like the clone when it is given the clone's prosody? Four sides, the same 12 sentences:

| variant | pitch | durations |
|---|---|---|
| `kokoro` | the tools' (D31 marks, D29 values) | Kokoro's |
| `kokoro_f0` | Qwen's, as YomiScript values | Kokoro's |
| `kokoro_f0dur` | Qwen's, as YomiScript values | Qwen's, given to the engine (`Engine.synthSection`'s `durations`; YomiScript has no notation for them) |
| `qwen_clone` | Qwen's own audio | |

If `kokoro_f0` is heard as good as Qwen, what was heard is pitch, which a Yomite can write; if only `kokoro_f0dur` is,
timing matters too (and YomiScript would need a way to say it); if neither, it is the rest of Kokoro.

How Qwen's prosody is measured (`measure.py`), on the units of the tools' YomiScript:

- **Units**: Qwen's audio force-aligned to them (`../prosody_ref/align.py`, MMS_FA; `letter_spans`, each unit's own
  letters). A unit runs to the next unit's first letter; before a pause, and at the end, to where its sound falls
  below -30 dB of the utterance's RMS (CTC letters end 50-80 ms before the sound does).
- **Pitch**: Praat's (`../prosody_ref/score.py`'s `features`), three values per mora at the start, middle and end of
  its voiced frames (where the Katarite puts them, D28), the median of 5 frames around each, centred on the
  sentence's median. A mora with no voiced frame (devoiced ɕi, sɯ, a geminate) gets none and keeps Kokoro's own F0:
  1-3 per sentence; 273 of 296 morae have values.
- **Durations**: Qwen's time per mora, spread over the mora's ids as Kokoro spreads them; a pause's time from Qwen's
  silence; a word space one step, taken from the mora before it; one silence where the YomiScript has no pause
  (meeting: 0.41 s after 会議は) goes to the space there, and Kokoro renders it as silence.

Checks: the durations given add up to Qwen's speech time (39.7 s against 39.5 s over the 12; Kokoro's own: 47.6 s,
so Qwen speaks about 17% faster). Kokoro's pitch against Qwen's (DTW over 50 ms windows, as `score.py`, centred):

| | rmse (semitones) | correlation |
|---|---|---|
| `kokoro` | 2.12 | 0.74 |
| `kokoro_f0` | 0.78 | 0.97 |
| `kokoro_f0dur` | 0.87 | 0.95 |

Kokoro's decoder adds noise from a random generator whose sequence is fixed per session, so the same YomiScript is
not the same audio from one call to the next (the `kokoro` side here differs from blind.mjs's by that alone: the CLI's
Katarite gives the same samples as the engine on the same call).

### First listening (2026-11-02, the project owner; `results/listening_transplant.json`)

| | more natural |
|---|---|
| `qwen_clone` | 8 (bakery, meeting, park, window, library, fridge, phone, date) |
| `kokoro_f0` | 2 (cooking, sunset) |
| `kokoro` | 1 (cat) |
| `kokoro_f0dur` | 0 |
| no answer | 1 (summer) |

- **`kokoro_f0dur` was broken, so it says nothing about timing.** Its sentence ends were cut off in all 12
  (ticked as "misread"; the listener's note: not misread, the end is cut off). Whisper missed the last one to three
  morae of every one (できました heard できる, 始まります 始まり, 眠っている 眠); `kokoro_f0` lost none. The cause:
  Kokoro predicts the last mora's vowel about 0.7 s long, the end of the utterance in it, and it was given Qwen's
  0.1-0.2 s. Fixed: the last mora keeps Kokoro's durations (Whisper then hears all 12 to the end).
- **Qwen's pitch alone does not make Kokoro sound like Qwen**: with it (`kokoro_f0`, 0.78 semitones from Qwen's
  contour) the clone was still preferred in 8 of the 11 answers. The test picked only the best of four, so it does not
  say whether `kokoro_f0` is better than `kokoro`.
- `kokoro` was ticked as misread once (summer); the listener gave no detail.

### Second listening: the fixed timing (`audio/transplant2`)

`kokoro_f0`, `kokoro_f0dur` (the last mora fixed as above) and `qwen_clone`, the same 12 sentences
(`node transplant.mjs render transplant2 kokoro_f0,kokoro_f0dur,qwen_clone`; `blind.html?test=qwen3_tts&run=transplant2`).
The project owner, 2026-11-02 (`results/listening_transplant2.json`):

| | more natural |
|---|---|
| `qwen_clone` | 7 (bakery, meeting, window, library, summer, cooking, phone) |
| `kokoro_f0` | 1 (park) |
| `kokoro_f0dur` | 0 |
| no difference | 4 (fridge, cat, sunset, date) |

`kokoro_f0dur` was ticked as misread once (library; Whisper hears it right: 読み終わっていません).

**What the transplant shows**: Kokoro given Qwen's pitch, and Qwen's durations too, was not heard as more natural
than Qwen in any sentence, and Qwen's timing added nothing that was heard (`kokoro_f0dur` was never picked). So most of
what made the clone better is not in the two things YomiScript values can carry to Kokoro (pitch per mora, and
durations), at least at this resolution: three pitch points per mora, Kokoro's own F0 on the 23 morae without a
value, Qwen's mora durations spread over the ids as Kokoro spreads them, Kokoro's energy (N) and everything else of
its decoder. In 4 of 12 no difference was heard. What is left of the chosen direction (learning Qwen's pitch into the
Yomite) is what `kokoro_f0` gains over `kokoro`, which neither test measured: the pairwise test below.

### Third listening: does Qwen's pitch improve Kokoro? (`audio/pitch_ab`)

`kokoro` (as shipped) against `kokoro_f0` (Qwen's pitch), A/B, the same 12 sentences
(`node transplant.mjs render pitch_ab kokoro,kokoro_f0`; `blind.html?test=qwen3_tts&run=pitch_ab`). A refit of the
pitch model to Qwen can at best reach `kokoro_f0`, so this is the most such a refit could gain. The project owner,
2026-11-02 (`results/listening_pitch_ab.json`):

| | more natural |
|---|---|
| `kokoro_f0` (Qwen's pitch) | 9 (bakery, meeting, window, library, summer, fridge, cooking, sunset, phone) |
| `kokoro` (as shipped) | 2 (cat, date) |
| no difference | 1 (park) |

None misread. 9 against 2 (the tie left out) is p = 0.033 one-sided, 0.065 two-sided (sign test): one listener, 12
sentences, so a clear lead rather than a settled result.

**Conclusion of the transplant**: Qwen's pitch, written as YomiScript values, makes Kokoro more natural (9 of 11),
although it does not make Kokoro sound like Qwen (the clone still won 7 of 12 against it, with 4 ties), and Qwen's
durations add nothing that was heard. Learning Qwen's pitch into the Yomite is worth doing; its ceiling is
`kokoro_f0`. The fitting code of D29's model is not in the repository (commit 0dc6259 has only the coefficients), so
the refit needs it written again.

## Run

```bash
cd eval/qwen3_tts
uv venv -p 3.12 .venv && uv pip install -p .venv -r requirements.txt
yarn build                                   # blind.mjs and qwen3_tts.py use the CLI package
node ../../packages/cli/dist/cli.js speak --out audio/ref/kokoro.wav \
  "ja /kono<t:この> saki<t:先> wa<t:は> kɯdaɾizaka<t:下り坂> na<t:な> node<t:ので> ‖<t:、> dʑiteŋɕa<t:自転車> o<t:を> koɡɯ<t:こぐ> no<t:の> ɡa<t:が> ɾakɯ<t:楽> ɲi<t:に> naɾɯ<t:なる> jo<t:よ。> ↘/"
.venv/bin/python qwen3_tts.py                # downloads both models (8.5 GB each) -> audio/raw/
node blind.mjs                               # -> audio/blind/
node transplant.mjs prepare                  # -> audio/transplant/prep.json
../prosody_ref/.venv/bin/python measure.py   # -> audio/transplant/measured.json (eval/prosody_ref's requirements)
node transplant.mjs render                   # -> audio/transplant/; blind.html?test=qwen3_tts&run=transplant
node transplant.mjs render transplant2 kokoro_f0,kokoro_f0dur,qwen_clone   # the second listening
node transplant.mjs render pitch_ab kokoro,kokoro_f0                         # the third
cd .. && python3 -m http.server 8766         # open http://localhost:8766/blind.html?test=qwen3_tts
```

`audio/` is not checked in.
