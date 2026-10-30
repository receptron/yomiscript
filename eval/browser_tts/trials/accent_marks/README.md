# Trial: the LLM writes Japanese accent marks (2026-10-29)

The first attempt changed the tools and was reverted (below); the repeated runs after it are an experiment only.
Nothing here is used by the packages. The `markedOnly` option of `realize` in `packages/core` exists for this trial.

## Why it was tried

The tools (MCP server, CLI, gui-chat-protocol plugin) tell the calling LLM to write no pitch values and no accent
marks, so Kokoro's own predictor makes the prosody. Through the MCP server, Kokoro read 「今日は一日中雨でした」 with
今日 rising from a low start (LH), where Tokyo Japanese has it high on きょ and falling (kʲoꜜː). The caller had no way
to correct it.

## What was tried

- The rule Yomite (`realize` in `packages/core`) got a mode that writes pitch values only for the Japanese accent
  phrases carrying `ꜛ` / `ꜜ` (no devoicing); unmarked phrases and other languages kept Kokoro's predicted pitch. The
  Kokoro Katarite already mixes the two: frames without a value keep the predicted F0.
- The tools ran it before speaking, and the instructions allowed the marks, with ` | ` around a marked phrase.
- ` | ` does not change what Kokoro is given (same input ids). For 今日は the rules gave the values a person would
  write by hand (きょ +2.5, then -2.8), and the synthesized pitch fell after きょ as it should.

## First attempt (Claude, claude-opus-5-5, one run per prompt, hard set 70 + ja parity set 24)

| prompt (`eval/browser_tts/prompt.md` with the accent line replaced) | texts with marks | marked phrases | readings right, hard set (written IPA vs gold) | Whisper kana error, hard set |
|---|---|---|---|---|
| no marks (`prompt.md`, the shipped wording) | - | - | 98.6% | 3.7% |
| `prompt_optional.md`: optional, "a word you are sure of" | 0 of 94 | 0 | - | - (no marks, not synthesized) |
| `prompt_every.md`: "every accent phrase whose Tokyo accent you know" | 91 of 94 | 341 of 401 (85%) | 98.6% | 3.5% |

LLM outputs: `claude_optional.*.json`; the `every` run is `runs/claude/every.*.1.json`, the unmarked one `runs/claude/none.*.1.json`.

### What the first attempt showed

- **Listening (the project owner): no better, and more misreadings.** At least one is in what the LLM wrote: in h001
  「シアトルの市では、魚が売られている。」 the marked run read 市 as し (`ɕiꜜ`) where the unmarked run read いち (`itɕi`).
  The score hid it: both runs got 98.6% of the hard set, but each missed a different item (the unmarked run missed
  h005, a notation slip). An earlier version of this note said the written readings were unchanged; that was wrong.
- **What changed in the written phonemes** (marks, ` | ` and `<t:…>` removed; marked run vs the unmarked run): 10 of 70
  hard-set texts and 8 of 24 parity texts. Real reading changes: h001 市 いち -> し, and in `long` 捕まえて つかまえて ->
  とらえて. The rest is spelling or allophones (ン as `ɴ` / `n` / `ŋ`, `hi` / `çi`, `dza` / `za`, `ɲ` / `n`). For
  scale, the optional-prompt run, which wrote no marks, differs from the unmarked run in 17 of 70 hard-set texts: one
  run per prompt cannot show whether the accent task causes misreadings or the LLM varies this much anyway.
- **The sound may add more.** Kokoro's durations, energy and encoder features were predicted for its own pitch;
  replacing only the F0 with the rules' steps (+2.5 to -2.8 semitones within a mora) gives the decoder an input unlike
  what it was trained on. A wrong accent (a wrong mark, or a rule contour that does not sound like the word) can also
  make a word heard as another one (雨 / 飴). Many marks look right (今日 kʲoꜜː, 天気 teꜜŋki, 学校 ɡakkoː, 明日 aɕitaꜜ),
  but they were not checked one by one, and which misreadings come from the sound is not yet known.
- **Whisper did not catch it.** Its kana error rate was no worse (3.5% vs 3.7%). It is not a check of prosody or of
  how natural the speech sounds; prosody changes need listening.
- **Optional marks are not used.** Told the marks are optional, the LLM wrote none in 94 texts.
- The change was reverted before it was committed. Fixing an accent Kokoro gets wrong needs a more careful approach:
  for example a single marked word without overriding its neighbours, smaller pitch movements, or Kokoro's predictor
  steered rather than replaced. Try it here first and listen before changing the tools.

## Repeated runs (2026-10-29)

Three runs of Claude (claude-opus-5-5) per prompt, hard set (70) and ja parity set (24):

- `none`: `../../prompt.md`, no marks (the shipped wording)
- `every`: `prompt_every.md`, the reading and the marks in one pass
- `addmarks`: `prompt_addmarks.md`, a second pass that only adds marks to the `none` run's YomiScript of the same rep,
  so the reading cannot change

```bash
node run.mjs <none|every|addmarks> <hard|ja> <rep> [claude|codex]   # runs/<llm>/<prompt>.<set>.<rep>.json (claude rep 1 = the first attempt)
python accent_ref.py                                 # accent_ref.json: the reference accent from pyopenjtalk
node score.mjs                                       # results.md, results.json (per run, Claude)
node stability.mjs                                   # stability.md: how much the reading changes, no audio
python dict_accent.py                                # dict_accent.json: OpenJTalk's accent phrases, readings, H / L
node dict_marks.mjs [llm] [rep]                      # runs/dict/<llm>.<set>.<rep>.json, dict_marks.md
node listen.mjs dict                                 # listening test of the dictionary marks: listen.html?test=dict
node listen.mjs                                      # the blind listening test: audio/, then open listen.html
node listen.mjs onepass                              # the same with one-pass marks (every): listen.html?test=onepass
```

The accent is measured on the F0 Kokoro is given (`score.mjs`, fp32 models): per mora, the mean pitch; then the
share of the reference's rises and falls between neighbouring morae of one accent phrase that the pitch follows by at
least 0.3 semitones. The reference is OpenJTalk's dictionary accent with its sandhi rules (`accent_ref.py`): like the
gold readings, provisional, and a listener may prefer what Kokoro does. "late ok" also accepts Kokoro's move one mora
later, as natural speech often places a fall. The rule pitch is binary H / L by construction, so it is favoured by a
binary reference; the numbers say how close each is to the dictionary accent, not how good it sounds.

Means over the three runs (`results.md` has each run):

| prompt | set | reading | marked phrases | marks match the reference (morae in marked phrases) | pitch follows the reference: Kokoro | Kokoro, late ok | rules on the marks | rules, halved |
|---|---|---|---|---|---|---|---|---|
| none | hard | 96.7% | - | - | 59.3% | 72.5% | - | - |
| every | hard | 97.6% | 85.4% | 85.6% | 59.7% | 72.6% | 76.0% | 72.3% |
| addmarks | hard | 97.1% | 93.3% | 86.8% | 59.2% | 72.6% | 79.5% | 75.8% |
| none | ja | 63.9% | - | - | 61.5% | 72.6% | - | - |
| every | ja | 58.3% | 84.8% | 91.2% | 64.4% | 74.6% | 87.7% | 84.1% |
| addmarks | ja | 63.9% | 92.6% | 89.6% | 61.5% | 72.6% | 85.0% | 81.1% |

Reading: hard = right by the gold; ja = the same reading as the original Kokoro front end (which has its own errors;
a difference is not always a misreading).

### Readings

Every hard-set item judged wrong was checked by hand:

- **The only real misreading: h001 市 read し (`ɕiꜜ`) instead of いち, in 2 of the 3 `every` runs, and in none of the
  `none` runs.** Writing the accent in the same pass as the reading seems to pull a homograph toward the reading whose
  accent comes to mind first. One item, so a sign, not a measurement.
- The other misses are notation slips, in every prompt: ASCII `u` for `ɯ` (h009 `butai`, h010 `uwate`, h039; the
  parser accepts it and Kokoro gets an English vowel), `z` for `dz` (h005), `n` for a final `ɴ` (h029), and invalid
  outputs (`r`, a Cyrillic `о`). Three of the four `u` slips are in one `every` run.
- `addmarks` kept the reading in 207 of 210 texts (one changed `r` to `ɾ`; two were invalid, as their input was).
- The ja-set column moves with notation (`ɡozaimasɯ` / `ɡodzaimasɯ`) rather than readings.

### Accent

- The marks agree with the reference on 86-91% of the morae in marked phrases, in both one pass and two.
- Kokoro's own pitch follows 59-64% of the reference's rises and falls (72-75% allowing one mora late); the rules
  on the marks follow 76-88%, halved 72-84%. By this measure the marks bring the pitch closer to the dictionary
  accent, more so on the parity texts than on the hard set.

### Listening (the project owner, 2026-10-30)

`listen.mjs` made a blind test without the first attempt's confound: 18 sentences, the same reading (`none`, rep 2)
spoken with Kokoro's pitch, the rules on the `addmarks` marks, and the rules halved, in a shuffled order per sentence
(`listen.html`, served from this directory).

- **No misreadings in any of the 54.** With the reading fixed, the rule pitch did not make a word heard as another.
  The misreadings heard in the first attempt came from what the LLM wrote (h001), not from the sound.
- **The accents sound much alike.** One letter, B, sounded slightly worse, and the difference was subtle. B was
  Kokoro's own pitch in 12 sentences and the halved rules in 6 (the shuffle never put the full rules at B, a flaw of
  the test). So it is at most a weak hint that Kokoro's own pitch is the worst of the three.
- `listen.html` now asks for the worst accent instead of the best, and goes through the six orders so that each
  variant comes at each letter equally often (6 of 18).

### Listening again: the worst accent (the project owner, 2026-10-30)

The same 18 sentences, now asking for the worst accent, each variant at each letter 6 times (`listening_worst.json`):

| worst accent | sentences |
|---|---|
| Kokoro's own pitch | 9 (h004, h011, h012, h020, h024, plain, comma, geminate, two_sentences) |
| the rules on the marks | 1 (h001) |
| the rules, halved | 0 |
| no choice (no clear worst) | 8 |
| misread | none |

Where a worst was heard, it was Kokoro's own pitch in 9 of 10; by chance (one in three) that is about 0.04%. The
letters it was heard at are spread over A, B and C, so it is not a letter bias. The halved rules were never the worst.

### Listening: one-pass marks (the project owner, 2026-10-30)

`listen.html?test=onepass`: the marks written together with the reading (`every`, rep 2), as a prompt-only change
would give; Kokoro's own pitch on the unmarked run's reading. 10 of the 18 readings differ from the unmarked run,
mostly in word spacing and allophones; one in the word (ka_question 明日: あす unmarked, あした marked). In this rep,
h001 市 is いち in both. Result in `listening_onepass_worst.json`:

| worst accent | sentences |
|---|---|
| Kokoro's own pitch | 9 (h004, h011, h012, h020, h024, plain, comma, geminate, kanji_names) |
| the rules on the marks | 0 |
| the rules, halved | 0 |
| no choice | 9 |
| ticked misread | ka_question, both marked versions |

Kokoro's own pitch was the worst wherever one was heard (9 of 9). The one tick is the sentence whose reading
differs: the listener heard あした where the unmarked version says あす. Both are readings of 明日, so it is not
necessarily a misreading; it is a reading the one-pass run changed.

## How much the marks change the reading (2026-10-30, no audio)

Five runs each without marks (`none`) and with marks in the same pass (`every`), for Claude (claude-opus-5-5) and
Codex (gpt-6.1-sol), hard set (70) and ja parity set (24). Claude's reps 1-3 are the runs above. A changed reading
shows in the written phonemes, so this needs no listening; `stability.mjs` compares them (`stability.md`).

Share of pairs of runs whose sentence reads the same (Kokoro's phonemes, without word spaces and marks, `loose`):

| LLM | set | two runs without marks | two runs with marks | one of each |
|---|---|---|---|---|
| Claude | hard | 95.9% | 95.7% | 94.5% |
| Claude | ja | 90.8% | 96.3% | 89.2% |
| Codex | hard | 99.4% | 95.4% | 96.3% |
| Codex | ja | 94.9% | 90.0% | 91.3% |

The words read differently were checked by hand in the raw outputs (`stability.md` lists them; differences in how
the words were split are not counted). Count = word × run, out of 5 runs each:

| | without marks | with marks |
|---|---|---|
| Claude: another reading | 清水寺 きょみず 1 | **市 いち -> し 4**, **捕えて つかまえて -> とらえて 4** |
| Claude: notation slips | ASCII `u` 1, Cyrillic `о` 1, `r` 2, a zero-width space 1 | ASCII `u` 5 |
| Codex: another reading or broken phonemes | 2026 にせんにゅうじゅう… 3 | **一日 ついたち -> ついちたち / ついち 3**, **行う broken 2** (one with the English letters `custom` inside), **掌 てのひら -> てのこころ 3**, 楽しんだ たにょしんだ 2, 彼女 からじょ 1, 目下 `meɕta` (the i lost) 1, 30分 さんじゅっぽん 1, 出かけます でかけむす 1, 装飾 しょうしょく 1, 2026 にせんにゅうろく 1 |
| Codex: notation slips | 清水寺 `kʲijo` 2, 導入 `ɲʲɯ` 1 | - |

- **Without marks the runs barely differ.** Codex is nearly deterministic (99.4% on the hard set); Claude varies a
  little, mostly in notation slips and valid variants (あす / あした, じゅう / ちゅう in 人間中, さんじゅっ / さんじっ).
- **Claude, with marks:** two words change reading in 4 of 5 runs each (市 -> し, 捕えて -> とらえて), never without
  marks; ASCII `u` for `ɯ` gets more frequent. Otherwise the readings hold.
- **Codex, with marks:** the phonemes break: syllables added or lost inside the word whose accent it marks
  (ついちたち, てのこころ, たにょしんだ), and once English letters inside a Japanese word. 16 word × run
  against 3 without marks. Writing the marks costs Codex more than it costs Claude.
- The cross column ("one of each") is close to the within columns for Claude, so most sentences keep their reading;
  the change is concentrated in a few words, which is what an item-level score hides.

## Prototype: accent marks from the dictionary (2026-10-30)

The LLM writes only the reading (the shipped prompt); the marks come from OpenJTalk's dictionary and sandhi rules,
written onto the LLM's YomiScript. `dict_accent.py` gives each OpenJTalk accent phrase its characters of the text, its
reading (kana, and IPA by `tools/yomiscript/kana2ipa.py`) and the H / L of its morae. `dict_marks.mjs` finds the LLM
words covering the same characters (by `<t:…>`), and marks the phrase only when the LLM read it the same way (same
morae, `loose`, also counting `z` / `dz` and an ASCII `u` as the same): `ꜛ` / `ꜜ` where the dictionary's pitch rises
/ falls, ` | ` around the phrase. Other phrases stay unmarked, so they keep Kokoro's pitch. The reading cannot change
and no LLM call is added.

Numbers: OpenJTalk writes 3 as 三, so its number words do not match the text; they take the stretch of text up to the
next word that does, and a phrase whose span overlaps a neighbour's is dropped (the year in 2026年10月20日).

Claude rep 2 (`dict_marks.md`):

| set | phrases | marked | another reading | not at the LLM's word boundaries | reading unchanged |
|---|---|---|---|---|---|
| hard | 243 | 228 (93.8%) | 15 (6.2%) | 0 | 69 of 69 |
| ja | 201 | 180 (89.6%) | 9 (4.5%) | 12 (6.0%) | 24 of 24 |

Over the five runs of each LLM, 83-94% of the phrases get marks and every text keeps its reading.

- **The reading check also catches the dictionary's errors.** Most "another reading" phrases are heteronyms where
  OpenJTalk is wrong and the LLM right: 上手 かみて, 生物 なまもの, 角 かど / つの, 色紙 しきし, 人気 ひとけ, 目下 めした,
  辛い からい (OpenJTalk: つらい), 降り ふり (おり), 捕えて つかまえて. Those keep Kokoro's pitch rather than an
  accent of the wrong word. Others are the LLM's (市 いち vs し is the LLM right; 明日 あす / あした either) and Latin
  words (MacBook).
- The accents are OpenJTalk's, not checked by ear one by one: 晴れて comes out `haꜛɾeꜜte` where Tokyo speech has
  `haꜜɾete`, for example.
- `listen.html?test=dict`: the 18 sentences with the same reading (Claude `none`, rep 2), Kokoro's own pitch, the
  rules on the dictionary marks, and the rules halved.

Listening, worst accent (the project owner, 2026-10-30, `listening_dict_worst.json`):

| worst accent | sentences |
|---|---|
| Kokoro's own pitch | 7 (h004, h012, h020, h026, h031, plain, comma) |
| the rules on the dictionary marks | 1 (h001) |
| the rules, halved | 0 |
| no choice | 10 |
| misread | none |

Kokoro's own pitch was the worst in 7 of the 8 sentences where one was heard (by chance about 0.3%), as with the
LLM's marks (9 of 10, 9 of 9). The full rules were the worst once, in h001 both times (`ɕiꜜatoɾɯ`, a fall right after
the first mora of シアトル); the halved rules were never the worst in any of the three tests.

### In the tools: @yomiscript/ja-accent (2026-10-30, D25)

The prototype became `packages/ja-accent`, used by the CLI, the MCP server and the plugin. pyopenjtalk is replaced by
jpreprocess (OpenJTalk's front end in Rust, NAIST-JDIC) built to WebAssembly; the readings are compared mora by mora
on OpenJTalk's phonemes (no kana). What was compared:

- jpreprocess (native and WebAssembly) against pyopenjtalk on the 94 texts: the same H / L per mora and the same accent
  phrases in all 94; the WebAssembly gives the same NJD and labels as the native build.
- The package against the prototype (`dict_marks.mjs`) on the 10 unmarked runs (Claude and Codex, 5 each), 934
  YomiScripts: 910 identical. The other 24 are deliberate: `z` / `dz` and an ASCII `g` count as the same spelling
  (the prototype's runs other than Claude rep 2 were made before the `z` / `dz` rule), and a character whose NFKC form
  is longer (`…`) no longer shifts the phrases after it. Claude rep 2, which the listening test used, differs only in
  the `ellipsis` sentence, not among the 18.
- Kokoro's phoneme ids are the same with and without the marks in all 934.

`dict_accent.py` and `dict_marks.mjs` are kept as the record of what was listened to.

### Conclusion

- With the reading fixed, the marks make the accent better where a difference is heard, and no word sounds misread.
  The first attempt's "no better, more misreadings" came from the LLM writing the reading and the marks in one pass
  (h001 市 -> し), mixed with the pitch.
- The marks agree with the dictionary accent on 86-91% of the morae, and the rule pitch follows its rises and falls
  far more than Kokoro's own (about 80% vs 60%).
- One pass sounds as good in the accent (Kokoro's pitch the worst in 9 of 9), and it is what a prompt-only change
  gives. Its cost is the reading: 市 -> し in 2 of 3 runs of h001, and 明日 changed from あす to あした in this rep (a valid reading, but a change).
- **The dictionary marks sound as good as the LLM's and cannot change the reading** (above). They are the way
  to bring the accent to the tools: the LLM keeps writing only the reading, the dictionary adds marks where its
  reading agrees, and the rules render them halved.
- (Before the dictionary prototype:) So the marks are worth bringing to the tools, but only in a way that does not hurt the reading: the two-pass way
  (`addmarks`: the reading written first and fixed, the marks added after), and the halved rules, which were never
  heard as the worst. How a tool gets the second pass (a second LLM call, or the caller told to add marks to its own
  finished YomiScript) is still to decide. Not changed in the tools yet.
