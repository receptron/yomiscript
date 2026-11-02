# Paint the busy state before synthesis in the demos (#33)

## Problem
The demos set a busy state (button disabled, 「生成しています…」) and then `await engine.synth(...)`. Inference runs on
the main thread and blocks it for the whole synthesis, so no frame is painted in between: the page looks unchanged
until the audio plays.

## Fix
`demo/ys_web/web/paint.js` exports `painted()`, which resolves after two animation frames (the second comes after
the first is painted). The four pages that synthesize on a click await it right after setting the busy state:
`announce.html`, `misread.html`, `index.html`, `accent_edit.html`. `misread_site.sh` copies `paint.js` to the public
site with `announce.js`.

## Verified
Requested animation frames from the click, in Chromium: before, the first frame came when synthesis ended; after, the
busy state is on the first frames and stays until synthesis ends. Run on `announce.html` and `misread.html`.
`index.html` and `accent_edit.html` need the repository's `ort/` and local models, which this checkout does not have.

## Out of scope
Synthesis still blocks the page while it runs (no animated spinner). Moving it off the main thread is #34.
