# MoLD (Mixture of Language-specific Dictionaries, working name)

A design that combines language-neutral **shared weights** with a **Memory** that can be swapped per language or dialect (D10, D11). At run time, only the shared weights and the one Memory currently in use are loaded. As a result, RAM usage is expected to barely grow as supported languages are added (estimate, to be tested in H11).

## Compiling lexicons into Memory (H12)

- The contents of a lexicon can be written into Memory **without training, deterministically, in seconds** (memory write = compilation).
- Keys: computed by passing each entry (surface form, optionally part-of-speech and context features) through the shared encoder. `[context: …]` is also included in the key, and `[default]` becomes a context-free key.
- Values: looked up from pre-trained reading and accent embeddings.
- Prerequisite: during pre-training, the model is trained to "follow the Memory values".
- Verification: conformance tests on the compiled Memory (whether each entry is read as in the lexicon) run automatically.

## Inference modes (D12)

1. **Fixed mode**: selects a single Memory via `@dialect` or a language specification. Minimal RAM and predictable behavior.
2. **Auto mode**: a lightweight classifier selects and switches Memory per sentence.

Explicit specification takes precedence over automatic selection. Frequently used Memories stay resident in RAM.

## Difference from MoE

MoE selects experts with learned routing (a router) and loads all experts into RAM. MoLD selects a Memory explicitly by language or dialect and loads only what is used. When adding a language, the plan is to keep the shared weights frozen and only add a new Memory.

About the name: the abbreviation "MoLD" overlaps with an image-detection paper, but the full name does not (note in D11).
