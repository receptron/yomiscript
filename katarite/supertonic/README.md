# Supertonic 3 Katarite (experimental)

[Supertonic 3](https://github.com/supertone-inc/supertonic) reads characters, not IPA. This Katarite gives it text made
from the YomiScript (`kana.js`):

- `toText(ys, ambiguous, rule)` (with the original text, `<t:…>`, D23): each span as written, except where the engine
  may read it wrong; those spans get their reading from the YomiScript, as kana by pronunciation.
  - rule `ambiguous` (default): a span whose written form, or a 2-8 character form inside it, has more than one reading
    in `ambiguous.json`, or that contains a number, a Latin letter, a symbol or a kanji numeral.
  - rule `kanji`: every span with kanji, numbers or symbols.
- `toKana(ys)` (no `<t:…>`): the whole utterance as kana. は → わ, を → お, ー for every long vowel, っ, ん,
  ‖ → 、 and the sentence ends → 。 / ？. Japanese only: IPA in another language has no spelling to go back to.

Pitch values and accent marks are dropped: Supertonic makes its own prosody.

`ambiguous.json` lists the 12,875 written forms with kanji that IPAdic gives more than one pronunciation (long-vowel
spellings merged), built by `build_ambiguous.py` from the IPAdic CSV files
(github.com/taku910/mecab, `mecab-ipadic/`; copyright Nara Institute of Science and Technology, see its COPYING).
Only this list is derived from it.

`render.mjs` is the command-line form (JSON in, JSON out), used by `eval/browser_tts/audio_supertonic.py --ys`.
The engine runs in Python (`pip install supertonic`) for the comparison; the plan is a TypeScript port
(`docs/plan.md`). Supertonic's weights are under OpenRAIL-M, with use-based restrictions.
