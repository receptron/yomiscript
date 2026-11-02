// Synthesis runs on the main thread and blocks it until it ends, so a busy state set just before it is never drawn.
// The wait is bounded rather than tied to the cases where frames stop (a hidden page, a paused embedding): a page whose
// frames come later than this starts synthesis without the busy state drawn, which is better than never starting it.
export const PAINT_WAIT_MAX_MS = 1000;
/** resolves once the changes made so far are on screen (the second animation frame comes after the first is
 * painted), at once while the page is hidden (no frames, nothing to paint), and after PAINT_WAIT_MAX_MS at most */
export const painted = () =>
  new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", whenHidden);
      resolve();
    };
    const whenHidden = () => document.hidden && done();
    const timer = setTimeout(done, PAINT_WAIT_MAX_MS);
    document.addEventListener("visibilitychange", whenHidden);
    requestAnimationFrame(() => requestAnimationFrame(done));
    whenHidden();
  });
