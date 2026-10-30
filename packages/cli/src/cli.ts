#!/usr/bin/env node
// yomiscript: speak YomiScript with a Katarite (see main.ts and README.md).
import { main } from "./main.ts";

async function stdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  let s = "";
  for await (const chunk of process.stdin) s += chunk;
  return s;
}
process.exitCode = await main(process.argv.slice(2), {
  out: (s) => process.stdout.write(s + "\n"),
  err: (s) => process.stderr.write(s + "\n"),
  stdin,
});
