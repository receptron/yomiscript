// Ask Claude Code or Codex (CLI, no tools) for an answer, and pull the JSON object out of it. Shared by the LLM experiments.
import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";

function callClaude(p, cwd) {
  const r = spawnSync(
    "claude",
    ["-p", "--output-format", "json", "--disallowedTools", "Bash", "Edit", "Write", "Read", "Glob", "Grep", "WebFetch", "WebSearch"],
    { input: p, cwd, encoding: "utf8", maxBuffer: 1 << 26 },
  );
  try {
    const j = JSON.parse(r.stdout);
    return { text: j.result, model: Object.keys(j.modelUsage ?? {}).join(","), outputTokens: j.usage?.output_tokens, err: r.stderr };
  } catch {
    return { text: r.stdout, err: r.stderr };
  }
}
function callCodex(p, cwd) {
  const o = path.join(cwd, "out.txt");
  const r = spawnSync("codex", ["exec", "--skip-git-repo-check", "--ephemeral", "-s", "read-only", "-C", cwd, "-o", o], {
    input: p,
    cwd,
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  const text = fs.existsSync(o) ? fs.readFileSync(o, "utf8") : r.stdout;
  return { text, model: (r.stderr.match(/model:\S*\s+(\S+)/) || [])[1], err: r.stderr };
}
export function call(llm, p) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "llm_yomite_"));
  const t0 = Date.now();
  const { text, model, outputTokens, err } = llm === "claude" ? callClaude(p, cwd) : callCodex(p, cwd);
  fs.rmSync(cwd, { recursive: true, force: true });
  return { text, model, outputTokens, seconds: (Date.now() - t0) / 1000, stderr: text ? "" : err };
}
export function json(text) {
  const a = text?.indexOf("{"),
    b = text?.lastIndexOf("}");
  if (a < 0 || b < a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}
