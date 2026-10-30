// The command line, parsed without side effects (so it can be tested without models).
import { parseArgs } from "node:util";
import type { ModelPrecision } from "./runtime.ts";

export const USAGE = `usage:
  yomiscript speak [YomiScript]     speak it (from the argument, --file, or stdin)
      --out FILE.wav                write the audio instead of playing it (add --play to do both)
      --play                        play even with --out
      --katarite NAME               kokoro (default) | supertonic
      --model fp32|w16              Kokoro weights: fp32 (default, identical to the original) or w16
      --models DIR                  directory with models/ and voices/ (default: $YOMISCRIPT_MODELS)
      --voice NAME                  a voice for everything (Kokoro: jf_alpha, jm_kumo, af_heart, …)
      --no-accent                   Kokoro: no Japanese dictionary accent (Kokoro's own pitch everywhere)
      --file FILE                   read the YomiScript from a file ("-" = stdin)
  yomiscript instructions           print how to write YomiScript (for an LLM's prompt)
  yomiscript --help`;

export interface SpeakCommand {
  cmd: "speak";
  ys?: string;
  file?: string;
  out?: string;
  play: boolean;
  katarite: string;
  model: ModelPrecision;
  models?: string;
  voice?: string;
  accent: boolean;
}
export type Command = SpeakCommand | { cmd: "instructions" } | { cmd: "help" };

export class UsageError extends Error {}

function speak(rest: string[]): SpeakCommand {
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      play: { type: "boolean" },
      katarite: { type: "string", short: "k", default: "kokoro" },
      model: { type: "string", default: "fp32" },
      models: { type: "string" },
      voice: { type: "string" },
      "no-accent": { type: "boolean" },
      file: { type: "string", short: "f" },
    },
  });
  if (values.model !== "fp32" && values.model !== "w16") throw new UsageError(`--model must be fp32 or w16, not ${values.model}`);
  if (positionals.length > 1) throw new UsageError("give one YomiScript (quote it)");
  if (positionals.length && values.file) throw new UsageError("give the YomiScript or --file, not both");
  return {
    cmd: "speak",
    ys: positionals[0],
    file: values.file,
    out: values.out,
    play: values.play ?? !values.out,
    katarite: values.katarite ?? "kokoro",
    model: values.model,
    models: values.models,
    voice: values.voice,
    accent: !values["no-accent"],
  };
}

export function parseCommand(argv: string[]): Command {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") return { cmd: "help" };
  if (cmd === "instructions") return { cmd: "instructions" };
  if (cmd === "speak") {
    try {
      return speak(rest);
    } catch (e) {
      throw e instanceof UsageError ? e : new UsageError((e as Error).message);
    }
  }
  throw new UsageError(`unknown command "${cmd}"`);
}
