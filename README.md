# mulmovoice

mulmovoice is an open speech front-end built around **YomiScript**, a language-neutral DSL for pronunciation and prosody. YomiScript sits between language-specific text analysis and voice generation, so the two can be developed, swapped and improved independently.

Status: early design. The YomiScript spec is a v0.2 draft and all syntax may change.

## Architecture

```
 inputs                    language-specific analysis       language-neutral hub        voice generation
 ──────                    ──────────────────────────       ────────────────────        ────────────────
 text                  ─┐  ja: Yomi-0 + MoLD memories ─┐                              ┌── Kokoro-82M (reference)
 lexicons (.koedict)   ─┼► en, zh, fr, … analyzers    ─┼──►     YomiScript       ─────┼── backend plugins
 inline reading hints  ─┘                              │   phonemes, accent, tone,    └── …
                           hand-written by people     ─┘   stress, boundaries,
                                                           language tags
```

- **Analysis** (text → YomiScript) is the only language-specific part: resolving readings, homographs, names, numbers and prosody for one language. Lexicons (`.koedict`) and inline reading hints are inputs to this step.
- **YomiScript** describes *how the text should be pronounced*, independent of any voice or engine. It is prescriptive: whoever writes it — an analyzer or a person — decides the pronunciation, and the engine follows it.
- **Voice generation** (YomiScript → audio) needs no language-specific text analysis. A backend only has to render phonemes and prosody.

Adding a language means adding an analyzer (or writing YomiScript by hand). Adding a TTS engine means adding a backend. Neither changes the other.

## YomiScript

- **Phonemes** are plain IPA.
- **Prosody** uses IPA's own marks wherever they exist: pitch accent (`ꜛ` `ꜜ`), Chao tone letters (`˥˧˩`), stress (`ˈ` `ˌ`), length, boundaries and pauses. Languages differ only in which marks they use.
- **Language tags** (BCP 47) apply to a whole utterance (`^en-US|…$`) or to a span inside it (`{ja|…}`), so code-switching is native. Dialects use the same mechanism (e.g. `ja-x-osaka`).
- **Display forms** are optional per-language conveniences (e.g. kana with JSUT-style accent marks for Japanese) that normalize to the IPA form.

Example — an English sentence with Japanese names:

```
^en-US|maɪ ˈfɹɛnd {ja|タ[ナカ} ˈlɪvz ɪn {ja|ト[ーキョー}$
```

YomiScript carries only resolved pronunciations; it has no lexicons or reading hints (D14).

Spec: [`spec/yomiscript/`](spec/yomiscript/) (language tags: [`langtags.md`](spec/yomiscript/langtags.md)). The earlier KOE-IR v0.1 draft is kept in [`spec/koe-ir/`](spec/koe-ir/).

## Lexicons (analysis input)

Lexicons tell an analyzer how to read specific words. They are not part of YomiScript.

- **`.koedict` files** and in-document `@lexicon` / `@import`, with `[context: …]`, `[default]`, `[sex: …]` and `[accent: N]` conditions and dialect sections.
- **Inline reading hints** `{text|reading}` in the source text.
- Reading priority: **inline hint > lexicon entry matching the conditions > `[default]` entry > model inference** ([D1, D13](docs/decisions.md)).

Spec: [`spec/lexicon/`](spec/lexicon/).

## Components

| Component | Role | Location |
|---|---|---|
| **YomiScript** | The language-neutral pronunciation and prosody DSL at the center of the architecture | [`spec/yomiscript/`](spec/yomiscript/) |
| **Lexicons (.koedict)** | Analysis input: human-readable lexicons of readings, accents, dialects and context conditions | [`spec/lexicon/`](spec/lexicon/), [`dict/`](dict/) |
| **Yomi-0** | Japanese analyzer: a small dense model (MLX) that produces readings, pitch accent and phrase boundaries | [`models/yomi/`](models/yomi/) |
| **MoLD** | Mixture of Language-specific Dictionaries: shared weights plus a swappable memory per language or dialect; dictionaries compile into memory without training | [`mold/`](mold/) |
| **Kokoro reference backend** | Synthesizes speech from YomiScript with Kokoro-82M, bypassing its own text analysis; builds F0 from accent/tone marks where appropriate; handles mixed-language utterances | [`tts/kokoro_ys/`](tts/kokoro_ys/) |
| **Browser demo** | YomiScript → speech entirely in the browser (onnxruntime-web) | [`demo/ys_web/`](demo/ys_web/) |
| **Backend plugins** | Adapters from YomiScript to other TTS engines and vendor formats (name TBD) | [`plugins/`](plugins/) |
| **Evaluation** | Benchmarks against baselines (e.g. pyopenjtalk on JSUT) | [`eval/`](eval/) |

### Why so much Japanese?

Japanese is the hardest case for the analysis side, not the focus of the project. Kanji readings are highly ambiguous (homographs, personal and place names), and pitch accent is not written in the text at all. Most of the modeling work so far (Yomi-0, the name and place-name memories, MoLD) is therefore the Japanese analyzer. The YomiScript layer and the backends are designed for every language from the start; the reference backend already handles English, French and Chinese.

## Terminology (D9)

- **Lexicon**: the human-readable `.koedict` / `@lexicon` dictionaries given to the analysis step.
- **Memory**: a key–value memory inside a neural network, used in training and inference.
- **Memory write**: loading a lexicon's contents into a memory.
- Device RAM is always qualified ("unified memory", "RAM usage") to keep it distinct from Memory.

## Documents

- [Decisions D1–D14](docs/decisions.md)
- [Hypotheses H0–H12](docs/hypotheses.md)
- [Contributing](CONTRIBUTING.md)

## License

- Code: Apache License 2.0 ([`LICENSE`](LICENSE))
- Specifications (under `spec/`): CC BY 4.0 ([`spec/LICENSE`](spec/LICENSE))
- Dictionaries and training data follow their own licenses, stated in each file.
