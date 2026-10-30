# Katarite plugins

**Katarite** (語り手, "the narrator") is the module that turns YomiScript into sound (D15). Katarite plugins adapt YomiScript to TTS engines or to each vendor's input format.

## Reference implementation

The Kokoro-82M Katarite in [`packages/kokoro/`](../packages/kokoro/) (used by the browser demo in [`demo/ys_web/`](../demo/ys_web/)) is the reference Katarite. New Katarite plugins should follow its behavior.

- Unsupported styles fall back to the fallback behavior defined in the spec (ignore, or a close tag), with a warning.

## Conversion examples

| YomiScript | Azure | Amazon Polly | ElevenLabs v3 | OpenAI |
|---|---|---|---|---|
| `[whisper]` | `mstts:express-as style="whispering"` | `amazon:effect name="whispered"` | `[whispers]` | a sentence in instructions |
| `/iꜜtɕi/` (resolved pronunciation) | `phoneme` | `phoneme` | IPA | (unverified) |

## Planned implementations

- Plugins for local OSS TTS (Kokoro family, VITS family)
- Export to SSML; export of lexicons (`.koedict`) to PLS is a Yomite-side tool ([`spec/lexicon/`](../spec/lexicon/README.md))
