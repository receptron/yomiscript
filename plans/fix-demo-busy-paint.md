# Paint the busy state before synthesis in the demos (#33)

## Problem
The demos set a busy state (button disabled, 「生成しています…」) and then `await engine.synth(...)`. Inference runs on
the main thread and blocks it for the whole synthesis, so no frame is painted in between: the page looks unchanged
until the audio plays.

## Fix
`demo/ys_web/web/paint.js` exports `painted()`. Its contract is stated as what it guarantees, not as a list of the
cases where animation frames stop:
- synthesis starts within `PAINT_WAIT_MAX_MS` of the call, whatever the browser does with frames;
- the busy state is drawn first whenever the page renders two frames within that bound (the second animation frame
  comes after the first is painted);
- a hidden page resolves at once (no frames, nothing to paint).

A visible page whose frames come later than the bound starts synthesis with the busy state undrawn, as before this
change, rather than risking never starting.

The four pages that synthesize on a click await it right after setting the busy state: `announce.html`,
`misread.html`, `index.html`, `accent_edit.html`; the accent editor also awaits it before the voice input's
`synthSection`. `misread_site.sh` copies `paint.js` to the public site with `announce.js`.

What is synthesized is read after the wait, not before: `announce.html` reads the form then, and `accent_edit.html`'s
`speak` takes a function that writes the YomiScript then, so an edit made during the wait is the one heard. The accent
editor's two play buttons share one in-flight flag (as `misread.html`'s `busy`), so a second play does not start while
one runs.

## Verified
- `test/paint.spec.js`: each clause of the contract, plus no listener or timer left behind. Each test goes red on its
  mutant (no bound, a short bound, one frame, no hidden check, no initial check, no listener removal, no clearTimeout).
- Requested animation frames from the click, in Chromium: before, the first frame came when synthesis ended; after,
  the busy state is on the first frames and stays until synthesis ends. Run on `announce.html` and `misread.html`.
- `announce.html`: the number edited in the same task as the click is the one heard (compared by audio length with
  the previous commit, which spoke the old form); a form made invalid during the wait re-enables the button.
- `index.html` and `accent_edit.html` need the repository's `ort/` and local models, which this checkout does not
  have; they were not run.

## Out of scope
- Synthesis still blocks the page while it runs (no animated spinner). Moving it off the main thread is #34.
- Unchanged and pre-existing in the accent editor: the voice input and the play buttons can overlap on the shared
  Engine, and the editor stays editable during a recording, so a reading can be applied to a version edited meanwhile.
