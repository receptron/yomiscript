// Synthesis runs on the main thread and blocks it until it ends, so a busy state set just before it is never drawn.
/** resolves once the changes made so far are on screen: the second animation frame comes after the first is painted */
export const painted = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
