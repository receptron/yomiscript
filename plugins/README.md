# Backend plugins

Plugins that convert YomiScript into TTS engines or each vendor's input format. The name is undecided; for now they are called "YomiScript backend plugins" (D6).

## Proposed interface

```text
interface KoeBackend {
  name: string
  capabilities(): { styles: string[], ipa: bool, lexicon: "pls" | "inline" | "none", accent: bool }
  render(ir: KoeIR, options) -> Audio | VendorRequest
}
```

- **capabilities**: declares the supported styles, the method of reading specification and the lexicon format.
- **render**: converts YomiScript into audio or into each vendor's request (SSML, etc.).
- Unsupported styles fall back to the fallback behavior defined in the spec (ignore, or a close tag), with a warning.

## Conversion examples

| YomiScript | Azure | Amazon Polly | ElevenLabs v3 | OpenAI |
|---|---|---|---|---|
| `[whisper]` | `mstts:express-as style="whispering"` | `amazon:effect name="whispered"` | `[whispers]` | a sentence in instructions |
| `{市\|いち}` | `sub alias` / `phoneme` | `sub` / `phoneme` | IPA | (unverified) |
| `.koedict` | PLS | PLS | PLS | (unverified) |

## Planned implementations

- Plugins for local OSS TTS (Kokoro family, VITS family)
- Our own acoustic model Koe-S (one plugin implementation)
- Export to SSML / PLS
