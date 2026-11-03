# Does UTMOS hear what our listener hears in Japanese? (2026-11-02)

Question: per-voice TTS benchmarks (such as Onepin's Voice Benchmark, 55,556 voices in 11 languages) score
naturalness automatically. Could such a score stand in for our blind listening tests in Japanese?

**Answer: for the voice, yes; for the prosody, no.** UTMOS22 strong (SpeechMOS v1.2.0, a MOS predictor learnt mostly
on English, BVCC) puts the voice the listener found unpleasant last in 11 of 12 sentences, and scores a clip whose
end is cut off low; but between versions of the same voice that differ in pitch and accent, which is what every other
test here compares, it orders the systems as the listener did about as often as chance.

## Method (`score.py`)

Every clip of the eight blind tests listened to on 2026-11-02 (eval/qwen3_tts, eval/qwen_prosody; the clips as they
were heard) is scored, and compared with the listener's answers within each sentence: a system picked as the most
natural against each other system (does it score higher?), and a system ticked as unnatural against each one not
ticked (does it score lower?). One comparison is one pair; chance is 50%. The pairs of one sentence are not
independent, so the counts are a description, not a test.

## Results (`results/summary.md`, `results/scores.json`)

| test | what differs | mean UTMOS | best: scored higher |
|---|---|---|---|
| Kokoro, Qwen ono_anna, Qwen clone | the voice and the way of speaking | 3.98, **3.31**, 4.00 | 18 of 24 |
| transplant (4) | pitch, durations; one side with its ends cut off | 3.98, 4.00, **3.74** (cut off), 4.00 | 20 of 33 |
| transplant 2 (3) | pitch, durations | 3.99, 4.00, 4.00 | 5 of 16 |
| Kokoro vs Qwen's pitch | pitch | 3.97, 4.01 | 6 of 11 |
| D29 vs refit (twice) | pitch | 3.97, 3.95 | 3 of 4, 4 of 5 |
| D29, abs, Qwen's pitch (twice) | accent marks, pitch | 3.97, 4.03, 4.01 | 5 of 14, 2 of 6 |
| all | | | 63 of 113 (56%) |

Unnatural ticks (the second abs test, the only one with them): 7 of 12 pairs (58%).

- ono_anna, the voice the listener called unpleasant, is the lowest of the three in 11 of 12 sentences.
- Qwen's clone against Kokoro, the same voice speaking differently (the listener: clone 10, Kokoro 2): UTMOS
  scores the clone higher in 6 of 12.
- Between versions of Kokoro's voice that differ only in pitch, every system's mean is within 3.95-4.03.

So in Japanese an automatic score like this can screen voices (and broken audio), but it cannot rank pitch accent or
intonation, which is where our systems differ. That still takes listening, as the project's other prosody work found
(eval/prosody_ref: a pitch distance to references picks the worst variant more often than chance, but does not
replace the listener).

## Run

```bash
../prosody_ref/.venv/bin/python score.py   # needs the clips of the listening tests (their audio/ folders) and the
                                           # SpeechMOS hub repo in ~/.cache/torch/hub (torch.hub.load downloads it)
```
