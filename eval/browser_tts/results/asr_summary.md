# Intelligibility (Whisper large-v3-turbo transcripts)

Intelligibility from the Whisper transcripts (results/asr.json): results/asr_summary.md.

Japanese: the transcript is read with pyopenjtalk and compared, in katakana, with what the system was meant to say
(kana error rate). English: word error rate against the text. Whisper and pyopenjtalk make their own mistakes,
the same for every system, so the numbers compare systems; they are not absolute error rates.

  katarite   Kokoro vs Supertonic given the same LLM YomiScript; the reference is that YomiScript's reading (its text with
             kana for every word with kanji, read with pyopenjtalk like the transcripts)
  hard       every system on the hard set; the reference is the gold reading
  en         every system on the English texts; the reference is the text

## Katarite: Kokoro vs Supertonic, same YomiScript (kana error rate vs that YomiScript)

| Yomite | Katarite | ja parity | hard set |
|---|---|---|---|
| codex | Kokoro | 5.2% (23) | 4.3% (70) |
| codex | Supertonic 3, kana for ambiguous words | 8.6% (23) | 6.1% (70) |
| claude | Kokoro | 6.2% (23) | 4.2% (70) |
| claude | Supertonic 3, kana for ambiguous words | 8.8% (23) | 8.0% (70) |

## Hard set: every system vs the gold reading (kana error rate)

| system | all | homographs |
|---|---|---|
| codex | 3.9% (70) | 7.0% (35) |
| claude | 3.7% (70) | 6.6% (35) |
| supertonic_ys_codex_ambiguous | 5.6% (70) | 8.2% (35) |
| supertonic_ys_claude_ambiguous | 7.6% (70) | 9.2% (35) |
| kokoro | 10.3% (70) | 9.6% (35) |
| supertonic | 13.8% (70) | 14.4% (35) |
| supertonic_hints | 7.4% (32) | 7.4% (32) |
| system | 5.5% (70) | 10.1% (35) |

## English: word error rate vs the text

| system | WER |
|---|---|
| codex | 2.4% (22) |
| claude | 2.0% (22) |
| supertonic_ys_codex_ambiguous | 3.2% (22) |
| supertonic_ys_claude_ambiguous | 2.8% (22) |
| kokoro | 2.8% (22) |
| supertonic | 2.4% (22) |
| system | 2.4% (22) |
