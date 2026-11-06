# @yomiscript/ja-accent

The Japanese dictionary accent of the yomiscript tools (D25, D27, D31). The calling LLM writes only the reading; this
package adds the accent from a dictionary, looked up with the YomiScript's own words and readings, so the reading
never changes.

```
YomiScript (reading, <t:…>) ─► every NAIST-JDIC entry of the sentence (jpreprocess, WebAssembly)
                            ─► the cheapest path of entries that reads as the YomiScript does
                            ─► OpenJTalk's rules on that path (accent phrases, accent combination)
                            ─► ꜛ / ꜜ and ` | ` on the accent phrases
                            ─► realize(…, { markedOnly: true }): pitch values for those phrases only
                            ─► Kokoro (its own pitch everywhere else)
```

- The LLM has already split the text into words (`<t:…>`) and read each one from the context, so OpenJTalk does not
  analyse the text again (D31, `src/lookup.ts`). Every entry of the system and user dictionaries in the sentence is
  listed with its morae and costs (`candidates`), and the cheapest path (OpenJTalk's word and connection costs,
  `conn`) is taken whose morae read as the YomiScript does, with the same number of morae at every word boundary.
  An entry may cross a boundary (の|で read as one ので); a word of another language takes any entries; an entry
  starting inside a word joins the accent phrase before, so a word is never split between two phrases. OpenJTalk's
  rules then run on the path (`label`), and each accent phrase is matched with the YomiScript words covering the
  same characters (by `<t:…>`) and gets the dictionary's marks.
- A YomiScript that writes its own accent phrases (` | `) keeps them (D32): each word after a ` | ` or ` ‖ ` starts a
  phrase and every other word joins the one before, and OpenJTalk's accent combination runs on those phrases.
- A word that no entry reads the YomiScript's way (捕えて つかまえて; numbers with a counter, 9時, whose readings
  OpenJTalk's digit rules make after the dictionary) is taken as OpenJTalk's analysis reads it, at a large cost, so
  only where nothing else fits; its phrase is then read another way and stays unmarked. Spellings that do not change
  a mora are the same (`hi` / `çi`, `z` / `dz`, `kj` / `kʲ`, `v` / `b`).
- `accentMarks(ys, a, { analysis: true })` is the earlier way (D25, D27): OpenJTalk analyses the text
  (`analyze`) and only the phrases it reads the same way are marked (`stats.misses` of `writeMarks` lists the
  others). It loses the words the LLM reads from the context (市 いち: OpenJTalk reads し).
- The marks are rendered by the rule Yomite at full strength (`ACCENT_SCALE`): three values per mora from the marks
  of the whole sentence (D28, D29, `jaContour` in `@yomiscript/core`). D25 had half and D27 three quarters of the earlier
  phrase rule, whose values were heard as too strong above 1.
- A YomiScript that is not Japanese, has no `<t:…>`, or carries its own `ꜛ ꜜ` or `<f0:…>` does not go to the dictionary
  (`needsAccent`). `withAccent` gives one with Japanese accent marks of its own and no values the values of the linear model
  for those marks, without the dictionary (`needsValues`, `writtenAccent`, D36); it leaves the others as they are.

```ts
import { accentYomite, DICT_URL, withAccent } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";

const step = accentYomite(await nodeAnalyzer({ dir: "/path/to/ja-dict", download: DICT_URL }));
step("ja /kʲoː<t:今日> wa<t:は> ame<t:雨> desɯ<t:です。> ↘/");
// -> ja /kʲo<f0:1.88>ꜜː<f0:-2.1><t:今日> wa<f0:-2.1><t:は> | a<f0:1.88>ꜜme<f0:-2.1><t:雨> de<f0:-2.1>sɯ<f0:-2.1><t:です。> ↘/
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

### The user dictionary

`src/userdict.ts` (`USER_DICT`) is a short list of rows in NAIST-JDIC's CSV format, built into the front end next to
the system dictionary when it loads (no file to download). Each row is NAIST-JDIC's own entry for a reading, with a
lower cost, where NAIST-JDIC prefers a reading LLMs do not write (日本 ニッポン over ニホン): with the analysis of D25
and D27 the dictionary then agrees with the YomiScript, so the phrase gets its accent (`{ analysis: true }`; the
lookup of D31 takes the YomiScript's reading of a word from any entry that has it). The reading spoken is still the YomiScript's. A row is a decision
(D27 in `docs/decisions.md`): take it from NAIST-JDIC (the source is
[jpreprocess/naist-jdic](https://github.com/jpreprocess/naist-jdic) v0.1.3) rather than writing an accent by hand,
and measure it with `eval/prosody_ref` (`node mismatch.mjs` lists the phrases read another way).

## The pitch model

`pitchYomite(analyzer, model)` is `accentYomite` with predicted values (D33): the dictionary's marks stay, and each mora's
three values come from a small LSTM trained on Qwen3-TTS's pitch (`eval/qwen_prosody`), in plain TypeScript, with no
other dependency. It is not on by default.

```ts
import { PITCH_URL, PITCH_VERSION, pitchYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer, nodePitchModel } from "@yomiscript/ja-accent/node";

const model = await nodePitchModel({ dir: `${cache}/ja-pitch/${PITCH_VERSION}`, download: PITCH_URL });
const step = pitchYomite(await nodeAnalyzer({ dir }), model);
```

`pitchOrAccentYomite(a, loadModel, onError)` falls back to the dictionary accent when the model cannot be loaded; the CLI, the MCP server and the plugin use it by default (off with `--no-pitch`, `YOMISCRIPT_PITCH=0`, `pitchBase: null`).

In the browser, `loadPitchModel(load)` takes any `LoadBytes`. The model (8 MB, CC BY-SA 4.0) is not part of this
package; it is downloaded from Hugging Face ([receptron/yomiscript-ja-pitch](https://huggingface.co/receptron/yomiscript-ja-pitch), `PITCH_URL`).

## The WebAssembly

`wasm/` is a small Rust crate around [jpreprocess](https://github.com/jpreprocess/jpreprocess) (OpenJTalk's front
end rewritten in Rust, BSD-3-Clause): `Frontend(bytes, lengths, user)` builds the dictionary from bytes (and the user
dictionary from CSV rows), `analyze(text)`
returns the words after the front end's rules (NJD, as pyopenjtalk's `run_frontend`) and the full-context labels;
`candidates(words)`, `conn(r, l)` and `label(request)` are the lookup of D31 (`analyze` is built on the same tokenizer
and gave the same NJD and labels as jpreprocess's own on 3,120 texts, 2026-11-01). Its
build (`wasm/pkg/`, about 1.5 MB) is kept in the repository, so `yarn build` needs no Rust. To rebuild it (Rust 1.88
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
