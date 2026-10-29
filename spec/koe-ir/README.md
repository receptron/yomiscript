# KOE-IR Specification (v0.1 draft)

> **Note:** KOE-IR is the old name. The current name is **YomiScript**. For the draft of the language-neutral (extended IPA) pronunciation layer, see [`../yomiscript/`](../yomiscript/README.md). The reading and lexicon parts of this spec now live in [`../lexicon/`](../lexicon/README.md) and are no longer part of YomiScript (D14).

KOE-IR is an intermediate language for speech synthesis that **does not include timbre**. It separates the front end (reading and accent prediction) from the acoustic backend (TTS engine) so that each can be developed and swapped independently (hypothesis H0).

This specification is published under CC BY 4.0 ([`../LICENSE`](../LICENSE)).

## Two layers

1. **Input (source notation)**: text written by people. It includes style tags, reading specifications and lexicon declarations.
2. **Output (IR)**: a normalized representation carrying readings, accents, phrase boundaries, pauses and styles. Backend plugins receive it.

## Main features

- Style tags: `[whisper]` `[laughs]` `[pause]`, and Japanese annotations `(ひそひそ声で)` `(笑いながら)`. They are normalized via a vocabulary table (e.g. `(ひそひそ声で)` → `whisper`).
- Reading specification: full form `{表記|読み}`, short form `市(いち)`. Readings are in kana; for English and others, IPA can also be written (`{SIP|/sɪp/}`).
- Lexicon: in-document `@lexicon { … }`, and `@import "x.koedict"` to load an external file.
- Accent: `'` (nucleus position) or `[accent: N]` (corresponds to the numeric notation of UniDic aType).
- Dialect: `@dialect`, `@lexicon(dialect: …)`, `[dialect: …]`. If there is no entry, it falls back to standard Japanese.
- Context conditions: `[context: …]` and `[default]` (D13).

## Reading precedence (D1, D13)

1. Inline specification `{表記|読み}` (including the short form)
2. Lexicon: `@lexicon` and `@import` together form one tier. Within the tier, `@lexicon` > `@import`, and among `@import`s the later one wins. If the same surface form has multiple entries, an entry matching the context condition > `[default]`
3. Prediction from context by the model (Yomi)

For the detailed grammar and examples, see [`grammar.md`](grammar.md).
