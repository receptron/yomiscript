# KOE-IR 文法（v0.1 草案）

> すべて草案です。アクセント核の位置などの例は説明用で、検証済みの正解ラベルではありません。

## 1. 文法の概要（EBNF風）

```ebnf
document     = { directive } , body ;
directive    = header | dialect_decl | lexicon_decl | import_decl ;
header       = "#koe-ir" , version , [ "lang=" , lang_tag ] ;
dialect_decl = "@dialect" , ident ;
import_decl  = "@import" , string ;                (* 例: "medical@1.2.koedict" *)
lexicon_decl = "@lexicon" , [ "(" , "dialect:" , ident , ")" ] ,
               "{" , entry , { ";" , entry } , [ ";" ] , "}" ;
entry        = surface , "=" , reading , { condition } ;
reading      = kana_with_accent | ipa ;           (* ' はアクセント核の直後 *)
condition    = "[accent:" , int , "]"
             | "[context:" , word , { "," , word } , "]"
             | "[default]" ;

body         = { text | annotation | style_tag | dialect_tag } ;
annotation   = "{" , surface , "|" , reading , "}"   (* 正式形 *)
             | surface , "(" , kana , ")" ;           (* 簡略形: 直前が漢字・英字、中身がかなだけ *)
style_tag    = "[" , ident , "]" | "(" , jp_note , ")" ;
dialect_tag  = "[dialect:" , ident , "]" ;
```

## 2. 例

### スタイルタグと読みの指定

```text
[whisper]シアトルの{市|いち}では、魚が売られている。
```

簡略形 `[whisper]シアトルの市(いち)では、魚が売られている。` は、正規化のときに上の正式形へ書き換え、警告を出します。

出力（テキスト形式の例）：

```text
#koe-ir 0.1 lang=ja-JP
{style=whisper}[シアトルノ]/[イチデワ]、<pause:S> [サカナガ]/[ウラレテ'イル]。{/style}
```

### 英語の略語

```text
{SAP|エスエーピー}の導入と、{SIP|シップ}の設定。
```

### 文脈条件つきの辞書（D13）

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

### アクセント（D7）

```text
@lexicon { 箸 = ハ'シ; 橋 = ハシ'; 端 = ハシ [accent: 0] }
```

`'` はその拍の直後でピッチが下がる位置（アクセント核）です。`[accent: N]` は語頭から数えた核の拍で、0は平板型です（UniDic aType と1対1に対応）。

### 方言（D8）

```text
@dialect kansai
@import "kansai@0.1.koedict"
@lexicon(dialect: kansai) { 橋 = ハ'シ }

「[dialect: kansai]ほんまに?[dialect: standard]」と彼は言った。
```

v0.1は方言タグの枠組みだけを定めます。京阪式の「式」（高起式・低起式）の記法は後の版で定めます。

## 3. 未解決の点

- 複合語・数詞+助数詞のアクセント変化（v0.1の対象外。モデルの推定に任せる）
- スタイル語彙表の正式な一覧と、各社形式への代替動作
- `.koedict` ⇔ PLS（W3C）の変換規則
