// Synthesis runs on the main thread and blocks it until it ends, so a busy state set just before it is never drawn.
/** resolves once the changes made so far are on screen (the second animation frame comes after the first is
 * painted), or at once while the page is hidden: a hidden page gets no animation frames, and nothing to paint */
export const painted = () =>
  new Promise((resolve) => {
    const done = () => {
      document.removeEventListener("visibilitychange", whenHidden);
      resolve();
    };
    const whenHidden = () => document.hidden && done();
    document.addEventListener("visibilitychange", whenHidden);
    requestAnimationFrame(() => requestAnimationFrame(done));
    whenHidden();
  });
