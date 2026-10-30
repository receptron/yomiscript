---
license: bsd-3-clause
language:
- ja
tags:
- yomiscript
- openjtalk
- naist-jdic
---

# yomiscript-ja-dict

The Japanese accent dictionary of [@yomiscript/ja-accent](https://github.com/receptron/yomiscript/tree/main/packages/ja-accent):
NAIST-JDIC (with OpenJTalk's accent fields) in the lindera / jpreprocess format, as built by
[jpreprocess](https://github.com/jpreprocess/jpreprocess) 0.15.0 (`jpreprocess-naist-jdic`). The yomiscript CLI, MCP
server and chat plugin download it the first time they speak Japanese, and use it to add the dictionary's accent to
the phrases whose reading it shares with the YomiScript.

- `jpreprocess-0.15.0/`: the eight dictionary files, each gzipped (about 28 MB). A dictionary only works with the
  jpreprocess version that built it, so a new version goes into a new directory.
- Built with `packages/ja-accent/wasm/build-dict.sh` in the yomiscript repository (this card is `packages/ja-accent/wasm/dict-README.md` there).
- Licence: NAIST-JDIC is under the BSD-style licence of NAIST; see `NOTICE` (the notices `jpreprocess-naist-jdic`
  publishes for the data it includes).
