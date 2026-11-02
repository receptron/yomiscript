# Paint the busy state before synthesis in the demos (#33)

## Problem
The demos set a busy state (button disabled, 「生成しています…」) and then `await engine.synth(...)`. Inference runs on
the main thread and blocks it for the whole synthesis, so no frame is painted in between: the page looks unchanged
until the audio plays.

## Fix
`demo/ys_web/web/paint.js` exports `painted()`, which resolves after two animation frames (the second comes after
the first is painted), however long they take on a visible page, or at once while the page is hidden (a hidden page
gets no animation frames, and has nothing to paint), so synthesis is never held back by it. The four pages that synthesize on a click await it right after setting the busy state:
`announce.html`, `misread.html`, `index.html`, `accent_edit.html`; the accent editor also awaits it before the voice
input's `synthSection`. `misread_site.sh` copies `paint.js` to the public site with `announce.js`.

What is synthesized is read after the wait, not before: `announce.html` reads the form then, and `accent_edit.html`'s
`speak` takes a function that writes the YomiScript then, so an edit made during the wait is the one heard. The accent
editor's two play buttons share one in-flight flag (as `misread.html`'s `busy`), so a second play does not start while
one runs.

## Verified
- `test/paint.spec.js`: resolves after the second frame and not the first; waits for late frames on a visible page;
  resolves at once on a hidden page and when the page is hidden during the wait; removes its listener. Each goes red on
  its mutant (one frame, no hidden check, no initial check, no listener removal, a timer in place of the hidden check).
- Requested animation frames from the click, in Chromium: before, the first frame came when synthesis ended; after,
  the busy state is on the first frames and stays until synthesis ends. Run on `announce.html` and `misread.html`.
- `announce.html`: the number edited in the same task as the click is the one heard (compared by audio length with
  the previous commit, which spoke the old form).
- `index.html` and `accent_edit.html` need the repository's `ort/` and local models, which this checkout does not
  have; they were not run.

## Out of scope
Synthesis still blocks the page while it runs (no animated spinner). Moving it off the main thread is #34.
