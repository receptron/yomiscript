Homograph read right, over 150 answers that contain the word (3 authors), [95% interval]

| condition | all | author Claude | author Codex | author Gemini |
|---|---|---|---|---|
| author (its own answer, same call) | 98.0% [95.3%, 100.0%] | 96.0% | 100.0% | 98.0% |
| same LLM, reading the answer only | 92.0% [87.3%, 96.0%] | 94.0% | 88.0% | 94.0% |
| same LLM, with the user's message | 98.0% [95.3%, 100.0%] | 96.0% | 98.0% | 100.0% |
| another LLM, reading the answer only | 91.7% [87.7%, 95.3%] | 94.0% | 89.0% | 92.0% |
| another LLM, with the user's message | 97.0% [94.7%, 99.0%] | 98.0% | 98.0% | 95.0% |
| pyopenjtalk (dictionary) | 56.0% [48.0%, 64.0%] | 56.0% | 56.0% | 56.0% |

Every condition, every author (right / answers):

| author | author | claude.text | claude.context | codex.text | codex.context | agy.text | agy.context | openjtalk |
|---|---|---|---|---|---|---|---|---|
| Claude | 48/50 | 47/50 | 48/50 | 46/50 | 49/50 | 48/50 | 49/50 | 28/50 |
| Codex | 50/50 | 44/50 | 49/50 | 44/50 | 49/50 | 45/50 | 49/50 | 28/50 |
| Gemini | 49/50 | 47/50 | 49/50 | 45/50 | 46/50 | 47/50 | 50/50 | 28/50 |

Pairs on the same answers (exact McNemar; one reader at a time, so every pair counts once):

| A | B | A right, B not | B right, A not | p |
|---|---|---|---|---|
| author | same LLM, text | 10 | 1 | 0.0117 |
| author | same LLM, context | 1 | 1 | 1 |
| same LLM, context | same LLM, text | 10 | 1 | 0.0117 |
| Claude reader, text | Codex reader, text | 6 | 3 | 0.508 |
| Claude reader, context | Codex reader, context | 4 | 2 | 0.688 |
| Claude reader, text | Gemini reader, text | 4 | 6 | 0.754 |
| Claude reader, context | Gemini reader, context | 2 | 4 | 0.688 |
| Codex reader, text | Gemini reader, text | 3 | 8 | 0.227 |
| Codex reader, context | Gemini reader, context | 2 | 6 | 0.289 |

Clustered 95% intervals (150 answers, 50 scenarios, 25 words; 10,000 resamples)

| condition | right | resampling answers | resampling scenarios | resampling words |
|---|---|---|---|---|
| author | 98.0% | [95.3%, 100.0%] | [94.7%, 100.0%] | [94.7%, 100.0%] |
| same LLM, answer only | 92.0% | [87.3%, 96.0%] | [86.0%, 96.7%] | [86.0%, 96.7%] |
| same LLM, with the user's message | 98.0% | [95.3%, 100.0%] | [94.7%, 100.0%] | [94.7%, 100.0%] |
| another LLM, answer only | 91.7% | [87.7%, 95.3%] | [85.7%, 96.7%] | [85.3%, 97.0%] |
| another LLM, with the user's message | 97.0% | [94.7%, 99.0%] | [94.0%, 99.3%] | [94.3%, 99.0%] |

Paired differences on the same answers, in percentage points (a reader of another LLM counts as the mean of the two):

| A − B | difference | A better / B better: answers | words (sign test) | resampling answers | resampling scenarios | resampling words |
|---|---|---|---|---|---|---|
| author − same LLM, answer only | +6.0 | 10 / 1 | 6 / 1 (p = 0.125) | [+2.0, +10.7] | [+1.3, +12.0] | [+0.7, +12.0] |
| author − same LLM, with the user's message | +0.0 | 1 / 1 | 0 / 0 (p = 1) | [-2.0, +2.0] | [+0.0, +0.0] | [+0.0, +0.0] |
| same LLM, with the user's message − same LLM, answer only | +6.0 | 10 / 1 | 6 / 1 (p = 0.125) | [+2.0, +10.7] | [+1.3, +12.0] | [+0.7, +12.0] |
| author − another LLM, answer only | +6.3 | 16 / 2 | 7 / 1 (p = 0.0703) | [+2.7, +10.3] | [+1.7, +12.0] | [+1.3, +12.7] |
| author − another LLM, with the user's message | +1.0 | 7 / 2 | 5 / 2 (p = 0.453) | [-1.7, +3.7] | [-1.3, +3.3] | [-1.3, +3.3] |

An interval that includes 0 means no difference was detected, not that the two are equivalent. An interval of [+0.0, +0.0]
comes from discordant answers that cancel within one cluster: the data say nothing about a difference there.
