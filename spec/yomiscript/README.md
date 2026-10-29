# YomiScript Pronunciation Layer Specification (v0.2 draft)

> **YomiScript is the new name for KOE-IR.** The old specification remains as is in [`../koe-ir/`](../koe-ir/) (v0.1).
> This document is a draft that redefines YomiScript as a **language-neutral pronunciation notation (extended IPA)**.
> The accents and tones in the examples are illustrative, not verified ground truth. License: CC BY 4.0 ([`../LICENSE`](../LICENSE)).

## 1. Approach

| Layer | Contents | Language-dependent |
|---|---|---|
| Phoneme layer | IPA (International Phonetic Alphabet) itself | No |
| Prosody layer | IPA extensions: pitch accent, tone, stress, boundaries, pauses | No (only the set of symbols used varies by language) |
| Reading and lexicon layer | `{表記|読み}`, `@lexicon`, `[default]`, `[context: …]`, `[sex: …]` | No (readings can be written in IPA or in each language's display form, e.g. kana) |
| Display form (optional) | For Japanese, kana + JSUT-style symbols | Yes |

- **Symbols that already exist in IPA keep their IPA meaning** (ˈ ˌ ː ‖ | ꜜ ꜛ ˥˧˩, etc.). We add only TTS-oriented conventions that IPA lacks.
- Pronunciations are enclosed in `/…/` (phonemic transcription, not narrow transcription). Narrow transcription in `[…]` is also allowed when needed.
- Kana is the "display form" for Japanese. Lexicon readings may be written in kana; they are converted to IPA form during normalization (conversion rules in §4).

## 2. Symbol list

### 2.1 Phonemes
IPA letters and diacritics are used as is. Length `ː`, devoicing `◌̥` (e.g. `ɯ̥`), palatalization `ʲ`, nasalization `◌̃`.
Syllable separator `.` (optional; in Japanese it is used as the **mora separator**).

### 2.2 Pitch accent (Japanese, etc.)
| Symbol | Meaning | JSUT style |
|---|---|---|
| `ꜛ` | Pitch rise (low → high) | `[` |
| `ꜜ` | Accent nucleus (pitch falls right after the preceding mora) | `]` |
| `[accent: N]` | Nucleus position (in morae, 0 = flat (heiban)). Used as a condition on lexicon entries | Same as the old spec |

`ꜜ` is the IPA downstep symbol and is commonly used to mark the Japanese accent nucleus.

### 2.3 Tone (Chinese, etc.)
- The canonical form is **IPA tone letters** (Chao style) at the end of the syllable: `ma˥˥` (tone 1) `ma˧˥` (tone 2) `ma˨˩˦` (tone 3) `ma˥˩` (tone 4); the neutral tone is `ma˧` or unmarked.
- As a shorthand input form, digits `ma1…ma5` are allowed and normalized in documents that declare `@tones(zh)` (undecided).
- For tone sandhi (tone 3 + tone 3, etc.), the rule is to **write the underlying form**. To write the surface form, specify `[surface]` (undecided).

### 2.4 Stress (English, etc.)
As in IPA, `ˈ` primary stress and `ˌ` secondary stress at the start of the syllable.

### 2.5 Boundaries, pauses, sentence end
| Symbol | Meaning | JSUT style |
|---|---|---|
| Space | Word boundary (optional, for readability) | — |
| ` \| ` | Accent phrase (prosodic word) boundary | `#` |
| ` ‖ ` | Breath group (intonation phrase) boundary, with a pause | `_` |
| `<pause:S/M/L>` `<pause:300ms>` | Explicit pause (inherited from the old spec) | — |
| `↘` / `↗` | Sentence-final fall (declarative) / rise (question) | `$` / `?` |
| Sentence start | No symbol | `^` |

## 3. Relation to readings, lexicon and context conditions

The grammar of the old KOE-IR ([`../koe-ir/grammar.md`](../koe-ir/grammar.md)) remains valid as is. What changes is that `reading` officially accepts the IPA form, and the condition `[sex: …]` is added.

```ebnf
reading   = kana_with_accent | "/" , ipa_yomiscript , "/" ;
condition = "[accent:" , int , "]"
          | "[context:" , word , { "," , word } , "]"
          | "[sex:" , ( "male" | "female" ) , "]"      (* new proposal *)
          | "[default]" ;
```

```text
@lexicon {
  橋 = /haɕiꜜ/;            箸 = /haꜜɕi/;          端 = ハシ [accent: 0];
  智 = サトシ [sex: male];  智 = トモ [sex: female]; 智 = サトシ [default];
  SIP = /sɪp/ [context: 通信, VoIP];  SIP = エスアイピー [default]
}
{梨奈|リナ}さん、{read|/ɹɛd/}（過去形）
```

- Precedence is the same as in the old spec: inline specification > lexicon (matching condition > `[default]`) > model prediction.
- `[sex: …]` is treated as a more specific condition than `[context: …]` (if both match, the entry containing `[sex]` wins). The `[context: 男性]` `[context: 女性]` in the current `dict/names/given_names.koedict` is a transitional notation and will be replaced with `[sex: male|female]` during conversion.
- The only format for lexicons that go into MoLD's Memory is this one (`.koedict`).

## 4. Japanese: converting Yomi output → YomiScript

Yomi currently outputs JSUT style (`^ミ[ズヲ#マ[レ]ーシア…$`). It is converted with the reference implementation [`tools/yomiscript/kana2ipa.py`](../../tools/yomiscript/kana2ipa.py).

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

### 4.3 Conversion examples (from eval/data/jsut_basic5000_subset.jsonl, `--devoice`)
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
#yomiscript 0.2 lang=en-US
I read the book yesterday.
/ˈaɪ ˈɹɛd ðə ˈbʊk | ˈjɛstɚˌdeɪ ↘/

#yomiscript 0.2 lang=zh-CN
你好吗？          /ni˨˩˦ xaʊ˨˩˦ | ma ↗/        (underlying form; surface form is ni˧˥ xaʊ˨˩˦)
妈妈骂马。        /ma˥˥ ma | ma˥˩ ma˨˩˦ ↘/

#yomiscript 0.2 lang=ja-JP
今日は良い天気です。 /kʲoꜜːwa | joꜜi | teꜛŋkidesɯ ↘/
```

## 6. Open questions (to confirm with the user)
1. Canonical form for tones: IPA tone letters (˥˩) or digits (ma3)? Proposal: "canonical form = tone letters; digits also accepted as input".
2. Whether to make the mora separator `.` mandatory in the Japanese canonical form (advantageous for model training and for counting accent positions).
3. **How much allophony to write in YomiScript**, such as devoicing and fricativization of the ザ row (proposal: the phonemic form is canonical, allophones are left to the backend, with an optional flag to output them).
4. Whether to change the header to `#yomiscript`, or also accept `#koe-ir` for compatibility.
5. Whether `[sex: …]` should have values other than `neutral`/unspecified.
6. Whether to move the other parts of the old `spec/koe-ir/` (style tags, etc.) to `spec/yomiscript/` as well.
