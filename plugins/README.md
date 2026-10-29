# Backend plugins

Plugins that convert YomiScript into TTS engines or each vendor's input format. The name is undecided; for now they are called "YomiScript backend plugins" (D6).

## Reference implementation

The Kokoro-82M backend in [`tts/kokoro_ys/`](../tts/kokoro_ys/) (and the browser demo in [`demo/ys_web/`](../demo/ys_web/)) is the reference implementation of a backend. New backends should follow its behavior.

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
