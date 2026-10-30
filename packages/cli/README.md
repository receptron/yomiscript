# yomiscript

`yomiscript` speaks YomiScript with a Katarite: Kokoro-82M by default, with the fp32 models, which are identical to
the original Kokoro (D21, D22, D24). The YomiScript is checked before any model is loaded, and a parse error prints
the parser's message.

```bash
yomiscript speak "ja /kʲoː<t:今日> wa<t:は> ‖<t:、> ame<t:雨> desɯ<t:です。> ↘/"     # play it
yomiscript speak --out hello.wav "en-US /ˈhɛ.loʊ<t:Hello,> ‖ ˈwɝld<t: world.> ↘/"
echo "ja /ame ↘/" | yomiscript speak                                                 # from stdin
yomiscript speak --file utterance.ys --model w16
yomiscript instructions        # how to write YomiScript: paste it into an LLM's prompt
```

| option | |
|---|---|
| `--out FILE.wav` | write the audio instead of playing it (`--play` to do both) |
| `--katarite NAME` | `kokoro` (default) or `supertonic` (models from `$YOMISCRIPT_SUPERTONIC`, default `~/.cache/supertonic3`; needs `<t:…>`) |
| `--model fp32\|w16` | Kokoro weights: `fp32` (default) or `w16` (fp16 weights, what the browser uses) |
| `--models DIR` | directory with `models/` (`enc.onnx`, `f0n.onnx`, `dec.onnx`, `*_w16.onnx`) and `voices/` (`*.bin`) |
| `--file FILE` | read the YomiScript from a file (`-` = stdin) |

Exit codes: 0 done, 1 the YomiScript or the synthesis failed, 2 the command line is wrong. The text and the timing
go to stderr, for example `一日から三日まで休みです。 (2.90 s of audio in 1.21 s, kokoro)`.

Playback: `afplay` on macOS, `paplay` then `aplay` on Linux. Anywhere else, the audio is written to a temporary WAV
and its path is printed.

## Models

The models are looked up in `--models`, then `$YOMISCRIPT_MODELS`, then `~/.cache/yomiscript/kokoro`. They are not
in the npm package. In this repository, `YOMISCRIPT_MODELS=demo/ys_web` works once the demo's models are exported
(`demo/ys_web/README.md`).

TODO: download the models from Hugging Face into the cache on first use.

## As a library

`yomiscript` also exports what the Node apps share (`runtime.ts`): `openKatarite(name, opts)` (the Katarites by
name; a new one plugs into `KATARITES`), `modelsDir`, `writeWav`, `toWav`, `playWav` and `originalText`. The MCP
server uses them.
