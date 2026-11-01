# The dictionary accent from the YomiScript's own words and readings (D31, 2026-11-01)

Until D31, `@yomiscript/ja-accent` (D25, D27) gave OpenJTalk the text of a YomiScript (its `<t:…>` joined), let it
choose words and readings again, and kept the dictionary's accent only for the accent phrases it read the way the
YomiScript does. The YomiScript already has both: the LLM split the text into words and read each one from the
context. D31 uses OpenJTalk's dictionary and rules as tables for those words and readings instead
(`packages/ja-accent/src/lookup.ts`, the WebAssembly's `candidates`, `conn` and `label`; the method is in the
package README). This directory measures it against the earlier way (`accentMarks(…, { analysis: true })`).

```bash
node compare.mjs     # -> results/compare.json and a summary (the dictionary of ~/.cache/yomiscript/ja-dict)
```

It was first built as a prototype here (its own Rust crate); the package now reproduces the prototype's
`results/compare.json` exactly, and the package's `analyze`, rebuilt on the same tokenizer, gives the same NJD and
labels as before on 3,120 texts (the LLM runs of eval/browser_tts, the test fixtures, the hard-set words and the
JVS sentences of eval/koriyama_g2p).

## Result: Claude's 465 YomiScripts of eval/prosody_ref/mismatch.mjs

The texts of `eval/browser_tts` (hard set and ja set), 5 runs each, read by Claude
(`eval/browser_tts/trials/accent_marks/runs/claude/none.*`).

| | accent phrases | marked | read another way | not on word boundaries |
|---|---|---|---|---|
| OpenJTalk's analysis of the text (D25, D27) | 2230 | 2057 (92.2%) | 119 (5.3%) | 54 (2.4%) |
| the YomiScript's words and readings (D31) | 2224 | 2162 (97.2%) | 25 (1.1%) | 37 (1.7%) |

By Japanese word (3772): the same marks on 3345, marked now and not before on 245, marked before and not now on 5,
marked by both but differently on 17, marked by neither on 160. 362 of the 465 YomiScripts come out identical.

- **Gained**: the words the LLM reads from the context, which the analysis read the other way: 市 いち (iꜜtɕi),
  今日 こんにち (koꜜɲɲitɕi), 上手 かみて, 大家 たいか, 生物 なまもの, 一行 いちぎょう, 辛い からい, 目下 めした,
  角 かど and つの, 寒気 かんき, 色紙 しきし, and the particles of their phrases.
- **Lost**: IoT (5), now unmarked: the analysis read the letters as one unknown word joined to 機器, the path reads
  them as three letter entries.
- **Different marks** (17): 上手 うわて after 一枚 (joined into one phrase), 機器 after IoT, 2人 (the analysis
  goes through OpenJTalk's digit rules, ふたりꜜ; the path takes an entry, flat), SIP.
- **Still unmarked** (25 read another way): 捕えて つかまえて (5; NAIST-JDIC has only とらえて), SIP, 吾輩
  (the LLM's reading), and 37 phrases not on word boundaries (other languages, numbers).
- **Read by OpenJTalk's analysis** (159 words): mostly numbers with a counter (9時, 20日, 2026年, 3匹, 850円), whose
  readings OpenJTalk's digit rules make after the dictionary; then クァルテット, 捕えて, SIP, 吾輩. One sentence had no
  path at all and was analysed as before.

## Listening (`listen/`)

The 22 texts whose marks change, each as the two marked YomiScripts rendered by Kokoro the way the tools render
them; of a text's runs the most frequent pair, of a text with several sentences only the sentences that differ. The
page plays them as X and Y in an order fixed per item (the key stays in `set.json`, not served), shows the text with
the changed words highlighted, and asks which is more natural (or the same, or both unnatural). About 10 minutes.

```bash
node listen/build.mjs                 # -> listen/audio/ (gitignored) and listen/set.json
node listen/serve.mjs                 # http://127.0.0.1:8829/ (builds first when the audio is missing)
node listen/score.mjs listening.<name>.json [...]   # -> results/listen.json and a summary
```

### Result (2026-11-01, one listener, a native speaker of the project; `results/listen.json`)

| D31 more natural | D25 / D27 more natural | the same | both unnatural |
|---|---|---|---|
| 7 | 0 | 12 | 3 |

- **D31 preferred** (7): 今日 こんにち, 上手 かみて, 生物 なまもの, 目下 めした, 角 かど, 降り(そう), 明日 あす.
  Of the 7 that were not ties, all 7 went to D31 (two-sided sign test p = 0.016; one listener).
- **The same** (12): among them 市 いち, 大家 たいか, 一行, 辛い, 角 つの, 寒気 かんき, and all the changes
  that lost or moved marks (上手 うわて after 一枚, 2人, SIP, iPhone / MacBook, the 吾輩 passage). So the
  losses were not heard as worse.
- **Both unnatural** (3): 色紙にサインをもらった, IoT機器が増えている, 営業時間は9時〜17時です. The listener says the
  unnatural part was not the numbers or the English, and that these three need no follow-up.
- 明日は学校に行きますか: the listener heard the difference on 学校, whose marks are the same in both. The rules
  render the pitch from the marks of the whole sentence (D28), so a phrase marked before it changes how the next
  ones sound.
