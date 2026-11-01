# eval/ipa_value: where YomiScript's IPA pays off over kana

eval/representation found that for Japanese-only readings, kana written by an LLM is as accurate as YomiScript at a
fifth of the size. Kana cannot carry two things YomiScript can: (A) **pitch accent** and (B) **words said in another
language**. This experiment checks, end to end with the Kokoro Katarite (local; no paid TTS), whether that difference
shows up: in what the LLM writes, in what Kokoro is given, and in the audio. It is small (44 accent words, 24
code-switching sentences), and B is a capability demonstration, not a benchmark.

## A. Pitch-accent minimal sets

- **Items** (`items_accent.json`): 44 words in 21 sets of Tokyo homophones that differ only in accent (雨 / 飴,
  橋 / 箸 / 端, 柿 / 牡蠣, 酒 / 鮭, 神 / 紙 / 髪, 鼻 / 花, …), each in a sentence where the meaning fixes the word and
  the word is followed by a particle or a noun, so a fall after its last mora (odaka) can be told from none (heiban).
  `textbook` is the accent standard references (NHK's accent dictionary) give, written by hand from memory: it is used
  only to flag words where the gold may be doubtful.
- **Gold**: OpenJTalk's accent (NAIST-JDIC through jpreprocess), as `@yomiscript/ja-accent` writes it on the
  sentence's reading with its original text (`accentMarks`, D25 / D27). The reading is OpenJTalk's own
  (`base.py`: pyopenjtalk's words, each through `refs.kana_ys`, the converter of the hard set's gold); every target
  word was read as intended.
- **Score**: the target word's accent nucleus (the mora after which the pitch falls, 0 = flat), equal to the gold's.
- **Conditions** synthesized (`synth.mjs accent`), all with the fp32 Kokoro models and voice jf_alpha:
  - `kokoro`: the reading without marks, Kokoro's own pitch. This is what kana gives a synthesizer with no accent
    front end (Kokoro in the browser), and also what YomiScript without marks and without the dictionary gives.
  - `kana_dict`: kana through OpenJTalk: the same words with their katakana as the text (all a kana Yomite leaves),
    the dictionary's accent on that, rendered as the tools render it (`accentYomite`: rule values, D28 / D29, at
    `ACCENT_SCALE` 1, only on the phrases the dictionary marks). This is a kana-input TTS with a Japanese front end.
  - `dict`: the tools' own path (D25): YomiScript without marks, with `<t:…>`, the dictionary on the original text.
    Its marks are the gold, so this is the gold rendered.
  - `claude`, `codex`, `agy`: each LLM's own marks (run 1), rendered the same way (`realize`, `markedOnly`,
    `ACCENT_SCALE`). The accent strength was not tuned for these items.
- **LLMs** (`run.mjs`, no tools, through `eval/llm_yomite/llm.mjs`): the shipped instructions
  (`YOMISCRIPT_INSTRUCTIONS`) with the "no accent marks" rule replaced by the Tokyo accent rule (`ꜛ` after the
  rising mora, `ꜜ` after the nucleus, ` | ` between phrases, three textbook words that are not in the items as
  examples), and the instructions' Japanese example plus one more, marked by the dictionary. 3 runs per LLM.
  `results/prompt.accent.md` is what was sent.
- **Pitch** (`f0.py`): Praat (parselmouth) F0, the median over the voiced frames of each mora, the mora times from
  Kokoro's predicted durations. On the target word and the mora after it, each neighbouring pair whose gold H / L
  differ is an expected move (a rise or a fall); a move counts as right when the F0 goes that way.

## B. Code-switching

- **Items** (`items_mixed.json`): 16 Japanese sentences with English meant to be said in English (quoted English
  phrases, titles, names, words being practised; the sentence says so where it could be ambiguous) and 8 controls
  with loanwords or Latin-script words said the Japanese way (テーブル, iPhone, OK, Wi-Fi).
- **LLMs**, once each: YomiScript with one rule added to the shipped instructions (a word meant in another language
  goes in `{en-US …}` with English IPA; a loanword stays Japanese) and one example of it (`results/prompt.mixed_ys.md`);
  kana with eval/representation's kana prompt as it is (`results/prompt.mixed_kana.md`), turned into YomiScript by
  eval/representation's `kana.py`.
- **Synthesis**: Kokoro's own pitch (no accent step). An `en` section is spoken by the Katarite as its own section
  (voice af_heart, or blended with jf_alpha for several words, `voiceFor`) and joined.
- **Scored** (`score_mixed.mjs`): whether the English words are in an `en` section; whether Whisper large-v3-turbo
  (`asr.py`, MLX, as eval/browser_tts) transcribing the sentence as Japanese writes the English words in Latin
  letters; and, for the YomiScript conditions, the share of the English words Whisper hears when the English
  section's audio alone is transcribed as English, and so is the same stretch of the kana audio (`segments.mjs`: the
morae between the Japanese the same LLM's YomiScript has before and after its English section; found in 47 of 48).
- Whisper writes some loanwords in Latin letters whatever it hears (iPhone, OK, Wi-Fi), and it knows the quoted phrases;
  a Latin transcript is evidence that the words were recognizable, not that they sounded English.

## Run

```bash
../prosody_ref/.venv/bin/python base.py    # results/base.json (pyopenjtalk)
node run.mjs                               # results/llm/*.json, results/prompt.*.md (claude, codex, agy CLIs)
node synth.mjs accent && node synth.mjs mixed   # audio/ (yarn build first)
../prosody_ref/.venv/bin/python f0.py      # results/f0.json (parselmouth)
node segments.mjs                          # results/kana_segments.json (where the English words are in the kana audio)
../prosody_ref/.venv/bin/python asr.py     # results/asr.json (mlx_whisper)
node score.mjs                             # results/summary.md, results/accent_items.json, results/mixed_items.json
```

Needs the ja-accent dictionary in `~/.cache/yomiscript/ja-dict` (the tools download it) and the demo's models and
voices in `demo/ys_web/web` (see demo/ys_web). `synth.mjs` uses onnxruntime-node (as the CLI does) with the demo's
files; its mora timing follows eval/prosody_ref/ours.mjs, which is a script and cannot be imported.

## Results (2026-11-01, `results/summary.md`; per item in `results/accent_items.json`, `results/mixed_items.json`)

Models: claude-opus-5-5, gpt-6.1-sol (Codex), gemini-4-argon-medium (Antigravity). One prompt per task and run, all
items in one JSON answer.

**A. LLM accent marks against the gold.** The target word's nucleus equals OpenJTalk's in 98% (Claude: 43 / 43 / 43 of
44 over three runs), 96% (Codex: 41 / 43 / 43) and 98% (Antigravity: 43 / 43 / 43). The only accent miss is one word:
潮 (shio_2), where OpenJTalk gives 2 (odaka) and the textbook accent is 0; the LLMs wrote 0 in 8 of 9 answers, so
against the textbook they are right on 98-100%. Codex's other two misses are notation errors, not accent errors: ꜜ
inside a mora (`imꜜasɯ`, rejected by the parser, 2 items in one run). Claude once wrote `hi` for ひ (`çi`), a spelling
the comparison accepts, as ja-accent does. **Kana through OpenJTalk**
(the kanji gone, the dictionary on katakana) gives the gold accent on 15 of 44 words: it makes 32 of the 44 flat, so it
is right mostly where the word is flat. Note the dictionary on the original text (`dict`, the tools' path, D25) has the
gold by construction: on these words, YomiScript's `<t:…>` plus a dictionary is as good as the LLM's marks, and needs
none. What kana loses is the text (sparse kana keeps it, eval/representation).

**A. Do the marks change the pitch the expected way?** Yes, clearly, once the measure fits how the contour is drawn.
At the end of each mora (median F0 of its second half), the expected rises and falls on the word and the mora after it
go the right way in 91% (`dict`), 87-91% (the LLMs' marks) of the moves, by a median of about 2 semitones; with
Kokoro's own pitch 69%, kana through OpenJTalk 48% (it marks many words wrongly, and the wrong marks are rendered).
Kokoro's own 69% comes mostly from the phrase-initial rise it makes by default: it gets 21 of 24 moves of the odaka
words and 6 of 14 falls after an initial accent (箸, 神, 朝 rise where they should fall). The cleanest test is the
minimal pairs (two words of a set with the same morae and different accents): the difference between their pitch
shapes goes the way the accents differ at 92-95% of the compared points with marks (median 4.5-5 st), and at 42% with
Kokoro's own pitch (19% for kana through OpenJTalk), which has the same phonemes for both words. Limits: about 7 of the
44 words have a mora without a voiced second half and are not measured; initial-accent words remain the weak spot even
with marks (`dict` 10 of 14 falls). Measured over the whole mora instead, the marked conditions drop to 71-81%: the
rules' pitch model (D29, fitted to JSUT) reaches the peak of an accented first mora at its end or on the next mora's
start, so the first mora's median still rises. Nobody has listened; whether the differences are heard as the right
words is not tested.

**B. Code-switching** (a capability demonstration). With the one added rule, the LLMs put the English words of all 16
sentences in an `en-US` section (Antigravity 15: one answer rejected for an `r` in the Japanese) and none of the 8
loanword controls; Kokoro then speaks them with English phonemes (`hˈW ɑɹ jˈu`, `θˈɔt`) in an English voice blend.
Kana can only give the katakana rendering (`haɯaːjɯː`, `soːto`). Whisper (English) on the English words alone hears
96-99% of them from the YomiScript sections (all words in 14-15 of 16) and 65-75% from the same stretch of the kana
audio (all words in 8-10 of 16). Whisper is good at undoing katakana English (ナイスツミーチュー is heard as "Nice to
meet you"), so the gap is in short words and names (thought, through, Matthew, Best regards, Catcher in the Rye).
Whisper transcribing the whole sentence as Japanese is not a useful measure: it writes well-known phrases in Latin
letters even from katakana (How are you, I'll be back: 3 of 16 for kana, 7-8 for YomiScript) and transliterates names
in katakana from English audio. Not measured: whether the English sounds English to a listener, or how the voice
switch at the section boundary sounds. The YomiScript sections are synthesized on their own and the kana stretches are
cut from running speech, which favours YomiScript somewhat.

**Failures**: Codex `imꜜasɯ` (accent mark inside a mora, 2 items), Claude `waifai` (Latin `f` in Japanese IPA),
Antigravity `kikaremaɕita` (`r`): rejected by the parser, counted, not synthesized.

## What this says

Where kana and YomiScript differ, the difference is real end to end on these items. With accent marks, the LLMs place
the accent as well as the dictionary (96-98% against it; the one accent disagreement, 潮, is a word where the LLMs
agree with the textbook and the dictionary does not),
and the marks move Kokoro's pitch the right way on the minimal pairs at 92-95% against 42% without them. With an
`en` span, English words reach Kokoro as English phonemes, which kana cannot write. Both are small sets of common words
and one voice, scored by a pitch tracker and an ASR, not by listeners.

## Limits

- 44 accent words (21 sets) and 24 code-switching sentences; one voice (jf_alpha); LLM accent 3 runs, the rest once.
- The gold is one dictionary (OpenJTalk / NAIST-JDIC); the textbook column is from memory and flags only 潮.
- Pitch is measured per mora from the Katarite's own durations, not from an aligner; a few morae are unvoiced.
- The accent-mark prompt is new (the shipped instructions ask for no marks, D25, because LLM marks changed readings in
  eval/browser_tts); this set has no readings that tempt a change, so it does not test that risk.
- `audio/` (61 MB) is regenerated by `synth.mjs` and is not meant to be committed.
