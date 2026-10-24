# mulmovoice

> **English summary:** mulmovoice is an open, Japanese-first speech front-end project. It defines **KOE-IR**, an open timbre-free intermediate language for TTS (readings, pitch accent, prosody, style tags, dictionaries). It also builds **Yomi-0**, a tiny, fast Japanese text-to-reading/pitch-accent model for Apple Silicon, and **MoLD**, shared weights plus swappable per-language/dialect neural memory. Plugin backends connect KOE-IR to any TTS engine. Status: early design (v0.1 draft).

## ビジョン

日本語の音声合成で「誤読」と「アクセントの崩れ」をなくし、どのTTSエンジンでも同じ書き方で読み・アクセント・話し方を指定できるようにします。小さな改善でも、多くの人の役に立つことを目指します。まず日本語から始め、その後ほかの言語へ広げます。

## 構成要素

| 名前 | 役割 | 場所 |
|---|---|---|
| **KOE-IR** | 声色を含まないTTS用のオープン中間言語。読み `{表記\|読み}`、アクセント、韻律、スタイルタグ（`[whisper]`、`(笑いながら)` など）、辞書（`@lexicon` / `@import` する `.koedict`）を扱う | [`spec/koe-ir/`](spec/koe-ir/) |
| **辞書 (.koedict)** | 人が読み書きできる読み・アクセント・方言・文脈条件の辞書 | [`dict/`](dict/) |
| **Yomi-0** | 日本語のテキストを読み（音素）とアクセントに変換する、小型で密なモデル。Mac（MLX, llama.cpp）で高速に動く | [`models/yomi/`](models/yomi/) |
| **MoLD** | Mixture of Language-specific Dictionaries。共有の重みと、言語・方言ごとに差し替えられるメモリ。辞書は学習なしでメモリにコンパイルできる | [`mold/`](mold/) |
| **バックエンドプラグイン** | KOE-IRを各TTSエンジン・各社の形式へ変換するプラグイン（名前は未定） | [`plugins/`](plugins/) |

読みの優先順位：**その場での指定 `{表記|読み}` > 文脈条件に合う辞書項目 > `[default]` 項目 > モデルによる推定**（[D1](docs/decisions.md)・[D13](docs/decisions.md)）。

## 用語（D9）

- **辞書 (Lexicon)**：KOE-IRの言語側にある、人が読める `.koedict` / `@lexicon`。
- **メモリ (Memory)**：学習・推論で参照されるニューラルネット内部のキー・バリュー型メモリ。
- **書き込み (Memory write)**：辞書の内容をメモリへ読み込むこと。
- 「記憶」という語は使いません。機器のRAMは「ユニファイドメモリ」「RAM使用量」と書いて区別します。

## ドキュメント

- [決定事項 D1–D13](docs/decisions.md)
- [仮説 H0–H12](docs/hypotheses.md)
- [貢献ガイド](CONTRIBUTING.md)

## 状況

設計の初期段階です（KOE-IR v0.1 草案）。構文はすべて草案で、変わる可能性があります。ロードマップは Issues を見てください。

## ライセンス

- コード：Apache License 2.0（[`LICENSE`](LICENSE)）
- 仕様（`spec/` 以下）：CC BY 4.0（[`spec/LICENSE`](spec/LICENSE)）
- 辞書や学習データは、それぞれのライセンスに従います（各ファイルに明記します）。
