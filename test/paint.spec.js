// The demos' wait for the busy state to be painted (demo/ys_web/web/paint.js): after two animation frames, at once
// on a hidden page, and never longer than its bound, whatever happens to the frames.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { painted, PAINT_WAIT_MAX_MS } from "../demo/ys_web/web/paint.js";

let frames, page;
const settled = (p) => {
  let done = false;
  p.then(() => (done = true));
  return () => done;
};
const nextFrame = () => frames.splice(0).forEach((f) => f(0));
const hide = () => {
  page.hidden = true;
  page.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  vi.useFakeTimers();
  frames = [];
  page = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal("requestAnimationFrame", (f) => frames.push(f));
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
    const remove = vi.spyOn(page, "removeEventListener");
    const done = settled(painted());
    nextFrame();
    nextFrame();
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(true);
    expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});
