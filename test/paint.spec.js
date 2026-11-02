// The demos' wait for the busy state to be painted (demo/ys_web/web/paint.js): after two animation frames, and not
// held back when animation frames are paused (a hidden tab).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { painted } from "../demo/ys_web/web/paint.js";

const FRAME_MS = 16,
  PAUSED_MS = 1000;
let frames;
const settled = (p) => {
  let done = false;
  p.then(() => (done = true));
  return () => done;
};

beforeEach(() => {
  vi.useFakeTimers();
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (f) => frames.push(f));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const nextFrame = () => frames.splice(0).forEach((f) => f(0));

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
  it("does not resolve before the frames while they are coming", async () => {
    const done = settled(painted());
    await vi.advanceTimersByTimeAsync(FRAME_MS);
    expect(done()).toBe(false);
  });
  it("resolves without animation frames when they are paused", async () => {
    const done = settled(painted());
    await vi.advanceTimersByTimeAsync(PAUSED_MS);
    expect(frames).toHaveLength(1);
    expect(done()).toBe(true);
  });
});
