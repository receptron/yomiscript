# Personal name data (dict/names)

Reading data for Japanese personal names (surnames). Used for YomiScript dictionaries (`.koedict`) and for generating training data, to cover Yomi-0's weakness in reading personal names (e.g. 梨奈).

## Not in this repository

The redistribution terms of the statistics these files come from have not been confirmed, so the data files
(`surnames_top200.csv`, `given_names_by_generation.csv`, `surnames.koedict`, `given_names.koedict`) are not in the
repository (they are in `.gitignore`). They are kept in a separate private repository, `yomiscript-names`; copy its
files into this directory. Without them, the Yomi-0 / MoLD tests that read them are skipped; the scripts that read
them (`aug/names.py`, `train.py`'s default memory dictionaries, `eval_names.py`, `mold_demo.py`,
`tools/mine_hardneg.py`) report the missing file. `demo_extra.koedict` is the project's own and stays here.

## Files

| File | Contents |
|---|---|
| `surnames_top200.csv` | Top 200 surnames (UTF-8, LF, with header) |
| `surnames.koedict` | YomiScript dictionary generated automatically from the CSV above (readings only, no accents) |

## Columns (surnames_top200.csv)

| Column | Description |
|---|---|
| `rank` | Rank (1–200) |
| `surname` | Surname spelling (NFKC-normalized) |
| `reading` | Primary reading (hiragana). Becomes `[default]` in `.koedict` |
| `alt_readings` | Alternative readings (hiragana, `|`-separated; empty means none) |
| `population_approx` | Approximate number of people (integer; source data 「約200万」 → `2000000`). Top 10 only, empty for the rest |

## Cleaning

Leading/trailing whitespace removed, NFKC normalization, readings unified to hiragana, alternative readings that duplicate the primary reading removed, duplicate spellings checked, rank continuity checked.

## Mapping to `.koedict`

- `reading` → `名字 = カタカナ読み [default];`
- Each element of `alt_readings` → a separate unconditioned entry
- No accents yet. Context conditions (e.g. sex, region) are planned.

## Source and license (to be confirmed; the reason the data is kept outside the repository)

- The data was provided by the project owner (S. Nakajima).
- Ranks and counts are approximate figures based on the provided data; accuracy is not guaranteed.
- The **redistribution license of the original statistics has not been confirmed**. Confirm it before making the repository public or distributing it to others. Until confirmed, the license of this directory is "undetermined".

---

## Given names (given_names_by_generation.csv)

Birth-year generation (6 groups: 1926–2025) × sex × top 100 = 1,200 rows.

| Column | Description |
|---|---|
| `generation` | Year range of the generation (e.g. `1926-1945`) |
| `generation_label` | Description of the generation |
| `sex` | `男性` (male) / `女性` (female) |
| `rank` | Rank within generation and sex (1–100) |
| `name` | Name spelling (NFKC-normalized) |
| `reading` | Primary reading (hiragana). Candidate for `[default]` in `.koedict` |
| `alt_readings` | Alternative readings (hiragana, `|`-separated) |
| `sex_reading` | Difference in reading by sex: `共通` (same for both) / `異なる` (different) / empty (no information) |
| `sex_reading_note` | Note on readings by sex (e.g. `男性 ひかる/女性 ひかり`) |
| `source` | `明治安田生命 生まれ年別名前調査` (Meiji Yasuda Life name survey by birth year) or `補完（推定）` (filled in, estimated) |
| `is_estimated` | `1` = filled-in (estimated) row (estimated by the provider, not survey data), `0` = survey data |

Notes:
- 568 rows (about 47%) are `補完（推定）` estimates. Treat their ranks and readings with care.
- The same spelling can have a different primary reading depending on generation or sex (e.g. 健 けん/たけし, 歩 あゆむ/あゆみ).
- Rows where `sex_reading` is `異なる` are candidates for using sex as a context condition in `.koedict` (requires a YomiScript grammar extension).
- The redistribution terms for the part derived from 「明治安田生命 生まれ年別名前調査」 have not been confirmed. Confirm before publishing.
- The given-name dictionary is `given_names.koedict` (below).

## given_names.koedict (names whose reading depends on sex)

Generated automatically from `given_names_by_generation.csv` (788 spellings, 945 entries).

- `[default]` is the reading that appears most often as the primary reading across all generations and both sexes.
- The **18 spellings** with `sex_reading = 異なる` (e.g. 光 男性ひかる/女性ひかり, 歩 あゆむ/あゆみ, 心 しん/こころ, 結 ゆう/ゆい, 陽葵 はるき/ひまり) have their per-sex readings written as `[context: 男性]` / `[context: 女性]` entries.
- **The KOE-IR v0.1 grammar (the predecessor of YomiScript) has no condition dedicated to sex.** So the closest one, `[context: …]`, is used, with the words `男性` / `女性` as the condition. A dedicated condition such as `[sex: male|female]` may be added to the spec in the future.
- Alternative readings (`alt_readings`, and primary readings that differ by generation) are unconditioned entries.
- No accents yet.
