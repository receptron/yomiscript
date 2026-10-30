// The CLI's work, with its inputs and outputs passed in (the bin, cli.ts, gives it the real ones).
import fs from "node:fs/promises";
import { YOMISCRIPT_INSTRUCTIONS } from "@mulmovoice/core";
import { parseCommand, UsageError, USAGE, type SpeakCommand } from "./args.ts";
import { durationOf, openKatarite, originalText, playWav, writeWav, KATARITES, type KatariteFactory } from "./runtime.ts";

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  /** all of stdin, or undefined when it is a terminal */
  stdin: () => Promise<string | undefined>;
  factories?: Readonly<Record<string, KatariteFactory>>;
  play?: (file: string) => Promise<boolean>;
}
/** exit codes: 0 done, 1 the YomiScript or the speaking failed, 2 the command line is wrong */
export const EXIT = { ok: 0, failed: 1, usage: 2 } as const;

async function readYomiScript(c: SpeakCommand, io: Io): Promise<string> {
  if (c.ys !== undefined) return c.ys;
  const text = c.file && c.file !== "-" ? await fs.readFile(c.file, "utf8") : await io.stdin();
  if (!text?.trim()) throw new UsageError("no YomiScript (give it as an argument, with --file, or on stdin)");
  return text.trim();
}

async function speak(c: SpeakCommand, io: Io): Promise<number> {
  const ys = await readYomiScript(c, io);
  let text: string;
  try {
    text = originalText(ys); // the parser's message is what the writer of the YomiScript needs
  } catch (e) {
    io.err(`YomiScript error: ${(e as Error).message}`);
    return EXIT.failed;
  }
  const t0 = Date.now();
  const k = await openKatarite(c.katarite, { model: c.model, models: c.models, voice: c.voice }, io.factories ?? KATARITES);
  const s = await k.speak(ys);
  const took = (Date.now() - t0) / 1000;
  const file = await writeWav(s, c.out);
  if (c.out) io.out(`wrote ${file}`);
  const played = c.play && (await (io.play ?? playWav)(file));
  if (c.play && !played && !c.out) io.out(`cannot play audio here; wrote ${file}`);
  io.err(`${text ? text + " " : ""}(${durationOf(s).toFixed(2)} s of audio in ${took.toFixed(2)} s, ${k.name})`);
  return EXIT.ok;
}

export async function main(argv: string[], io: Io): Promise<number> {
  try {
    const c = parseCommand(argv);
    if (c.cmd === "help") {
      io.out(USAGE);
      return EXIT.ok;
    }
    if (c.cmd === "instructions") {
      io.out(YOMISCRIPT_INSTRUCTIONS);
      return EXIT.ok;
    }
    return await speak(c, io);
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`${e.message}\n\n${USAGE}`);
      return EXIT.usage;
    }
    io.err((e as Error).message);
    return EXIT.failed;
  }
}
