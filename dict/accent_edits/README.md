# Accent edits: Japanese accent judged by ear

Sentences whose dictionary accent a listener heard, corrected where it sounded wrong, and kept. They are for
improving the Japanese dictionary accent (`@yomiscript/ja-accent`) and are kept as training data for other uses too:
each record pairs what the dictionary wrote with what a person, listening, preferred.

Records are made in the accent editor of the browser demo (`demo/ys_web/web/accent_edit.html`, served by
`demo/ys_web/serve.py`, which writes each saved record to `edits.jsonl`):

```
cd demo/ys_web && python serve.py 8840 web   # open http://127.0.0.1:8840/accent_edit.html
```

## Format

`edits.jsonl`: one JSON object per line. One record per listener and sentence (the same `input`): saving the sentence
again replaces the listener's earlier record in place, so each record is that listener's current judgment.

| field | meaning |
|---|---|
| `text` | the sentence (the `<t:…>` texts of the YomiScript, joined) |
| `input` | the YomiScript given to the dictionary, accent marks removed |
| `dictionary` | the YomiScript with the dictionary's accent (`method`, `dict`) |
| `edited` | the YomiScript as the listener left it: `ꜜ` after the accent nucleus, `ꜛ` after the mora where the pitch rises, ` \| ` between accent phrases; a phrase with no `ꜛ` starts high (level up to its nucleus, or to its end); `<f0:…>` after a mora where the listener set its pitch by hand (three values, semitones, as rendered) |
| `changed` | whether `edited` differs from `dictionary` (`false`: the listener heard the dictionary's accent and kept it) |
| `phrases` | the accent phrases changed: `text`, the phrase as the dictionary and as the listener wrote it, and `diff`, how far that change alone moves the rendered pitch (the dictionary's version with only this phrase edited, the largest difference of the values over the sentence, in semitones). A small `diff` is a change the listener may not have heard: near the end of a sentence the rules make different marks sound alike |
| `voice` | whether the values and marks came from the listener's own reading (the editor's voice input: their recording aligned with Kokoro's audio by DTW, the pitch of each mora taken from it, the marks estimated from that pitch); the recording itself is not kept |
| `method` | how the dictionary accent was made (`D31`: `accentMarks` of `@yomiscript/ja-accent`) |
| `render` | the options of `realize` the listener heard both versions with |
| `dict` | the dictionary version (`DICT_VERSION`) |
| `listener` | who listened |
| `source` | where the sentence comes from |
| `saved` | when (ISO 8601, UTC) |

The audio is not kept: it is Kokoro-82M (voice `jf_alpha`) from `realize(edited, render)` and can be made again. The
editor renders every phrase by the rules, none with Kokoro's own pitch (`{ devoice: false, flatOnset: true, jaScale:
ACCENT_SCALE }`), so a phrase with no mark is a judgment too: the listener heard it start high and kept it.

## What may be added

Only sentences this repository may redistribute: ones written for the project or by an LLM for it. Sentences of a
corpus under its own licence (JSUT and JVS are CC BY-SA, `eval/LICENSE_DATA.md`) stay out of this folder.
