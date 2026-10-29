# YomiScript Language Tags Addendum (draft)

## 1. Global tag (per utterance)
- Put `^<lang>|` at the start of a line (one utterance). Example: `^en-US|ðə ˈkæt ˈsæt$`
- An untagged `^…$` is `ja` (backward compatibility).
- `<lang>` uses BCP 47 format: `ja` `en-US` `en-GB` `fr` `zh` (in the future, dialects such as `ja-x-osaka` `ja-x-tsugaru` will use the same slot).
- For the file-level default, use the existing header `#yomiscript 0.2 lang=ja-JP`. Precedence is section > line start > header.

## 2. Section tags (code-switching)
- Writing `{<lang>|<text>}` inside an utterance makes only that span be read as YomiScript in another language.
- The text follows that language's rules (ja: kana + `[` `]`; en/fr: IPA + `ˈ ˌ .`; zh: pinyin + tone digits).
- Examples:
  - `^キョ]ーワ#{en-US|mə.ˈʃin ˈlɝ.nɪŋ}ノ#ベ[ンキョーヲ#シ[マ]ス$` (今日は machine learning の勉強をします, "Today I will study machine learning")
  - `^en-US|maɪ ˈfɹɛnd {ja|タ[ナカ} ˈlɪvz ɪn {ja|ト[ーキョー}$`
- Nesting is not allowed. A section boundary also serves as a phrase boundary (`#`). There is only one sentence-final symbol `$` `?` for the whole utterance.
- In YomiScript, braces are used only for language sections. The ruby-style reading hint `{表記|読み}` is an analyzer input and does not appear in YomiScript ([`../lexicon/`](../lexicon/README.md)).

## 3. Handling on the synthesis side (reference implementation mix.py)
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
  - To have it read with English pronunciation, write it as English. Example: `^en-US|wi ˈhæd ˈɹɑ.mən fəɹ ˈlʌnʧ$`
  - To have it read with Japanese pronunciation, write it in a `{ja|…}` section. Example: `^en-US|aɪ ˈeɪt {ja|ス]シ}$`
- Even for the same word, the pronunciation specified by the writer takes precedence. The synthesis engine pronounces it exactly as specified.

## 4. Undecided
- How to count phrase boundaries and pauses (`#` `_`) inside a section.
- How to handle the accent of a particle right after a foreign-language section (e.g. 「ノ」).
- Naming of dialect tags (the `ja-x-osaka` proposal).

## 5. Notation for the dialect tag ja-x-osaka (Keihan-type accent) (proposal)
- Line-start tag `^ja-x-osaka|`. Kana and `#` `_` `]` are the same as for Tokyo-type accent.
- Keihan-type accent is determined by two things, "whether the word starts high or low (high-onset / low-onset)" and "the drop (nucleus)", so it is written as follows:
  - High-onset: put `=` at the start of the phrase (if omitted, it is still treated as high-onset when there is no `[`). Pitch stays flat and high up to the nucleus `]` (level). Examples: 橋が `=ハ]シガ` (high-low-low), 端が `=ハシガ` (high-high-high)
  - Low-onset: `[` marks where the pitch rises. Unlike Tokyo-type accent, `[` can be placed anywhere from the 2nd mora on. Examples: 箸が `ハ[シ]ガ` (low-high-low), 雨が `ア[メ]ガ`, うさぎ `ウサ[ギ`
  - Falls within a mora (e.g. an isolated 「あめぇ」) are not written in v0 (undecided).
- Synthesis side (osaka.py): in the high stretches of high-onset words, the declination is made smaller and flatter than for Tokyo-type accent.
- Sources: 郡史郎『大阪のアクセント（実用的な解説）』大阪大学 2025; Wikipedia 「京阪式アクセント」「日本語の方言のアクセント」 (classification of 2-mora nouns).
