# The dictionary accent against JSUT's hand-annotated accent (2026-11-01)

A measure of the Japanese dictionary accent of `@yomiscript/ja-accent` that needs no listener: JSUT BASIC5000's
accent phrases and accent nuclei, annotated by hand ([jsut-label](https://github.com/sarulab-speech/jsut-label),
`e2e_symbol/katakana.yaml`: `[` rise, `]` fall, `#` accent phrase boundary, `_` pause), against the marks the
dictionary writes on an LLM's YomiScripts of the same sentences. It is the yardstick for improving the dictionary,
and it tried four ways of doing so.

## Data and license

- **Gold**: jsut-label (commit `1978271`), the 4,530 of the 5,000 sentences whose text and reading are the same at
  every correction level (as `eval/scripts/prepare_jsut.py`). CC BY-SA (`eval/LICENSE_DATA.md`): `prepare.py` writes
  them to `data/` (gitignored), and everything that repeats the sentences (the LLM's answers, the listening set, the
  learned word accents) stays in gitignored folders. Only aggregates are committed (`results/summary.md`,
  `results/scores.json`, and `results/rules.json`, which names parts of speech and function words only).
- **YomiScripts** (`run.mjs`): Codex in the frozen YomiScript prompt of eval/representation (as eval/koriyama_g2p),
  50 sentences per call, falling back to Claude if Codex stops answering (its usage limit). 1,650 sentences are also
  in JVS-nonpara and already had Codex's answer in that prompt (eval/koriyama_g2p); those are reused.
- **Scored**: only the sentences Codex reads as the gold does (the same kana, ヲ=オ ヂ=ジ ヅ=ズ, and the same number of
  morae), so a reading error is not counted as an accent error.

```bash
python prepare.py [jsut-label]      # -> data/items.json (eval/prosody_ref/.venv has PyYAML)
node run.mjs [--parallel 2]         # -> results/raw/ (the LLM's answers)
node rules.mjs                      # -> results/rules.json (phrase rules, from the training half)
node corrections.mjs                # -> results/corrections.json (word accents, from the training half)
node score.mjs                      # -> results/summary.md, results/scores.json
node listen.mjs [30]                # -> listen/ (a blind A/B set; ../accent_lookup/listen/serve.mjs 8831 --dir listen)
```

UniDic (`unidic.mjs`) is read from `~/.cache/unidic` when it is there (unidic-cwj 3.1.0 from
<https://clrd.ninjal.ac.jp/unidic/>, GPL / LGPL / BSD, used here under the BSD licence).

## Measures (`score.mjs`, `morae.mjs`)

Each way of marking is compared mora by mora with the gold: Tokyo H / L inside the accent phrases it marks (a
phrase it leaves unmarked keeps Kokoro's pitch and counts as not covered); the accent phrase boundaries between two
covered morae (precision, recall); and whole gold phrases: the same span as one marked phrase of ours, and of
those, the same H / L. The learned ways are learned on the even ids and the table of the odd ids tests them.

## Result

Codex answered all 4,530 sentences (it did not reach its limit); 3,762 are read as the gold reads them and scored
(646 read another way, 122 not parsed). The test half: the 1,873 sentences with odd ids, on which nothing was
learned (`results/summary.md` has both halves).

| marking | morae covered % | H/L right % | boundaries P / R (F1) | gold phrases with the same span % | gold phrases right % |
|---|---|---|---|---|---|
| D31 (as committed) | 99.1 | 86.9 | 81.3 / 95.7 (87.9) | 76.3 | 61.5 |
| D25 / D27 (OpenJTalk's analysis) | 96.5 | 87.1 | 80.9 / 95.7 (87.7) | 74.4 | 60.3 |
| D31, UniDic's accent types | 99.1 | 86.5 | 81.3 / 95.7 (87.9) | 76.3 | 60.4 |
| D31, UniDic's accent types for content words | 99.1 | 86.6 | 81.3 / 95.7 (87.9) | 76.3 | 61.0 |
| D31, 17 phrase rules learned from the training half | 99.1 | 87.5 | 89.4 / 94.0 (91.7) | 81.0 | 64.1 |
| D31, 114 word accents learned from the training half | 99.1 | 87.2 | 81.3 / 95.7 (87.9) | 76.3 | 62.0 |
| D31, the phrase rules and the word accents | 99.1 | 87.7 | 89.4 / 94.0 (91.7) | 81.0 | **64.6** |

- **Where D31 goes wrong** (all scored sentences, the gold phrases it does not get right, by the first cause that
  applies): another phrase span 5,791; the same span with other H / L 3,706; a number 170; a mora left unmarked 118;
  a word no entry reads the YomiScript's way 83. The phrasing of OpenJTalk's rules, not the dictionary's accent
  types, is the largest part, and numbers and missing words are small.
- **The phrase rules** (`results/rules.json`): for a pair of neighbouring entries keyed by their parts of speech
  (and the surface of a function word, and of する), the gold joins (or splits) them more often than OpenJTalk's
  rules agree with the gold, by 0.1 or more, over at least 20 cases. 16 join and 1 splits: a サ変 noun and する
  (し: the gold joins 220 of 258), て and いる / いた / きた / おり, a verb and こと / の / ため /
  よう, の and 中, と and し, た and こと; an adjective and a verb split. OpenJTalk's rules make each of these a phrase
  of their own (D27 tried joining a verb after て and kept OpenJTalk's way, because the commercial references
  disagreed; the hand annotation sides with joining in 228 of 243). On the test half they get 2.6 more points of the
  gold phrases right (61.5 to 64.1) and raise boundary precision from 81 to 89%; over all sentences, 1,255 phrases
  better and 552 worse (the worse: こと, よう and 中 joined to the phrase before, whose accent the joined phrase then
  gets wrong).
- **The word accents** (corrections.mjs, gitignored as it lists JSUT's words): a content word starting a gold phrase
  whose accent type the gold makes clear (seen twice or more, the same type in 80% or more) and NAIST-JDIC has
  another. They add half a point alone (249 better, 25 worse) and to the rules (64.6). They are learned from one
  speaker's labels, so they may be that speaker's accents more than Tokyo's.

### Listening (`listen.mjs`)

30 test-half sentences whose marks the rules and word accents change, as D31 and as D31 with both, in the blind A/B
page of eval/accent_lookup/listen. One listener (2026-11-01): D31 with both preferred 2, D31 preferred 4, the same 24,
both unnatural 0; no notes. The 2.6 to 3.1 points the hand annotation gives them are not heard in Kokoro, so they are
not folded into `@yomiscript/ja-accent`.

## Not kept, and why

- **UniDic's accent types** (`unidic.mjs`): worse than NAIST-JDIC's on this gold in every way tried: all words,
  words that do not conjugate (a conjugated form in UniDic carries its base form's type), content words only, with
  or without UniDic's combination rules (those were much worse: OpenJTalk's rules expect NAIST-JDIC's notation and
  conventions), and with the parts of speech matched. It wins 何も, もっとも, とうとう, いっそう and loses こと, ため,
  もう, たくさん, 君. Not checked: whether jsut-label's annotators started from OpenJTalk's output; if they did, the gold
  would favour NAIST-JDIC wherever both accents are heard.
- **Numbers by mora count** (a phrase with a digit marked when only its reading differs): no change; the readings of
  OpenJTalk's digit rules differ from the LLM's in their number of morae (1服 いちふく for いっぷく), and numbers are
  170 of the 9,868 wrong phrases.
- **tdmelodic** (accents for the words a dictionary lacks): not tried; the words no entry reads the YomiScript's way
  are 83 of the 9,868 wrong phrases on JSUT.

