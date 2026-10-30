# @yomiscript/ja-accent

The Japanese dictionary accent of the yomiscript tools (D25). The calling LLM writes only the reading; this package
adds the accent from a dictionary, where the dictionary reads a phrase the same way, so the reading never changes.

```
YomiScript (reading, <t:…>) ─► OpenJTalk's front end on its original text (jpreprocess + NAIST-JDIC, WebAssembly)
                            ─► ꜛ / ꜜ and ` | ` on the accent phrases the dictionary reads the same way
                            ─► realize(…, { markedOnly: true, jaScale: 0.5 }): pitch values for those phrases only
                            ─► Kokoro (its own pitch everywhere else)
```

- Each accent phrase of OpenJTalk (its characters of the text, its morae and their Tokyo H / L) is matched with the
  YomiScript words covering the same characters (by `<t:…>`). When the morae are the same, mora by mora, the phrase
  gets the dictionary's marks. A phrase read another way stays unmarked: that also keeps the dictionary's own
  misreadings out (上手 かみて, 角 かど, 辛い からい are read by OpenJTalk as じょうず, かく, つらい).
- The marks are rendered by the rule Yomite at half strength (`ACCENT_SCALE`), the strength never heard as the worst
  in the listening tests (`eval/browser_tts/trials/accent_marks/README.md`).
- A YomiScript that is not Japanese, has no `<t:…>`, or carries its own `ꜛ ꜜ` or `<f0:…>` is left as it is
  (`needsAccent`).

```ts
import { accentYomite, DICT_URL, withAccent } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";

const step = accentYomite(await nodeAnalyzer({ dir: "/path/to/ja-dict", download: DICT_URL }));
step("ja /kʲoː<t:今日> wa<t:は> ame<t:雨> desɯ<t:です。> ↘/");
// -> ja /kʲo<f0:1.25>ꜜː<f0:-1.4><t:今日> wa<f0:-1.4><t:は> | a<f0:1.25>ꜜme<f0:-1.4><t:雨> de<f0:-1.4>sɯ<f0:-1.4><t:です。> ↘/
const katarite = withAccent(kokoro, async () => step); // the dictionary is loaded the first time Japanese is spoken
```

In the browser, `loadFrontend(load)` takes a loader for the dictionary files and fetches the WebAssembly next to its
glue (`wasm/pkg/frontend_bg.wasm`, through the bundler).

## The dictionary

About 28 MB, downloaded once from Hugging Face ([receptron/yomiscript-ja-dict](https://huggingface.co/receptron/yomiscript-ja-dict),
`DICT_URL`): the eight lindera / jpreprocess dictionary files, each gzipped, under `jpreprocess-0.15.0/`. A dictionary
works only with the jpreprocess version that built it, so it is built by the version the WebAssembly uses:

```bash
sh wasm/build-dict.sh OUT    # cargo install jpreprocess =0.15.0 with naist-jdic; OUT/jpreprocess-0.15.0/*.gz
```

## The WebAssembly

`wasm/` is a small Rust crate around [jpreprocess](https://github.com/jpreprocess/jpreprocess) (OpenJTalk's front
end rewritten in Rust, BSD-3-Clause): `Frontend(bytes, lengths)` builds the dictionary from bytes, `analyze(text)`
returns the words after the front end's rules (NJD, as pyopenjtalk's `run_frontend`) and the full-context labels. Its
build (`wasm/pkg/`, about 1.4 MB) is kept in the repository, so `yarn build` needs no Rust. To rebuild it (Rust 1.88
or later, the `wasm32-unknown-unknown` target and `wasm-bindgen-cli` of the version in `wasm/Cargo.lock`):

```bash
yarn workspace @yomiscript/ja-accent build:wasm
node wasm/notice.mjs         # NOTICE: the licences of the crates compiled into the module
```

Checked (2026-10-30): on the 94 texts of `eval/browser_tts` (hard set and ja parity set), the WebAssembly gives the
same NJD and labels as the native jpreprocess, and the same H / L per mora and accent phrases as pyopenjtalk
(OpenJTalk 1.11), whose output the listening tests used.

## Licence

Apache-2.0. `NOTICE` lists the crates compiled into the WebAssembly and their licences (MIT, Apache-2.0,
BSD-3-Clause, Unicode-3.0). The dictionary's notices (NAIST-JDIC) are in its Hugging Face repository.
