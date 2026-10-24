# バックエンドプラグイン

KOE-IRをTTSエンジンや各社の入力形式に変換するプラグインです。名前は未定で、当面は「KOE-IRバックエンドプラグイン」と呼びます（D6）。

## インターフェース案

```text
interface KoeBackend {
  name: string
  capabilities(): { styles: string[], ipa: bool, lexicon: "pls" | "inline" | "none", accent: bool }
  render(ir: KoeIR, options) -> Audio | VendorRequest
}
```

- **capabilities**：対応するスタイル・読み指定の方法・辞書の形式を申告します。
- **render**：KOE-IRを音声、または各社のリクエスト（SSMLなど）に変換します。
- 対応できないスタイルは、仕様で定めた代替動作（無視・近いタグ）に落とし、警告を出します。

## 変換の例

| KOE-IR | Azure | Amazon Polly | ElevenLabs v3 | OpenAI |
|---|---|---|---|---|
| `[whisper]` | `mstts:express-as style="whispering"` | `amazon:effect name="whispered"` | `[whispers]` | instructions の文 |
| `{市\|いち}` | `sub alias` / `phoneme` | `sub` / `phoneme` | IPA | （未確認） |
| `.koedict` | PLS | PLS | PLS | （未確認） |

## 予定する実装

- ローカルのOSS TTS（Kokoro系、VITS系）向けのプラグイン
- 自作の音響モデル Koe-S（プラグイン実装の一つ）
- SSML / PLS への書き出し
