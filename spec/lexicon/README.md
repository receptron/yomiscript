# Lexicon Specification (.koedict, v0.2 draft)

> Lexicons are **not part of YomiScript** (D14). They are an input to **Yomite** (text → YomiScript, D15), which resolves readings and then emits YomiScript. A Yomite may be Yomi-0 + MoLD (Japanese), an LLM, or another analyzer. Katarite never sees a lexicon.
> Everything here is a draft. Readings and accents in the examples are illustrative, not verified ground truth. License: CC BY 4.0 ([`../LICENSE`](../LICENSE)).

```
source text + inline reading hints + lexicons (.koedict)  →  Yomite  →  YomiScript  →  Katarite
```

## 1. Where lexicons are used

- **Lexicon files** (`.koedict`): a file of entries, loaded by Yomite. Examples live in [`dict/`](../../dict/).
- **In-document declarations** in the source text given to Yomite: `@lexicon { … }` and `@import "x.koedict"`.
- **Inline reading hints** in the source text: `{表記|読み}` (full form) and `市(いち)` (short form, normalized to the full form with a warning). These are one-off entries that apply only at that spot.

The output of Yomite is plain YomiScript: pronunciations with prosody marks and language tags ([`../yomiscript/`](../yomiscript/)). None of the constructs above appear in it.

## 2. Grammar (EBNF-like)

The grammar is inherited from KOE-IR v0.1 ([`../koe-ir/grammar.md`](../koe-ir/grammar.md)). v0.2 adds IPA readings and the `[sex: …]` condition.

```ebnf
lexicon_file = { comment } , { lexicon_decl } ;
import_decl  = "@import" , string ;                (* e.g. "medical@1.2.koedict" *)
lexicon_decl = "@lexicon" , [ "(" , "dialect:" , ident , ")" ] ,
               "{" , entry , { ";" , entry } , [ ";" ] , "}" ;
entry        = surface , "=" , reading , { condition } ;
reading      = kana_with_accent                    (* ' goes right after the accent nucleus *)
             | "/" , ipa_yomiscript , "/" ;        (* YomiScript pronunciation, any language *)
condition    = "[accent:" , int , "]"              (* nucleus position in morae, 0 = flat (heiban) *)
             | "[context:" , word , { "," , word } , "]"
             | "[sex:" , ( "male" | "female" ) , "]"      (* new proposal *)
             | "[default]" ;

inline_hint  = "{" , surface , "|" , reading , "}"
             | surface , "(" , kana , ")" ;        (* short form: preceded by kanji or Latin letters *)
```

Each file starts with comment lines giving its license and author.

## 3. Examples

```text
@lexicon {
  橋 = /haɕiꜜ/;            箸 = /haꜜɕi/;          端 = ハシ [accent: 0];
  智 = サトシ [sex: male];  智 = トモ [sex: female]; 智 = サトシ [default];
  SIP = /sɪp/ [context: 通信, VoIP];  SIP = エスアイピー [default]
}
@lexicon(dialect: kansai) { 橋 = ハ'シ }
```

Source text with inline hints, given to Yomite:

```text
{梨奈|リナ}さん、{read|/ɹɛd/}（過去形）
```

## 4. Reading priority (D1, D13)

1. Inline hint `{表記|読み}` (including the short form)
2. Lexicon: in-document `@lexicon` and `@import` together form one tier. Within the tier, `@lexicon` > `@import`, and among `@import`s the later one wins. If the same surface form has several entries: an entry whose conditions match > `[default]`. `[sex: …]` is more specific than `[context: …]` (if both match, the entry with `[sex]` wins).
3. Inference from context by the Yomite (a model such as Yomi-0, or an LLM)

## 5. Dialects (D8)

`@lexicon(dialect: …)` entries apply when that dialect is selected. If there is no entry for the dialect, the standard-language entry is used. How a dialect is selected is a Yomite setting; in YomiScript the result is expressed with language tags such as `ja-x-osaka` ([`../yomiscript/langtags.md`](../yomiscript/langtags.md)).

## 6. Relation to MoLD

- `.koedict` is the only lexicon format that goes into MoLD's Memory. Other lexicons must first be converted to `.koedict`.
- Loading a `.koedict` into MoLD is a memory write (compilation without training, H10, H12). See [`../../mold/`](../../mold/).

## 7. Notes and open questions

- The `[context: 男性]` / `[context: 女性]` in the current `dict/names/given_names.koedict` is a transitional notation and will be replaced with `[sex: male|female]` during conversion.
- Whether `[sex: …]` should have values other than `neutral`/unspecified.
- Conversion rules between `.koedict` and PLS (W3C), for exporting lexicons to vendor TTS services.
