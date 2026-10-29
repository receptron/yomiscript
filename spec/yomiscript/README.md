# YomiScript Pronunciation Layer Specification (v0.2 draft)

> **YomiScript is the new name for KOE-IR.** The old specification remains as is in [`../koe-ir/`](../koe-ir/) (v0.1).
> This document is a draft that redefines YomiScript as a **language-neutral pronunciation notation (extended IPA)**.
> The accents and tones in the examples are illustrative, not verified ground truth. License: CC BY 4.0 ([`../LICENSE`](../LICENSE)).

## 1. Approach

| Layer | Contents | Language-dependent |
|---|---|---|
| Phoneme layer | IPA (International Phonetic Alphabet) itself | No |
| Prosody layer | IPA extensions: pitch accent, tone, stress, boundaries, pauses | No (only the set of symbols used varies by language) |

- **Symbols that already exist in IPA keep their IPA meaning** (ˈ ˌ ː ‖ | ꜜ ꜛ ˥˧˩, etc.). We add only TTS-oriented conventions that IPA lacks.
- Pronunciations are enclosed in `/…/` (phonemic transcription, not narrow transcription). Narrow transcription in `[…]` is also allowed when needed.
- **No language-specific scripts.** Kana, pinyin or any other native writing system is not YomiScript (D17). Japanese is written in IPA like every other language. A Yomite that produces kana labels (such as Yomi-0 today) converts them to IPA before emitting YomiScript (§4).
- YomiScript holds **resolved** pronunciations only. Readings, lexicons and inline reading hints belong to Yomite, the step before YomiScript and are specified separately (§3).

## 2. Symbol list

### 2.1 Phonemes
IPA letters and diacritics are used as is. As in IPA, the letter g may be written `ɡ` (U+0261) or `g`; both mean the same (pinyin, still used for Chinese, keeps its own `g`). Length `ː`, devoicing `◌̥` (e.g. `ɯ̥`), palatalization `ʲ`, nasalization `◌̃`.
Syllable separator `.` (optional; in Japanese it is used as the **mora separator**).

### 2.2 Pitch accent (Japanese, etc.)
| Symbol | Meaning | Yomi-0 kana label (Yomite-internal) |
|---|---|---|
| `ꜛ` | Pitch rise (low → high) | `[` |
| `ꜜ` | Accent nucleus (pitch falls right after the preceding mora) | `]` |

`ꜜ` is the IPA downstep symbol and is commonly used to mark the Japanese accent nucleus.

### 2.3 Tone (Chinese, etc.)
- The canonical form is **IPA tone letters** (Chao style) at the end of the syllable: `ma˥˥` (tone 1) `ma˧˥` (tone 2) `ma˨˩˦` (tone 3) `ma˥˩` (tone 4); the neutral tone is `ma˧` or unmarked.
- As a shorthand input form, digits `ma1…ma5` are allowed and normalized in documents that declare `@tones(zh)` (undecided).
- For tone sandhi (tone 3 + tone 3, etc.), the rule is to **write the underlying form**. To write the surface form, specify `[surface]` (undecided).

### 2.4 Stress (English, etc.)
As in IPA, `ˈ` primary stress and `ˌ` secondary stress at the start of the syllable.

### 2.5 Utterance, boundaries, pauses, sentence end
| Symbol | Meaning | Yomi-0 kana label (Yomite-internal) |
|---|---|---|
| Space | Word boundary (optional, for readability) | — |
| ` \| ` | Accent phrase (prosodic word) boundary | `#` |
| ` ‖ ` | Breath group (intonation phrase) boundary, with a pause | `_` |
| `<pause:S/M/L>` `<pause:300ms>` | Explicit pause (inherited from the old spec) | — |
| `↘` / `↗` | Sentence-final fall (declarative) / rise (question) | `$` / `?` |
| `<lang> /…/` | One utterance: BCP 47 language tag, then the pronunciation between slashes (D19) | `^…$` |
| ` ↘ ` / ` ↗ ` inside an utterance | A sentence end within the utterance (e.g. two sentences on one line) (D21) | — |
| `<p:…>` | Punctuation the engine uses as a prosodic cue, passed through where it stands: `<p:!>` `<p:;>` `<p::>` `<p:—>` `<p:...>` `<p:“>` `<p:(>` … If the utterance ends with one, the final `↘` / `↗` adds nothing (D21) | — |

### 2.6 Pitch values (phonetic layer)
| Notation | Meaning |
|---|---|
| `<f0:v>` | Pitch target for the unit (mora or syllable) right before it, in semitones relative to the speaker's register |
| `<f0:v1,v2,…>` | A contour across that unit (points spread evenly over its duration) |

- YomiScript can carry **both** the phonological marks of §2.2–2.4 (`ꜛ` `ꜜ`, `ˈ` `ˌ`, tones) and these values (D18). Example: `ja /kʲo<f0:2.5>ꜜː<f0:-2.8>wa<f0:-2.8> ↘/`.
- **Katarite uses only the values.** It never turns marks into pitch, because that needs language rules (Tokyo vs Osaka, declination, stress patterns). A Yomite writes the values: an LLM can write them directly together with the IPA and marks (`eval/llm_yomite`), or a Yomite can fill them from rules or a prosody predictor (e.g. Kokoro's, run on the Yomite side), or by hand. The Yomite is one module, not split into stages (D20).
- A unit without a value has no pitch target; the Katarite fills it from its engine's own F0 (interpolated between targets). Devoiced units (`◌̥`) normally have no value.
- Values are relative: the Katarite anchors each phrase (` | `, ` ‖ `) to the voice's natural level, so the same YomiScript works with any voice.

## 3. Readings and lexicons (not part of YomiScript)

Choosing a reading is text analysis, so it happens before YomiScript (D14). Inline reading hints `{表記|読み}`, `@lexicon` / `@import`, `.koedict` files, the conditions `[context: …]`, `[default]`, `[sex: …]`, `[accent: N]`, and the reading priority are all inputs to Yomite. They are specified in [`../lexicon/`](../lexicon/README.md).

The braces `{…|…}` in YomiScript mean only a language section ([`langtags.md`](langtags.md)).

## 4. Japanese in IPA, and converting kana labels (Yomite side)

Japanese YomiScript is IPA with `ꜛ` (rise) and `ꜜ` (accent nucleus), e.g. `ja /kʲoꜜːwa | aꜜmeɡa ↘/`. Kana does not appear in YomiScript.

Yomi-0 currently outputs kana labels in JSUT style (`^ミ[ズヲ#マ[レ]ーシア…$`). That is Yomite-internal: the labels are converted to YomiScript with the reference converter [`tools/yomiscript/kana2ipa.py`](../../tools/yomiscript/kana2ipa.py).

### 4.1 Mora → IPA (main part)
| Row | a-column | i-column | u-column | e-column | o-column | Contracted (ャュョ) |
|---|---|---|---|---|---|---|
| ア | a | i | ɯ | e | o | |
| カ/ガ | ka/ɡa | ki/ɡi | kɯ/ɡɯ | ke/ɡe | ko/ɡo | kʲa kʲɯ kʲo / ɡʲ… |
| サ/ザ | sa/dza | ɕi/dʑi | sɯ/dzɯ | se/dze | so/dzo | ɕa ɕɯ ɕo / dʑa… |
| タ/ダ | ta/da | tɕi/dʑi | tsɯ/dzɯ | te/de | to/do | tɕa tɕɯ tɕo |
| ナ | na | ɲi | nɯ | ne | no | ɲa ɲɯ ɲo |
| ハ/バ/パ | ha/ba/pa | çi/bi/pi | ɸɯ/bɯ/pɯ | he/be/pe | ho/bo/po | ça…, bʲa…, pʲa… |
| マ | ma | mi | mɯ | me | mo | mʲa… |
| ヤ・ワ | ja / wa | | jɯ | | jo / ヲ=o | |
| ラ | ɾa | ɾi | ɾɯ | ɾe | ɾo | ɾʲa… |

Loanword sounds: ティ ti, ディ di, トゥ tɯ, ファ ɸa, フィ ɸi, ウィ wi, ウェ we, ウォ wo, ツァ tsa, ヴァ va, テュ tʲɯ, etc.
The ザ row is often realized as the fricative [z] word-medially, but the phonemic transcription uses `dz` / `dʑ` throughout (undecided: whether to distinguish word-initial and word-medial).

### 4.2 Special morae
| Mora | Rule | Example |
|---|---|---|
| ッ (geminate) | Double the following consonant. Before tɕ/ts, use `t`. Before a vowel or at sentence end, `ʔ` | キッテ /kitte/, マッチ /mattɕi/, アッ /aʔ/ |
| ン (moraic nasal) | `m` before bilabials, `n` before alveolars (t d n ɾ dz), `ɲ` before palatals (tɕ dʑ ɲ), `ŋ` before velars, `ɴ` before vowels, semivowels, fricatives and at sentence end (actually a nasal vowel) | サンポ /sampo/, テンキ /teŋki/, ホンヤ /hoɴja/ |
| ー (long vowel) | `ː` on the preceding vowel | トーキョー /toːkʲoː/ |
| Vowel devoicing | **Optional** (`--devoice`). `◌̥` on i and ɯ between voiceless consonants, and on the ɯ of sentence-final 「ス」 | デス /desɯ̥/, キシャ /ki̥ɕa/ |

To keep mora separators, use `--mora` to insert `.` (the long-vowel `ː` attaches to the preceding mora): `/toꜜː.kʲoː/`.

### 4.3 Conversion examples (kana label → YomiScript; from eval/data/jsut_basic5000_subset.jsonl, `--devoice`)
```
水をマレーシアから買わなくてはならないのです。
^ミ[ズヲ#マ[レ]ーシアカラ#カ[ワナ]クテワ#ナ[ラ]ナイノデス$
/miꜛdzɯo | maꜛɾeꜜːɕiakaɾa | kaꜛwanaꜜkɯ̥tewa | naꜛɾaꜜnainodesɯ̥ ↘/

気前の良いその歯科医は、およそ２０億円を、慈善事業に寄付した。
^キ[マエノヨ]イ#ソ[ノ#シ[カ]イワ_オ[ヨソ#ニ[ジューオ]クエンヲ_ジ[ゼンジ]ギョーニ#キ]フシタ$
/kiꜛmaenojoꜜi | soꜛno | ɕi̥ꜛkaꜜiwa ‖ oꜛjoso | ɲiꜛdʑɯːoꜜkɯeɴo ‖ dʑiꜛdzeɲdʑiꜜɡʲoːɲi | ki̥ꜜɸɯ̥ɕi̥ta ↘/
```
(Known limitation: because the rules are simple, an accent mark and devoicing can land on the same position, as in ɕi̥ꜛ of 「歯科」. Actual devoicing also depends on the nucleus position.)

## 5. Examples in other languages

```text
I read the book yesterday.
en-US /ˈaɪ ˈɹɛd ðə ˈbʊk | ˈjɛstɚˌdeɪ ↘/

你好吗？
zh /ni˨˩˦ xaʊ˨˩˦ | ma ↗/        (underlying form; surface form is ni˧˥ xaʊ˨˩˦)
妈妈骂马。
zh /ma˥˥ ma | ma˥˩ ma˨˩˦ ↘/

今日は良い天気です。
ja /kʲoꜜːwa | joꜜi | teꜛŋkidesɯ ↘/
```

## 6. Open questions (to confirm with the user)
1. Canonical form for tones: IPA tone letters (˥˩) or digits (ma3)? Proposal: "canonical form = tone letters; digits also accepted as input".
2. Whether to make the mora separator `.` mandatory in the Japanese canonical form (advantageous for model training and for counting accent positions).
3. **How much allophony to write in YomiScript**, such as fricativization of the ザ row. Decided for pronunciation choices: the Yomite writes vowel devoicing (`◌̥`) and the American t/d flap (`ɾ`) explicitly, and the Katarite does not apply them (D18).
4. Whether to change the header to `#yomiscript`, or also accept `#koe-ir` for compatibility.
5. Whether to move the other parts of the old `spec/koe-ir/` (style tags, etc.) to `spec/yomiscript/` as well.
