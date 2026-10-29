# pyopenjtalk baseline results v0 (H1, Issue #5, #6)

Measured: 2026-10-24. All figures were actually measured with `scripts/run_pyopenjtalk_baseline.py` (raw data in `results/pyopenjtalk_baseline.json`).

## Environment
- pyopenjtalk 0.4.1 (bundled OpenJTalk dictionary), Python 3.11
- Linux (no GPU), Intel Xeon, 8 cores. Sequential processing in 1 process with 1 thread, measured after warm-up
- Not yet measured on a Mac (the Issue #5 target "under 10 ms per sentence on a Mac" is unverified)

## 1. JSUT BASIC5000 subset (280 sentences, human-annotated references)

| Metric | Value |
|---|---|
| Kana CER (strict) | **1.77%** (177 / 9,994 characters) |
| Sentence-level reading accuracy (strict) | **72.5%** (203 / 280) |
| Kana CER (spelling-variant normalized*) | 1.33% |
| Sentence-level reading accuracy (spelling-variant normalized*) | 81.4% |
| Phoneme error rate | 1.19% |
| Phrase boundary (`#` and `_`) P / R / F1 | 0.794 / 0.957 / **0.868** |
| Accent nucleus (`]`) P / R / F1 | 0.750 / 0.745 / **0.748** |
| Accent phrase exact-match rate (share of phrases whose boundaries at both ends and nucleus position match) | **61.1%** (1,205 / 1,973) |

\* Spelling-variant normalization: ー is replaced with the preceding vowel, and e-row + イ is compared as e-row + エ, o-row + ウ as o-row + オ, and ヲ as オ. A secondary metric so that spelling differences on the reference side, such as イイ/イー, are not counted as errors.

The predicted prosody symbols were built from full-context labels using the same rules as ESPnet `pyopenjtalk_prosody`. The reference and predicted phoneme sequences are aligned, and symbols are compared at positions within matched spans.

## 2. Handcrafted hard set (70 sentences, references provisional and need review)

| Category | Sentences | Accuracy (strict) | Accuracy (normalized) | Kana CER |
|---|---|---|---|---|
| Homographs | 35 | 51.4% | 60.0% | 8.0% |
| Acronyms | 12 | 83.3% | 100% | 1.0% |
| Numerals | 12 | 91.7% | 91.7% | 0.6% |
| Dates | 11 | 100% | 100% | 0.0% |
| **Overall** | 70 | **71.4%** | 78.6% | 4.1% |

## 3. CPU speed (JSUT, 280 sentences)

| Operation | Mean | Median | p95 | Sentences/s |
|---|---|---|---|---|
| `g2p(kana=True)` | 0.16 ms | 0.14 ms | 0.31 ms | about 6,200 |
| `extract_fullcontext` (with accents and phrase boundaries) | 0.27 ms | 0.22 ms | 0.59 ms | about 3,700 |

Single measurement, so expect about ±10% variation between runs.

## 4. Main error patterns
1. **Homographs whose reading depends on context** (17 errors in the hard set). pyopenjtalk does not look at context and picks the most common reading in its dictionary.
   - Examples: 市→シ（いち）, 一日→イチニチ（ついたち）, 上手→ジョーズ（かみて）, 人気→ニンキ（ひとけ）, 大家→オーヤ（たいか）, 生物→セーブツ（なまもの）, 辛い→ツライ（からい）, 角→カク（かど・つの）, 寒気→サムケ（かんき）, 色紙→イロガミ（しきし）, 目下→モッカ（めした）, 一行→イッコー（いちぎょう）
   - The same kind of error appears in JSUT: 種→タネ（しゅ）, 解る→ホドケル, 通っている→カヨッテ（とおって）, 大違い→ダイチガイ, 御粗末→ゴソマツ, 万人→マンニン, 不足→フソク（ぶそく）, 何なの→ナニナノ
   - This kind of error is the problem that Yomi-0's context judgment (D4) and context-conditioned dictionaries (D13) aim to solve.
2. **Spelling variants of long vowels**: pyopenjtalk writes 「いい→イイ」「ほしい→ホシイ」「ていねい→テイネイ」, while the references write 「イー」「ホシー」「テーネー」. This accounts for most of the gap that raises sentence-level accuracy on JSUT from 72.5% to 81.4%. Acoustically they are the same or nearly so.
3. **Sound changes in numerals**: ７０歳→ナナジュッサイ (reference: ナナジッサイ), ２０チーム→ニジューチーム (reference: ニジュッチーム).
4. **Acronyms**: SIP→エスアイピー (the user intends シップ), NHK→エヌエイチケイ. Targets for specification via the lexicon (D1, D13).
5. **Accent phrases**: pyopenjtalk tends to split phrases more finely than the references (boundary precision 0.79, recall 0.96). Accent nucleus F1 is 0.75.

## 5. Limitations and next steps
- The hard set references are a provisional version written by the author and need review (especially 市 in h001, 今日 and 日本 in h005, and SIP in h037).
- Comparison with Joyo Kanji Yomi Benchmark, pyopenjtalk-plus, zenz and MARINE has not been done yet.
- Metrics for ASR read-back CER after TTS (H7), latency and RAM on a Mac, and context-conditioned entries (D13, H12) are not implemented yet.
- Phrase boundary F1 counts the prosody symbols `#` (accent phrase boundary) and `_` (pause) as the same "boundary" without distinguishing them.
