// The demos' wait for the busy state to be painted (demo/ys_web/web/paint.js): after two animation frames however
// long they take on a visible page, and not held back on a hidden page, which gets no animation frames.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { painted } from "../demo/ys_web/web/paint.js";

const SLOW_FRAMES_MS = 5000;
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
  it("waits for the frames on a visible page however late they come", async () => {
    const done = settled(painted());
    await vi.advanceTimersByTimeAsync(SLOW_FRAMES_MS);
    expect(done()).toBe(false);
    nextFrame();
    nextFrame();
    await vi.advanceTimersByTimeAsync(0);
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
  it("stops listening for visibility once resolved", async () => {
    const remove = vi.spyOn(page, "removeEventListener");
    const done = settled(painted());
    nextFrame();
    nextFrame();
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(true);
    expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});
