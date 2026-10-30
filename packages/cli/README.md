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
| `--katarite NAME` | `kokoro` (default) or `supertonic` (needs `<t:…>`; models: see below) |
| `--model fp32\|w16` | Kokoro weights: `fp32` (default) or `w16` (fp16 weights, what the browser uses) |
| `--models DIR` | Kokoro models in this directory (`models/{enc,f0n,dec}[_w16].onnx`, `voices/*.bin`), not downloaded |
| `--no-accent` | Kokoro: no Japanese dictionary accent (Kokoro's own pitch everywhere, as the original Kokoro) |
| `--file FILE` | read the YomiScript from a file (`-` = stdin) |

Exit codes: 0 done, 1 the YomiScript or the synthesis failed, 2 the command line is wrong. The text and the timing
go to stderr, for example `一日から三日まで休みです。 (2.90 s of audio in 1.21 s, kokoro)`.

Playback: `afplay` on macOS, `paplay` then `aplay` on Linux. Anywhere else, the audio is written to a temporary WAV
and its path is printed.

## Models

The models are not in the npm package. The first time something is spoken, the files it needs are downloaded into a
cache and read from there afterwards (the progress goes to stderr):

- Kokoro: from [receptron/yomiscript-kokoro](https://huggingface.co/receptron/yomiscript-kokoro) into
  `~/.cache/yomiscript/kokoro` (fp32: 325 MB, plus 0.5 MB per voice). A directory given with `--models` or
  `$YOMISCRIPT_MODELS` is used as it is, with no download; in this repository `YOMISCRIPT_MODELS=demo/ys_web` works
  once the demo's models are exported (`demo/ys_web/README.md`).
- The Japanese accent dictionary (Kokoro, D25, `@yomiscript/ja-accent`): from
  [receptron/yomiscript-ja-dict](https://huggingface.co/receptron/yomiscript-ja-dict) into
  `~/.cache/yomiscript/ja-dict/jpreprocess-0.15.0` (28 MB) the first time Japanese is spoken; `$YOMISCRIPT_JA_DICT`
  is used as it is. With it, the accent phrases the dictionary reads the same way as the YomiScript get the
  dictionary's accent (at half the rules' strength); everything else keeps Kokoro's own pitch. If it cannot be
  loaded, Kokoro's own pitch is used and stderr says so.
- Supertonic: `$YOMISCRIPT_SUPERTONIC` as it is; otherwise the Python SDK's cache `~/.cache/supertonic3` if it has the
  models; otherwise from [Supertone/supertonic-3](https://huggingface.co/Supertone/supertonic-3) into
  `~/.cache/yomiscript/supertonic` (380 MB). Its weights are under OpenRAIL-M, with use-based restrictions.

npm may warn that it did not run `onnxruntime-node`'s install script ("allow-scripts"). The CPU runtime, which is
what yomiscript uses, is in the package itself, so the warning can be ignored; the script only fetches the CUDA (GPU)
libraries on Linux x64.

## As a library

`yomiscript` also exports what the Node apps share (`runtime.ts`): `openKatarite(name, opts)` (the Katarites by
name; a new one plugs into `KATARITES`), `modelsDir`, `kokoroSource`, `supertonicSource`, `writeWav`, `toWav`, `playWav` and `originalText`. The MCP
server uses them.
