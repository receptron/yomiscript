// The CLI without models: a fake Katarite stands in for Kokoro.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Katarite } from "@yomiscript/core";
import { parseCommand, UsageError } from "../src/args.ts";
import { EXIT, main, type Io } from "../src/main.ts";
import { jaDictSource, kokoroSource, modelsDir, openKatarite, player, supertonicSource } from "../src/runtime.ts";

const JA = "ja /kʲoː<t:今日> wa<t:は> ‖<t:、> ame<t:雨> desɯ<t:です。> ↘/";
const fake = (seconds = 0.5): Katarite => ({
  name: "fake",
  languages: ["ja"],
  speak: async () => ({ samples: new Float32Array(Math.round(24000 * seconds)), sampleRate: 24000, texts: [], times: [] }),
});
function io(stdin?: string, played = true) {
  const out: string[] = [],
    err: string[] = [],
    plays: string[] = [];
  const x: Io = {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    stdin: async () => stdin,
    factories: { kokoro: async () => fake() },
    play: async (f) => (plays.push(f), played),
  };
  return { x, out, err, plays };
}
const tmp = (name: string) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "yomiscript-test-")), name);

describe("command line", () => {
  it("reads speak with its options", () => {
    expect(parseCommand(["speak", JA, "--out", "a.wav", "--model", "w16", "-k", "kokoro"])).toEqual({
      cmd: "speak",
      ys: JA,
      file: undefined,
      out: "a.wav",
      play: false,
      katarite: "kokoro",
      model: "w16",
      models: undefined,
      accent: true,
    });
    expect(parseCommand(["speak", JA])).toMatchObject({ play: true, model: "fp32", katarite: "kokoro" });
    expect(parseCommand(["speak", "--out", "a.wav", "--play"])).toMatchObject({ play: true });
    expect(parseCommand(["speak", JA, "--voice", "jm_kumo"])).toMatchObject({ voice: "jm_kumo" });
    expect(parseCommand(["speak", JA, "--no-accent"])).toMatchObject({ accent: false });
    expect(parseCommand([])).toEqual({ cmd: "help" });
    expect(parseCommand(["instructions"])).toEqual({ cmd: "instructions" });
  });
  it.each([[["speak", "--model", "fp16"]], [["speak", "a", "b"]], [["speak", "a", "--file", "x"]], [["speak", "--nope"]], [["say"]]])("refuses %j", (argv) =>
    expect(() => parseCommand(argv)).toThrow(UsageError),
  );
});

describe("main", () => {
  it("writes the audio with --out and reports the text", async () => {
    const { x, out, err, plays } = io();
    const file = tmp("a.wav");
    expect(await main(["speak", JA, "--out", file], x)).toBe(EXIT.ok);
    expect(fs.readFileSync(file).subarray(0, 4).toString()).toBe("RIFF");
    expect(fs.statSync(file).size).toBe(44 + 2 * 12000);
    expect(out).toEqual([`wrote ${file}`]);
    expect(err[0]).toMatch(/^今日は、雨です。 \(0\.50 s of audio in .* s, fake\)$/);
    expect(plays).toEqual([]);
  });
  it("reads stdin and plays", async () => {
    const { x, plays } = io(JA + "\n");
    expect(await main(["speak"], x)).toBe(EXIT.ok);
    expect(plays).toHaveLength(1);
  });
  it("says where the audio is when it cannot play it", async () => {
    const { x, out } = io(undefined, false);
    expect(await main(["speak", JA], x)).toBe(EXIT.ok);
    expect(out[0]).toMatch(/^cannot play audio here; wrote .*\.wav$/);
  });
  it("prints the parser's message for a bad YomiScript, before loading anything", async () => {
    const { x, err } = io();
    x.factories = {
      kokoro: async () => {
        throw new Error("must not load");
      },
    };
    expect(await main(["speak", "ja /koɾe wa ↘"], x)).toBe(EXIT.failed);
    expect(err[0]).toMatch(/^YomiScript error: missing closing "\/"/);
  });
  it("fails on usage, an empty input and an unknown Katarite", async () => {
    let t = io();
    expect(await main(["speak", "--model", "x"], t.x)).toBe(EXIT.usage);
    expect(t.err[0]).toMatch(/--model must be fp32 or w16/);
    t = io("  ");
    expect(await main(["speak"], t.x)).toBe(EXIT.usage);
    t = io();
    expect(await main(["speak", JA, "-k", "nope"], t.x)).toBe(EXIT.failed);
    expect(t.err[0]).toMatch(/unknown Katarite "nope"/);
  });
  it("prints the instructions", async () => {
    const { x, out } = io();
    expect(await main(["instructions"], x)).toBe(EXIT.ok);
    expect(out[0]).toMatch(/YomiScript/);
  });
});

describe("runtime", () => {
  it("finds the models from the option, then the environment, then the cache", () => {
    expect(modelsDir("/a", { YOMISCRIPT_MODELS: "/b" })).toBe("/a");
    expect(modelsDir(undefined, { YOMISCRIPT_MODELS: "/b" })).toBe("/b");
    expect(modelsDir(undefined, {})).toMatch(/\.cache\/yomiscript\/kokoro$/);
  });
  it("downloads only into the default cache, never into a directory the user named", async () => {
    expect(kokoroSource("/a", {})).toEqual({ dir: "/a" });
    expect(kokoroSource(undefined, { YOMISCRIPT_MODELS: "/b" })).toEqual({ dir: "/b" });
    expect(kokoroSource(undefined, {}, "https://example.com/k/")).toEqual({ dir: modelsDir(undefined, {}), download: "https://example.com/k/" });
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "yomiscript-home-"));
    expect(await supertonicSource({ YOMISCRIPT_SUPERTONIC: "/s" }, home)).toEqual({ dir: "/s" });
    expect(await supertonicSource({}, home, "https://example.com/s/")).toEqual({
      dir: path.join(home, ".cache/yomiscript/supertonic"),
      download: "https://example.com/s/",
    });
    fs.mkdirSync(path.join(home, ".cache/supertonic3/onnx"), { recursive: true }); // the Python SDK's cache is used as it is
    expect(await supertonicSource({}, home)).toEqual({ dir: path.join(home, ".cache/supertonic3") });
    expect(jaDictSource({ YOMISCRIPT_JA_DICT: "/j" }, home)).toEqual({ dir: "/j" });
    expect(jaDictSource({}, home, "https://example.com/j/")).toEqual({
      dir: path.join(home, ".cache/yomiscript/ja-dict/jpreprocess-0.15.0"),
      download: "https://example.com/j/",
    });
  });
  it("opens a Katarite once per settings, and again after a failed load", async () => {
    let n = 0;
    const f = { k: async () => (n++, fake()) };
    await openKatarite("k", { models: "/m1" }, f);
    await openKatarite("k", { models: "/m1" }, f);
    expect(n).toBe(1);
    let fails = 0;
    const g = {
      g: async () => {
        if (fails++ === 0) throw new Error("first fails");
        return fake();
      },
    };
    await expect(openKatarite("g", { models: "/m2" }, g)).rejects.toThrow("first fails");
    await expect(openKatarite("g", { models: "/m2" }, g)).resolves.toBeTruthy();
  });
  it("plays with afplay on macOS and paplay on Linux", () => {
    expect(player("darwin")).toEqual(["afplay"]);
    expect(player("linux")).toEqual(["paplay"]);
    expect(player("win32")).toBeNull();
  });
});
