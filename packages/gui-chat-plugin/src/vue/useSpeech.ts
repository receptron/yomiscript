// The state of one spoken result: load and synthesize, play / stop, and the span being spoken (following the audio
// clock with requestAnimationFrame).
import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import type { Speech } from "@yomiscript/core";
import { play, synthesize, type Playback } from "../core/speaker.ts";
import { spanAt } from "../core/timeline.ts";

export type Status = "loading" | "ready" | "playing" | "blocked" | "error";
export interface SpeechState {
  status: Ref<Status>;
  error: Ref<string>;
  current: Ref<number>;
  start: () => Promise<void>;
  stop: () => void;
}

export function useSpeech(yomiscript: () => string | undefined, autoplay: boolean): SpeechState {
  const status = ref<Status>("loading"),
    error = ref(""),
    current = ref(-1);
  let speech: Speech | null = null,
    playback: Playback | null = null,
    raf = 0;
  const stop = () => {
    playback?.stop();
    playback = null;
    cancelAnimationFrame(raf);
    current.value = -1;
    if (status.value === "playing") status.value = "ready";
  };
  const follow = () => {
    if (!playback || !speech) return;
    current.value = spanAt(speech.times, playback.context.currentTime - playback.startedAt);
    raf = requestAnimationFrame(follow);
  };
  const fail = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (speech && /not allowed/.test(msg)) status.value = "blocked";
    else {
      status.value = "error";
      error.value = msg;
    }
  };
  const start = async () => {
    const ys = yomiscript();
    if (!ys) return;
    stop();
    try {
      if (!speech) status.value = "loading";
      speech = await synthesize(ys);
      playback = await play(speech);
      status.value = "playing";
      void playback.ended.then(stop);
      follow();
    } catch (e) {
      fail(e);
    }
  };
  onMounted(() => {
    const ys = yomiscript();
    if (autoplay) void start();
    else if (ys)
      synthesize(ys).then((s) => {
        speech = s;
        status.value = "ready";
      }, fail);
  });
  onBeforeUnmount(stop);
  return { status, error, current, start, stop };
}
