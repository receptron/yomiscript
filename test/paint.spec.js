// The demos' wait for the busy state to be painted (demo/ys_web/web/paint.js): after two animation frames, at once
// on a hidden page, and never longer than its bound, whatever happens to the frames.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { painted, PAINT_WAIT_MAX_MS } from "../demo/ys_web/web/paint.js";

let frames, page, cancelled;
const settled = (p) => {
  let done = false;
  p.then(() => (done = true));
  return () => done;
};
// the frames requested and not cancelled yet, run in order
const nextFrame = () =>
  frames
    .splice(0)
    .filter((f) => !cancelled.has(f.id))
    .forEach((f) => f.run(0));
const hide = () => {
  page.hidden = true;
  page.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  vi.useFakeTimers();
  frames = [];
  cancelled = new Set();
  let id = 0;
  page = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal("requestAnimationFrame", (run) => {
    frames.push({ id: ++id, run });
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (i) => cancelled.add(i));
  vi.stubGlobal("document", page);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("painted", () => {
  it("resolves after the second animation frame, not the first", async () => {
    const done = settled(painted());
    nextFrame();
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(false);
    nextFrame();
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(true);
  });
  it("waits for slow frames on a visible page up to its bound", async () => {
    const done = settled(painted());
    await vi.advanceTimersByTimeAsync(PAINT_WAIT_MAX_MS - 1);
    expect(done()).toBe(false);
    nextFrame();
    nextFrame();
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(true);
  });
  it("resolves at its bound when frames never come on a visible page (the busy state may then go undrawn)", async () => {
    const done = settled(painted());
    await vi.advanceTimersByTimeAsync(PAINT_WAIT_MAX_MS);
    expect(done()).toBe(true);
  });
  it("resolves at once on a hidden page", async () => {
    page.hidden = true;
    const done = settled(painted());
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(true);
  });
  it("resolves when the page is hidden during the wait", async () => {
    const done = settled(painted());
    hide();
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(true);
  });
  it("leaves no listener or timer behind once resolved", async () => {
    const add = vi.spyOn(page, "addEventListener"),
      remove = vi.spyOn(page, "removeEventListener");
    const done = settled(painted());
    nextFrame();
    nextFrame();
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(true);
    const [[type, listener]] = add.mock.calls;
    expect(type).toBe("visibilitychange");
    expect(remove).toHaveBeenCalledWith("visibilitychange", listener); // the very listener it added
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels its pending frame when it resolves early", async () => {
    const done = settled(painted());
    hide();
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(true);
    expect(cancelled.size).toBe(1);
    expect(frames.filter((f) => !cancelled.has(f.id))).toHaveLength(0); // the first frame, cancelled: no second one
  });
});
