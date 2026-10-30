# YomiScript Language Tags Addendum (draft)

## 1. Utterance tag
- One utterance is `<lang> /… ↘/` (statement) or `<lang> /… ↗/` (question). Example: `en-US /ðə ˈkæt ˈsæt ↘/`
- The tag is required; there is no implicit default language (D19).
- `<lang>` is a BCP 47 language, optionally with a region: `ja` `en-US` `en-GB` `fr` `zh`. It tells the Katarite which language's speaker pronounces the IPA (voice choice and engine-specific phoneme conventions).
- **No dialect tags.** A dialect (e.g. Osaka) changes how a Yomite assigns pitch; the result is already in the IPA and the pitch values, so it is a Yomite setting, not part of YomiScript (D19, §5).

## 2. Section tags (code-switching)
- Writing `{<lang> <text>}` (language code, a space, then the text) inside an utterance makes only that span be read as YomiScript in another language.
- The text is IPA in every language; only the prosody marks differ (ja: `ꜛ` `ꜜ`; en/fr: `ˈ ˌ .`). zh is still written in pinyin + tone digits in the reference implementation (to be replaced with IPA + tone letters, D17).
- Examples:
  - `ja /kʲoꜜːwa | {en-US mə.ˈʃin ˈlɝ.nɪŋ}no | beꜛŋkʲoːo | ɕiꜛmaꜜsɯ ↘/` (今日は machine learning の勉強をします, "Today I will study machine learning")
  - `en-US /maɪ ˈfɹɛnd {ja taꜛnaka} ˈlɪvz ɪn {ja toꜛːkʲoː} ↘/`
- Nesting is not allowed. A section boundary also serves as an accent phrase boundary (` | `). There is only one sentence-final symbol `↘` `↗` for the whole utterance.
- In YomiScript, braces are used only for language sections. The ruby-style reading hint `{表記|読み}` is a Yomite input and does not appear in YomiScript ([`../lexicon/`](../lexicon/README.md)).

## 3. Handling on the synthesis side (reference implementation mix.py)

In the web reference (`demo/ys_web`) the pitch rules below live in the Yomite (`packages/core/src/yomite.ts`), which writes `<f0:…>` values; the Katarite (`packages/katarite-kokoro`) renders only the values (D18). The Python reference (`tts/kokoro_ys`) still applies them in the synthesizer.
- Each language tag has its own policy:
  - `ja`: build F0 (pitch) from the accent marks and override it
  - `en-US` / `en-GB`: only pass the stress marks; do not override F0 (Kokoro's natural intonation is better)
  - `fr`: leave Kokoro as is (until a change is requested)
  - `zh`: comparing a version that builds F0 from tones with one that leaves Kokoro as is
- Each section is synthesized separately and then joined (v9 onward). Volume is matched to the first section, with a 15 ms crossfade + 60 ms gap. The start of the utterance is not trimmed (to keep the sentence-initial sound).
- The voice is by default the voice of the language of the whole sentence (the matrix language). A single-word foreign-language section uses that language's voice as is, regardless of the sentence language (e.g. meeting in a Japanese sentence, Python in a Chinese sentence). Japanese sections in non-Japanese sentences are excluded from this. Other foreign-language sections use a mixed voice shifted 20% toward that language's voice. Japanese names in an English sentence keep the mixed voice.
- In English sections inside non-Japanese sentences, American t-flapping is not applied (so that the t in meeting / data is pronounced as t).
- In Japanese sections inside non-Japanese sentences, ɨ→u, ɕ→ʃ, ʑ→ʒ, ʨ→ʧ, ʥ→ʤ are substituted (so that the sentence's voice pronounces the Japanese consonants and vowels clearly).
- Per-word adjustments such as long vowels are written in the YomiScript spelling inside the section, not in the conversion rules (e.g. `mə.ˈʃiːn ˈlɝːn.ɪŋ`, `ˈdeɪ.tɑː`). The converter has no blanket long-vowel rule.

## 3a. Writing principle (prescriptive notation)
- YomiScript is a prescriptive notation. Each word is written according to "how you want it pronounced". It is not a record of actual speech or transcription results.
- Loanwords and borrowed words (ramen, sushi, etc.) are written differently depending on which language's pronunciation you want:
  - To have it read with English pronunciation, write it as English. Example: `en-US /wi ˈhæd ˈɹɑ.mən fəɹ ˈlʌnʧ ↘/`
  - To have it read with Japanese pronunciation, write it in a `{ja …}` section. Example: `en-US /aɪ ˈeɪt {ja sɯꜜɕi} ↘/`
- Even for the same word, the pronunciation specified by the writer takes precedence. The synthesis engine pronounces it exactly as specified.

## 4. Undecided
- How to count phrase boundaries and pauses (` | ` ` ‖ `) inside a section.
- How to handle the accent of a particle right after a foreign-language section (e.g. 「ノ」).

## 5. Osaka (Keihan-type accent) as a Yomite setting (proposal)
- Osaka is not tagged in YomiScript (D19). The utterance stays `ja /…/`; the Yomite is told the dialect (in the demo: "Japanese accent: Osaka", `realize(ys, {dialect: {ja: 'osaka'}})`) and writes the pitch values accordingly.
- The marks are the same IPA marks as for Tokyo-type accent. Keihan-type accent is determined by two things, "whether the word starts high or low (high-onset / low-onset)" and "the drop (nucleus)":
  - High-onset: a phrase with no `ꜛ`. Pitch stays flat and high up to the nucleus `ꜜ` (level). Examples: 橋が `haꜜɕiɡa` (high-low-low), 端が `haɕiɡa` (high-high-high)
  - Low-onset: `ꜛ` marks where the pitch rises. Unlike Tokyo-type accent, `ꜛ` can be placed anywhere from the 2nd mora on. Examples: 箸が `haꜛɕiꜜɡa` (low-high-low), 雨が `aꜛmeꜜɡa`, うさぎ `ɯsaꜛɡi`
  - Falls within a mora (e.g. an isolated 「あめぇ」) are not written in v0 (undecided).
- Yomite side (`packages/core/src/yomite.ts`; Python reference: osaka.py): in the high stretches of high-onset words, the declination is made smaller and flatter than for Tokyo-type accent.
- Sources: 郡史郎『大阪のアクセント（実用的な解説）』大阪大学 2025; Wikipedia 「京阪式アクセント」「日本語の方言のアクセント」 (classification of 2-mora nouns).
