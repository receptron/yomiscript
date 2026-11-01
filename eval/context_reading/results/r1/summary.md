429 calls, 35 without a complete answer after 3 tries; seconds per LLM (summed): Claude 2204, Codex 2428, Gemini 1723
Models: Claude: claude-opus-5-5; Codex: gpt-6.1-sol; Gemini: gemini-4-argon-medium
- failed: authread/agy/agy.alone/b10.json
- failed: authread/agy/agy.alone/b11.json
- failed: authread/agy/agy.alone/b12.json
- failed: authread/agy/agy.alone/b7.json
- failed: authread/agy/agy.alone/b8.json
- failed: authread/agy/agy.alone/b9.json
- failed: authread/agy/agy.context/b10.json
- failed: authread/agy/agy.context/b11.json
- failed: authread/agy/agy.context/b12.json
- failed: authread/agy/agy.context/b7.json
- failed: authread/agy/agy.context/b8.json
- failed: authread/agy/agy.context/b9.json
- failed: authread/claude/agy.alone/b10.json
- failed: authread/claude/agy.alone/b11.json
- failed: authread/claude/agy.alone/b12.json
- failed: authread/claude/agy.alone/b8.json
- failed: authread/claude/agy.alone/b9.json
- failed: authread/claude/agy.context/b10.json
- failed: authread/claude/agy.context/b11.json
- failed: authread/claude/agy.context/b12.json
- failed: authread/claude/agy.context/b7.json
- failed: authread/claude/agy.context/b8.json
- failed: authread/claude/agy.context/b9.json
- failed: authread/codex/agy.alone/b10.json
- failed: authread/codex/agy.alone/b11.json
- failed: authread/codex/agy.alone/b12.json
- failed: authread/codex/agy.alone/b7.json
- failed: authread/codex/agy.alone/b8.json
- failed: authread/codex/agy.alone/b9.json
- failed: authread/codex/agy.context/b10.json
- failed: authread/codex/agy.context/b11.json
- failed: authread/codex/agy.context/b12.json
- failed: authread/codex/agy.context/b7.json
- failed: authread/codex/agy.context/b8.json
- failed: authread/codex/agy.context/b9.json

Homograph read right, 130 items (65 words), [95% interval resampling words]

| condition | 3 LLMs pooled | Claude | Codex | Gemini |
|---|---|---|---|---|
| ext.alone | 48.5% [45.6%, 51.0%] | 48.5% | 50.8% | 46.2% |
| ext.context | 97.7% [95.4%, 99.5%] | 97.7% | 97.7% | 97.7% |
| chat.alone | 48.5% [46.4%, 50.5%] | 48.5% | 50.8% | 46.2% |
| chat.context | 98.2% [96.4%, 99.7%] | 99.2% | 98.5% | 96.9% |
| pyopenjtalk (target sentence) | 49.2% [47.7%, 50.0%] | | | |

Paired differences on the same items (pooled: the share of the 3 LLMs; one LLM: 0 or 1 per item)

| A − B | difference (points) | 95% interval, resampling words | words A / B better (sign test) | item x LLM pairs A / B better (McNemar) |
|---|---|---|---|---|
| PRIMARY ext.context − ext.alone, pooled | +49.2 | [+46.2, +52.3] | 64 / 0 (p = 1.1e-19) | 193 / 1 (p = 1.6e-56) |
| ext.context − ext.alone, Claude | +49.2 | [+44.6, +53.8] | 60 / 0 (p = 1.7e-18) | 65 / 1 (p = 1.8e-18) |
| ext.context − ext.alone, Codex | +46.9 | [+42.3, +51.5] | 58 / 0 (p = 6.9e-18) | 61 / 0 (p = 8.7e-19) |
| ext.context − ext.alone, Gemini | +51.5 | [+46.9, +56.2] | 61 / 0 (p = 8.7e-19) | 67 / 0 (p = 1.4e-20) |
| chat.context − chat.alone, pooled | +49.7 | [+46.9, +52.3] | 65 / 0 (p = 5.4e-20) | 195 / 1 (p = 3.9e-57) |
| chat.context − chat.alone, Claude | +50.8 | [+47.7, +53.8] | 63 / 0 (p = 2.2e-19) | 66 / 0 (p = 2.7e-20) |
| chat.context − chat.alone, Codex | +47.7 | [+43.1, +52.3] | 59 / 0 (p = 3.5e-18) | 63 / 1 (p = 7e-18) |
| chat.context − chat.alone, Gemini | +50.8 | [+46.2, +55.4] | 60 / 0 (p = 1.7e-18) | 66 / 0 (p = 2.7e-20) |
| ext.context − chat.context, pooled | -0.5 | [-2.3, +1.3] | 2 / 4 (p = 0.69) | 3 / 5 (p = 0.73) |
| ext.context − chat.context, Claude | -1.5 | [-3.8, +0.0] | 0 / 2 (p = 0.5) | 0 / 2 (p = 0.5) |
| ext.context − chat.context, Codex | -0.8 | [-3.8, +2.3] | 2 / 3 (p = 1) | 2 / 3 (p = 1) |
| ext.context − chat.context, Gemini | +0.8 | [+0.0, +2.3] | 1 / 0 (p = 1) | 1 / 0 (p = 1) |

Authors: answers of at most 15 characters with the word, readers of those answers

| author | answers | with the word | over 15 characters | restating the user's message |
|---|---|---|---|---|
| Claude | 130 | 130 | 0 | 2 |
| Codex | 130 | 130 | 0 | 1 |
| Gemini | 130 | 130 | 0 | 2 |

Left out: 180 answers that some reader's call did not return (failed calls, see the top).

all answers with the word: 210 answers, 65 words

| condition | right [95% interval resampling words] |
|---|---|
| author | 99.0% [97.6%, 100.0%] |
| same LLM, answer alone | 75.2% [67.6%, 82.4%] |
| same LLM, with the user's message | 99.0% [97.6%, 100.0%] |
| other LLMs, answer alone | 74.8% [67.4%, 81.7%] |
| other LLMs, with the user's message | 98.6% [97.4%, 99.5%] |
| pyopenjtalk on the answer | 57.1% [46.4%, 67.6%] |

| A − B | difference (points) | 95% interval, resampling words | words A / B better (sign test) | item x LLM pairs A / B better (McNemar) |
|---|---|---|---|---|
| author − same LLM, answer alone | +23.8 | [+16.4, +31.8] | 32 / 1 (p = 7.9e-09) | 51 / 1 (p = 2.4e-14) |
| author − same LLM, with the user's message | +0.0 | [-1.9, +1.9] | 2 / 2 (p = 1) | 2 / 2 (p = 1) |
| author − other LLMs, with the user's message | +0.5 | [-1.4, +2.2] | 6 / 2 (p = 0.29) | n/a (two readers averaged) |
| same LLM, with the user's message − same LLM, answer alone | +23.8 | [+16.7, +31.4] | 32 / 1 (p = 7.9e-09) | 51 / 1 (p = 2.4e-14) |
| other LLMs, with the user's message − other LLMs, answer alone | +23.8 | [+16.7, +31.5] | 36 / 3 (p = 3.6e-08) | n/a (two readers averaged) |

answers that do not restate: 207 answers, 65 words

| condition | right [95% interval resampling words] |
|---|---|
| author | 99.0% [97.5%, 100.0%] |
| same LLM, answer alone | 74.9% [67.0%, 82.0%] |
| same LLM, with the user's message | 99.0% [97.5%, 100.0%] |
| other LLMs, answer alone | 74.4% [66.6%, 81.4%] |
| other LLMs, with the user's message | 98.6% [97.3%, 99.5%] |
| pyopenjtalk on the answer | 56.5% [45.7%, 67.2%] |

| A − B | difference (points) | 95% interval, resampling words | words A / B better (sign test) | item x LLM pairs A / B better (McNemar) |
|---|---|---|---|---|
| author − same LLM, answer alone | +24.2 | [+16.9, +32.1] | 32 / 1 (p = 7.9e-09) | 51 / 1 (p = 2.4e-14) |
| author − same LLM, with the user's message | +0.0 | [-2.0, +1.9] | 2 / 2 (p = 1) | 2 / 2 (p = 1) |
| author − other LLMs, with the user's message | +0.5 | [-1.4, +2.2] | 6 / 2 (p = 0.29) | n/a (two readers averaged) |
| same LLM, with the user's message − same LLM, answer alone | +24.2 | [+17.0, +32.0] | 32 / 1 (p = 7.9e-09) | 51 / 1 (p = 2.4e-14) |
| other LLMs, with the user's message − other LLMs, answer alone | +24.2 | [+16.8, +31.8] | 36 / 3 (p = 3.6e-08) | n/a (two readers averaged) |
