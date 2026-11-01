# Representation: YomiScript against kana, SSML and sparse kana from the same LLMs

Issue #22. Question: when an LLM is the Yomite, what does YomiScript add over

- (a) **kana**: the LLM writes the whole reading in katakana for a kana-input TTS, as in Koriyama 2026;
- (b) **SSML**: SSML 1.1 with an IPA `<phoneme>` for every word;
- (c) **sparse kana** (added at a second reviewer's request): the LLM keeps the text and adds a kana reading only
  where the reading is not obvious, and the TTS's own front end reads the rest?

Measured with the same LLMs on the same texts: reading correctness (whole sentence and target words), output size
(characters, and output tokens where the CLI reports them), call time, and malformed or incomplete output.

## Design

- **Texts**: the Japanese hard set (`eval/data/hard_set.tsv`, 70 sentences: homographs, acronyms, numbers, dates),
  read by `eval/browser_tts/sets.mjs`. Its gold is provisional (see the file header).
- **LLMs**: Claude Code (`claude`), Codex (`codex`) and Antigravity (`agy`, Gemini), through
  `eval/llm_yomite/llm.mjs`, no tools. One call per format, LLM and run, the whole set in one JSON answer, as in
  eval/browser_tts; 3 runs: 4 formats x 3 LLMs x 3 runs = 36 calls. An answer without JSON is asked once more.
- **Prompts** (`results/prompt.<format>.md` is what was sent): the same structure and task wording, the same five
  example texts (`eval/browser_tts/examples.json`: three Japanese, two English), the same item list.
  - `yomiscript`: `eval/browser_tts/prompt.md` as it is, with its examples (no pitch, no accent marks, `<t:…>` for
    the original text, D23).
  - `kana` (`prompt_kana.md`): katakana by pronunciation, as the hard set's gold is written: particles は ワ, へ エ,
    を ヲ; long vowels `ー` as pronounced (先生 セーセー); `、` for a pause, `。` / `？` at sentence ends; nothing else.
    The English examples are in katakana as a Japanese speaker would say them: kana has no way to write English.
  - `ssml` (`prompt_ssml.md`): `<speak xml:lang='ja'>`, every spoken word in
    `<phoneme alphabet='ipa' ph='…'>word</phoneme>`, punctuation as plain text between the elements, no other
    elements. The IPA rules are taken from the YomiScript prompt (`formats.mjs` reads them out of it), so only the
    container differs. Attributes in single quotes, so the JSON string needs no escapes.
  - `sparse` (`prompt_sparse.md`): the input with `word[reading]` (hiragana) after the words whose reading is
    ambiguous or not obvious: homographs, numbers with counters, dates, Latin acronyms. A reading covers the run of
    kanji, digits, Latin letters and number symbols directly before `[` (furigana style: 怒[おこ]る); `|` marks where
    the word starts when it is only the end of such a run (Aozora Bunko's ruby: 来月|二十日[はつか]). Unannotated
    words are read by the engine's front end, here pyopenjtalk (OpenJTalk + NAIST-JDIC). The example words of the
    rules are not from the hard set.
  - Example outputs for kana, SSML and sparse kana were written by hand (`examples.json`); the SSML examples carry
    exactly the IPA of the YomiScript examples.
- **Scoring** (`score.mjs`): every answer becomes the phoneme string Kokoro's Katarite would be given and is
  compared with the gold the way eval/browser_tts does (`reading.mjs`: `loose` ignores word spaces, punctuation,
  long-vowel spelling and allophones).
  - YomiScript as it is. SSML: the `ph` values in order, as one Japanese YomiScript utterance. Kana: through
    `kana.py`, which uses the converter the gold itself went through (`refs.kana_ys`, `tools/yomiscript/kana2ipa.py`),
    so kana and gold meet on the same path. Sparse kana (`kana.py --sparse`): pyopenjtalk reads the
    whole text (its words and pronunciations, as eval/browser_tts reads its pyopenjtalk reference), and each annotated
    run is read as its annotation instead; the part of a word outside a run keeps pyopenjtalk's reading of that part.
    Putting the annotation into the text as katakana and letting pyopenjtalk read that was tried first and dropped:
    pyopenjtalk rewrites the inserted kana (ハツカ read ハッカ, キョーワ晴れ read …バレ), which is the front end's error,
    not the annotation's. With no annotation the reading is exactly pyopenjtalk's (checked on all 70 sentences).
  - **Sentence right**: the phonemes equal one of the gold readings after `loose`.
  - **Target words right** (69 words of `eval/tts_readings/targets.tsv`): the answer's phonemes are closer (edit
    distance) to the gold with the word read right than to the gold with the word misread; a tie counts as wrong.
    For sparse kana this is the rule the reviewer asked for: a target word is right if its annotation gives a right
    reading, or if it is unannotated and pyopenjtalk's reading of the sentence gives a right reading for it; both
    are decided on the combined reading. A target is **annotated** if an annotated run overlaps the word in the text.
  - **Malformed items**: missing, or not in the format. YomiScript: the parser rejects it. Kana: characters other
    than katakana, `ー` and the allowed punctuation. SSML: not one `<speak xml:lang>` holding only
    `<phoneme alphabet='ipa' ph>` elements, a spoken word outside an element, or a `ph` the parser rejects. Sparse
    kana: a reading that is not kana, a bracket without a run before it, or a text that does not give back the input.
    A malformed item is still scored on what can be read from it, so the two counts are separate.
  - **Size**: characters of the answer per item; "reading chars" counts only the pronunciation (YomiScript without
    `<t:…>`, the SSML `ph` values, the kana, the sparse readings). Output tokens as the CLI reports them per call,
    divided by 70: Claude and Antigravity report them, Codex does not; they include the model's reasoning.

## Run

```bash
node run.mjs                 # all formats, LLMs, runs -> results/r<run>/<format>.<llm>.json (raw answer, model, seconds, tokens)
node run.mjs sparse          # one format only; a result already there is kept
node score.mjs               # -> results/summary.md, results/items.json   (PYTHON: a python with pyopenjtalk,
                             #    default ../prosody_ref/.venv/bin/python)
```

## Results (2026-11-01; `results/summary.md`, per item in `results/items.json`)

36 calls plus one retry (Antigravity, kana, run 3: both answers were broken JSON, one with a JavaScript
`.replace("ih", "")` call inside the object, so its 70 items count as missing). Means over the 3 runs, lowest and
highest run in brackets. Tokens: Codex reports none.

| format | LLM | sentence right % | target words right % | malformed items / 70 | chars / item | reading chars / item | output tokens / item | seconds / call |
|---|---|---|---|---|---|---|---|---|
| YomiScript | Claude | 96.2 (94.3-97.1) | 99.5 (98.6-100) | 0 | 75 | 39 | 151 (136-174) | 97 (90-107) |
| YomiScript | Codex | 99.5 (98.6-100) | 99.5 (98.6-100) | 0.3 (0-1) | 74 | 39 | - | 55 (54-55) |
| YomiScript | Antigravity | 98.6 (97.1-100) | 99.0 (98.6-100) | 0 | 74 | 39 | 80 (64-90) | 53 (44-59) |
| kana | Claude | 100 | 100 | 0 | 17 | 17 | 47 | 35 |
| kana | Codex | 100 | 100 | 0 | 16 | 16 | - | 21 (20-23) |
| kana | Antigravity | 66.7 (0-100); 100 in the 2 runs with JSON | 66.7 (0-100) | 23.3 (0-70) | 16 | 16 | 24 (21-28) | 22 (20-27) |
| SSML | Claude | 98.6 | 99.0 (98.6-100) | 0.7 (0-1) | 309 | 32 | 287 | 155 (153-156) |
| SSML | Codex | 92.4 (90.0-94.3) | 95.2 (94.2-95.7) | 4 | 315 | 32 | - | 88 (86-91) |
| SSML | Antigravity | 99.5 (98.6-100) | 100 | 0 | 298 | 32 | 138 (125-151) | 80 (73-88) |
| sparse kana | Claude | 98.1 (97.1-98.6) | 99.5 (98.6-100) | 0 | 19 | 5 | 52 (48-54) | 31 (28-33) |
| sparse kana | Codex | 98.6 | 100 | 0 | 20 | 5 | - | 22 (21-24) |
| sparse kana | Antigravity | 98.6 | 100 | 0.3 (0-1) | 20 | 5 | 23 (21-24) | 20 (19-20) |
| (plain text) | pyopenjtalk alone | 78.6 | 81.2 | - | 12 | 0 | - | - |

The hard set averages 12.3 characters per sentence. Sparse kana left 1.0 to 5.7 of the 69 target words without a
reading per run (Claude 1-8, Codex 2, Antigravity 1); pyopenjtalk read all of them right. Models: claude-opus-5-5,
gpt-6.1-sol, gemini-4-argon-medium.

What the misses are (`results/summary.md`, "Sentences read wrong"):

- **Kana**: no misreading in any of the 8 answers that came back. The LLMs write Japanese kana without slips.
- **YomiScript and SSML**: almost every miss is a slip in the IPA, not a different reading: Latin `u` / `g` for
  `ɯ` / `ɡ`, a missing `ʲ` (仮病 `keboː`), a vowel length lost (NHK `enɯetɕikeː`), `n` placed across a word space
  (何本 `nambo naɾimasɯ`), `z` for `dz`, a stray space inside a word. Readings that differ from the gold: SAP read
  サップ (Claude, once), 何本 read なんぽん (Antigravity, 2 runs).
- **SSML adds its own failures**: one element per word splits a geminate across two elements (もらっ `moɾat` + た
  `ta`, なっ `nat`, 買っ `kat`), and a word that ends in `t` is not Japanese IPA, so the parser rejects it. Codex did
  this in 4 items in every run, which is most of its lower score; YomiScript lets the LLM keep もらった as one word.
  Claude once wrote `r` for `ɾ`.
- **Sparse kana**: the misses are the front end's, on words the LLMs did not annotate: pyopenjtalk reads 日本 ニッポン
  in 今日の日本経済 (the gold has only ニホン; arguably also right), in every run of every LLM. Claude once annotated
  SAP as さっぷ.

## What this says

- **Reading correctness on Japanese text is not where YomiScript wins.** The LLM decides the reading the same way in
  every format: the target words (homographs, acronyms, numbers, dates) are right in 95-100% of the cases whatever it writes (of the answers that came back), and with every format but SSML from Codex 96-100% of the sentences are. Kana was the most
  accurate container (no slips), because the LLM writes kana fluently and IPA less so; the YomiScript and SSML
  misses are mostly IPA spelling.
- **Cost**: kana and sparse kana are the cheapest (16-20 characters per item, 20-35 s per call); YomiScript is 4.6
  times the characters of kana (2.4 times without `<t:...>`) and about 2.5 times the time; SSML is 4.1 times
  YomiScript (19 times kana), the slowest (80-155 s), and the most malformed (1.6 items per call on average, against
  0.1 for YomiScript). SSML with an IPA `<phoneme>` per word buys nothing over YomiScript's IPA: the same
  pronunciation, four times the size, and a per-word element granularity that breaks Japanese words at ッ.
- **Sparse kana** is nearly as accurate as full kana at a fifth of the reading characters, but only as good as the
  front end on what it leaves unannotated (日本 ニッポン here), and it needs a full Japanese front end (a dictionary
  like OpenJTalk's) in the synthesizer, which is what Kokoro-in-the-browser does not have (eval/browser_tts).
- **What YomiScript adds is not measured by this set**, as a design note:
  - Kana only writes Japanese. English or any other language in the text (an English quote, a product name said in
    English) cannot be written: the kana prompt's English examples had to be katakana-ized (アイレッドザレター...), which is
    a Japanese speaker's rendering, not English. YomiScript writes each language in its own IPA under its BCP 47 tag,
    in one utterance (the same holds for SSML's IPA, at four times the size).
  - Kana has no place for prosody: YomiScript carries accent marks, phrase boundaries and pitch values when a Yomite
    has them (D25, eval/llm_yomite), and pauses and question intonation (`‖`, `↗`) apart from punctuation. Kana
    fixes the moras and leaves the rest to the TTS's front end.
  - Kana needs a kana-to-phoneme stage per synthesizer and language; YomiScript is phonemes already, read the same
    way by any Katarite (Kokoro, Supertonic).
  - YomiScript keeps the original text (`<t:...>`, D23: 629 of 630 items gave the input back, the other did not parse; SSML too, in
    its element text); kana loses it, so a Katarite that wants the text (Supertonic's text input, captions) cannot
    have it.
  - A practical reading: for Japanese-only text to a kana-input TTS, kana (or sparse kana with a good front end) is
    the cheaper and at least as accurate choice; YomiScript earns its size where the text mixes languages, where the
    synthesizer has no Japanese front end, or where prosody is to be carried.

## Limits

- One set (70 short sentences, provisional gold), Japanese only; the comparison of what YomiScript can express beyond
  kana (other languages, prosody) is a design note, not measured.
- The same scorer for all four formats, but the kana and sparse paths go through the converter and front end the
  gold also went through (kana2ipa, pyopenjtalk), while YomiScript and SSML are written in IPA by the LLM and judged
  strictly. IPA slips are counted as wrong readings, as Kokoro would speak them; a listener might not hear some.
- Target words are judged by edit distance between the answer and two minimal-pair readings, not by listening.
- One call per format, LLM and run for the whole set; a broken JSON loses the whole run (Antigravity kana run 3).
- Output tokens include reasoning and are not reported by Codex; the characters are the cleaner size measure.
- The kana prompt asks for katakana without word spaces, as the gold is written; the sparse prompt's syntax (`[ ]`,
  `|`) is this experiment's own.
