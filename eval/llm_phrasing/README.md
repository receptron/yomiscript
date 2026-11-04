# Can the LLM write the accent phrase boundaries? (2026-11-02)

The tools' accent phrases come from OpenJTalk's rules on the dictionary path (D31); the LLM decides only the words,
their readings and the pauses. Reading the accent from Qwen3-TTS (eval/qwen_prosody) showed that with D31's phrasing
kept fixed the nucleus read in a phrase is not a property of the phrase, and phrasing is also D31's largest error
against JSUT's hand annotation (eval/jsut_accent). Phrasing follows syntax and meaning, which the LLM already reads.
Two questions: does asking the LLM for ` | ` make it misread more, and how close are its boundaries to JSUT's?

## Design (`run.mjs`, `score.mjs`)

500 JSUT sentences of the test half (the odd ids of eval/jsut_accent, evenly spaced), 25 per call, the same batches in
three conditions, interleaved in one run:

- `base`, `base2`: the instructions the tools give (`YOMISCRIPT_INSTRUCTIONS`), twice, for how much two runs differ
  anyway;
- `phrase`: the same with one more line (`PHRASE_LINE` in `run.mjs`) and the two Japanese examples with ` | `.

A sentence is read right when its kana are the gold's (as eval/jsut_accent). The boundaries are counted between
morae, on the sentences read right in `base` and `phrase` whose markings all have the gold's number of morae, against
JSUT's `#` and `_`. Beside the LLM's: D31 on the `base` answer (as the tools ship), D31 with the 17 phrase rules
eval/jsut_accent learned from the training half, and the `base` answer's own boundaries (its ` ‖ ` only).

JSUT's text is CC BY-SA, so the answers stay in `results/raw/` (gitignored); `results/<llm>.json` holds aggregates.

```bash
node run.mjs [llm] [--parallel 3]   # needs eval/jsut_accent/data/items.json (its prepare.py)
node score.mjs [llm]
```

## Results: Claude Code (claude-opus-5-5), one run (`results/claude.json`)

Readings, of 500 (60 calls, every one answered):

| | read as the gold |
|---|---|
| base | 426 |
| base2 | 428 |
| phrase | 428 |

Per sentence, right in one condition and not the other: base / base2 13 / 15, base / phrase 12 / 14, base2 / phrase
14 / 14. **Asking for ` | ` does not make the readings worse**: the two conditions differ no more than two runs of the
same instructions.

Accent phrase boundaries, 414 sentences, 2,316 gold boundaries:

| | precision % | recall % | F1 |
|---|---|---|---|
| **the LLM's ` \| ` and ` ‖ `** | **93.2** | 91.8 | **92.5** |
| D31, as shipped | 81.1 | 95.4 | 87.7 |
| D31, with the 17 phrase rules learned from JSUT | 89.1 | 93.7 | 91.3 |
| the LLM's ` ‖ ` only (no ` \| `) | 100 | 24.8 | 39.7 |

The LLM's phrasing is closer to JSUT's than the shipped rules (D31 splits too often: 2,724 boundaries where the gold
has 2,316, the LLM 2,282), and a little closer than the rules learned from JSUT itself, with one line of instructions.
The gold is one annotation of one reading; one run, one LLM.

### The accent in the LLM's phrases (D32)

`@yomiscript/ja-accent` now keeps the accent phrases a YomiScript writes itself (D32): OpenJTalk's rules run on the
dictionary path with each word after a ` | ` or ` ‖ ` starting a phrase and every other word joined to the one before,
so the dictionary's accent and OpenJTalk's accent combination go into the LLM's phrases. Against the gold on the same
414 sentences (`accent` in `results/claude.json`, the measures of eval/jsut_accent):

| | H / L right % (of all morae) | gold phrases with the same span % | gold phrases right % |
|---|---|---|---|
| D31, as shipped | 85.5 | 76.1 | 60.7 |
| D31, with the 17 phrase rules learned from JSUT | 86.0 | 80.5 | 63.4 |
| **D32: the LLM's phrases** | **86.0** | **81.2** | 63.3 |

With the LLM's phrases the accent is as close to the gold as with rules learned from the gold itself. Of the gold
phrases whose span it gets, 78% have the gold's H / L: the nucleus inside the phrase is now the larger error, which
is what eval/qwen_prosody reads from Qwen.
