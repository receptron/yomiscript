// Synthesis runs on the main thread and blocks it until it ends, so a busy state set just before it is never drawn.
// A hidden tab pauses animation frames; past this, the wait ends without them so synthesis is not held back.
const HIDDEN_FALLBACK_MS = 250;
/** resolves once the changes made so far are on screen (the second animation frame comes after the first is
 * painted), or after HIDDEN_FALLBACK_MS while animation frames are paused */
export const painted = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
    setTimeout(resolve, HIDDEN_FALLBACK_MS);
  });
