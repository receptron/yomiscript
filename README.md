# mulmovoice

mulmovoice is an open speech front-end built around **YomiScript**, a language-neutral DSL for pronunciation and prosody. YomiScript sits between two modules — **Yomite** (読み手, "the reader": text → YomiScript) and **Katarite** (語り手, "the narrator": YomiScript → sound) — so the two can be developed, swapped and improved independently.

Status: early design. The YomiScript spec is a v0.2 draft and all syntax may change.

## Architecture

```
 inputs                    Yomite (text → YomiScript)       language-neutral hub        Katarite (YomiScript → sound)
 ──────                    ──────────────────────────       ────────────────────        ─────────────────────────────
 text                  ─┐  ja: Yomi-0 + MoLD memories ─┐                              ┌── Kokoro-82M (reference)
 lexicons (.koedict)   ─┼► LLMs, other analyzers      ─┼──►     YomiScript       ─────┼── Katarite plugins
 inline reading hints  ─┘                              │   phonemes, accent, tone,    └── …
                           hand-written by people     ─┘   stress, boundaries,
                                                           language tags
```

- **Yomite** (text → YomiScript) is the only language-specific part: resolving readings, homographs, names, numbers and prosody. A Yomite can be a small dedicated model (Yomi-0 for Japanese), a smart LLM, a rule-based analyzer, or a person writing YomiScript by hand. Lexicons (`.koedict`) and inline reading hints are its inputs.
- **YomiScript** describes *how the text should be pronounced*, independent of any voice or engine. It is prescriptive: whoever writes it — a Yomite or a person — decides the pronunciation, and the engine follows it.
- **Katarite** (YomiScript → sound) needs no language-specific text analysis. It only has to render phonemes and prosody.

Adding a language means adding a Yomite (or pointing an LLM at it). Adding a TTS engine means adding a Katarite. Neither changes the other.

## YomiScript

- **Phonemes** are plain IPA.
- **Prosody** uses IPA's own marks wherever they exist: pitch accent (`ꜛ` `ꜜ`), Chao tone letters (`˥˧˩`), stress (`ˈ` `ˌ`), length, boundaries and pauses. Languages differ only in which marks they use.
- **Language tags** (BCP 47) apply to a whole utterance (`^en-US|…$`) or to a span inside it (`{ja|…}`), so code-switching is native. Dialects use the same mechanism (e.g. `ja-x-osaka`).
- **Pitch values** `<f0:…>` (semitones, per mora or syllable) can be written next to the marks. A Yomite fills them in; the Katarite renders only the values (D18).
- **No native scripts.** Kana, pinyin and other writing systems are not YomiScript; every language, Japanese included, is written in IPA (D17).

Example — an English sentence with Japanese names:

```
^en-US|maɪ ˈfɹɛnd {ja|taꜛnaka} ˈlɪvz ɪn {ja|toꜛːkʲoː}$
```

YomiScript carries only resolved pronunciations; it has no lexicons or reading hints (D14).

Spec: [`spec/yomiscript/`](spec/yomiscript/) (language tags: [`langtags.md`](spec/yomiscript/langtags.md)). The earlier KOE-IR v0.1 draft is kept in [`spec/koe-ir/`](spec/koe-ir/).

## Lexicons (Yomite input)

Lexicons tell a Yomite how to read specific words. They are not part of YomiScript.

- **`.koedict` files** and in-document `@lexicon` / `@import`, with `[context: …]`, `[default]`, `[sex: …]` and `[accent: N]` conditions and dialect sections.
- **Inline reading hints** `{text|reading}` in the source text.
- Reading priority: **inline hint > lexicon entry matching the conditions > `[default]` entry > model inference** ([D1, D13](docs/decisions.md)).

Spec: [`spec/lexicon/`](spec/lexicon/).

## Components

| Component | Role | Location |
|---|---|---|
| **YomiScript** | The language-neutral pronunciation and prosody DSL at the center of the architecture | [`spec/yomiscript/`](spec/yomiscript/) |
| **Lexicons (.koedict)** | Yomite input: human-readable lexicons of readings, accents, dialects and context conditions | [`spec/lexicon/`](spec/lexicon/), [`dict/`](dict/) |
| **Yomi-0** | Japanese Yomite: a small dense model (MLX) that produces readings, pitch accent and phrase boundaries | [`models/yomi/`](models/yomi/) |
| **MoLD** | Mixture of Language-specific Dictionaries: shared weights plus a swappable memory per language or dialect; dictionaries compile into memory without training | [`mold/`](mold/) |
| **Kokoro reference Katarite** | Synthesizes speech from YomiScript with Kokoro-82M, bypassing its own text analysis; builds F0 from accent/tone marks where appropriate; handles mixed-language utterances | [`tts/kokoro_ys/`](tts/kokoro_ys/) |
| **Browser demo** | YomiScript → speech entirely in the browser (onnxruntime-web) | [`demo/ys_web/`](demo/ys_web/) |
| **Katarite plugins** | Adapters from YomiScript to other TTS engines and vendor formats | [`plugins/`](plugins/) |
| **Evaluation** | Benchmarks against baselines (e.g. pyopenjtalk on JSUT) | [`eval/`](eval/) |

### Why so much Japanese?

Japanese is the hardest case for the Yomite side, not the focus of the project. Kanji readings are highly ambiguous (homographs, personal and place names), and pitch accent is not written in the text at all. Most of the modeling work so far (Yomi-0, the name and place-name memories, MoLD) is therefore the Japanese Yomite. YomiScript and Katarite are designed for every language from the start; the reference Katarite already handles English, French and Chinese.

## Terminology (D9)

- **Lexicon**: the human-readable `.koedict` / `@lexicon` dictionaries given to a Yomite.
- **Memory**: a key–value memory inside a neural network, used in training and inference.
- **Memory write**: loading a lexicon's contents into a memory.
- Device RAM is always qualified ("unified memory", "RAM usage") to keep it distinct from Memory.

## Documents

- [Decisions D1–D18](docs/decisions.md)
- [Hypotheses H0–H12](docs/hypotheses.md)
- [Contributing](CONTRIBUTING.md)

## License

- Code: Apache License 2.0 ([`LICENSE`](LICENSE))
- Specifications (under `spec/`): CC BY 4.0 ([`spec/LICENSE`](spec/LICENSE))
- Dictionaries and training data follow their own licenses, stated in each file.
