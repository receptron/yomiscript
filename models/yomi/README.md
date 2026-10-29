# Yomi-0

A small model that outputs readings (phonemes), accents and phrase boundaries from Japanese text. It handles YomiScript's "inference from context" (the third level of the priority order).

## Design decisions

| Item | Details | Decision |
|---|---|---|
| Architecture | Dense model. No MoE (MoE is considered only for a future large LLM) | D2 |
| Precision | Train in BF16, distribute in 8-bit. QAT if accuracy drops. Optionally publish a 4-bit version if it shows almost no degradation | D3 |
| Ternary | Training ternary from scratch only as a comparison experiment (H9) | D3 |
| Reading disambiguation | Two-tier: Yomi handles most cases, and only low-confidence spots are handed to a large LLM | D4 |
| Data | (1) Auto-label a large corpus with pyopenjtalk+UniDic (2) Human labels such as JSUT for evaluation and finishing (3) For hard cases, an LLM proposes candidates and a human checks them (4) Ruby-annotated text and ASR transcripts (ReazonSpeech, etc.) as supplements. Accent labels are the scarcest | D5 |
| Memory | Has a sparse key-value Memory layer and adapts via memory writes of dictionaries (MoLD) | D10–D12, H10, H12 |

## Goals (target values)

- Size: tens of millions to 100 million parameters
- Reading accuracy at or above pyopenjtalk, under 10 ms per sentence on a Mac (H1)
- Inference: MLX and llama.cpp

## Related hypotheses

H1 (comparison with pyopenjtalk), H2 (reverse IME conversion), H7 (reducing misreadings before TTS), H9 (comparison with ternary), H10 (adaptation via Memory). See [`docs/hypotheses.md`](../../docs/hypotheses.md).
