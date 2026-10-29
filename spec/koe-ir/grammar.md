# KOE-IR Grammar (v0.1 draft)

> Everything here is a draft. Examples such as accent nucleus positions are illustrative, not verified ground-truth labels.

## 1. Grammar overview (EBNF-like)

```ebnf
document     = { directive } , body ;
directive    = header | dialect_decl | lexicon_decl | import_decl ;
header       = "#koe-ir" , version , [ "lang=" , lang_tag ] ;
dialect_decl = "@dialect" , ident ;
import_decl  = "@import" , string ;                (* e.g. "medical@1.2.koedict" *)
lexicon_decl = "@lexicon" , [ "(" , "dialect:" , ident , ")" ] ,
               "{" , entry , { ";" , entry } , [ ";" ] , "}" ;
entry        = surface , "=" , reading , { condition } ;
reading      = kana_with_accent | ipa ;           (* ' goes right after the accent nucleus *)
condition    = "[accent:" , int , "]"
             | "[context:" , word , { "," , word } , "]"
             | "[default]" ;

body         = { text | annotation | style_tag | dialect_tag } ;
annotation   = "{" , surface , "|" , reading , "}"   (* full form *)
             | surface , "(" , kana , ")" ;           (* short form: preceded by kanji or Latin letters, contents kana only *)
style_tag    = "[" , ident , "]" | "(" , jp_note , ")" ;
dialect_tag  = "[dialect:" , ident , "]" ;
```

## 2. Examples

### Style tags and reading specification

```text
[whisper]シアトルの{市|いち}では、魚が売られている。
```

The short form `[whisper]シアトルの市(いち)では、魚が売られている。` is rewritten into the full form above during normalization, with a warning.

Output (text-format example):

```text
#koe-ir 0.1 lang=ja-JP
{style=whisper}[シアトルノ]/[イチデワ]、<pause:S> [サカナガ]/[ウラレテ'イル]。{/style}
```

### English abbreviations

```text
{SAP|エスエーピー}の導入と、{SIP|シップ}の設定。
```

### Lexicon with context conditions (D13)

```text
@lexicon {
  SIP = シップ [context: 通信, VoIP, 電話];
  SIP = エスアイピー [context: 投資, 積立];
  市 = イチ [context: 朝市, 魚, 市場];
  市 = シ [default]
}

VoIPの電話機でSIPを設定する。      → シップ
毎月のSIPで投資信託を積み立てる。  → エスアイピー
```

### Accent (D7)

```text
@lexicon { 箸 = ハ'シ; 橋 = ハシ'; 端 = ハシ [accent: 0] }
```

`'` marks where the pitch falls right after that mora (the accent nucleus). `[accent: N]` is the nucleus mora counted from the start of the word; 0 is flat (heiban) (one-to-one with UniDic aType).

### Dialect (D8)

```text
@dialect kansai
@import "kansai@0.1.koedict"
@lexicon(dialect: kansai) { 橋 = ハ'シ }

「[dialect: kansai]ほんまに?[dialect: standard]」と彼は言った。
```

v0.1 defines only the framework for dialect tags. Notation for the Keihan-type "register" (high-onset / low-onset) will be defined in a later version.

## 3. Open questions

- Accent changes in compounds and numeral + counter combinations (out of scope for v0.1; left to model prediction)
- The official list of the style vocabulary table, and fallback behavior for each vendor's format
- Conversion rules between `.koedict` ⇔ PLS (W3C)
