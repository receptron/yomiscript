// Writes ../NOTICE: the licence files of every crate compiled into wasm/pkg/frontend_bg.wasm (the normal dependencies
// for wasm32; proc-macro crates only run at build time and are left out), taken from cargo's registry. Run after
// changing wasm/Cargo.toml or Cargo.lock: node wasm/notice.mjs (from packages/ja-accent).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const meta = JSON.parse(
  execFileSync(
    "cargo",
    ["metadata", "--format-version", "1", "--filter-platform", "wasm32-unknown-unknown", "--manifest-path", path.join(here, "Cargo.toml")],
    { encoding: "utf8", maxBuffer: 1 << 26 },
  ),
);

// the packages reachable through normal (not build or dev) dependencies from this crate
const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
const pkgs = new Map(meta.packages.map((p) => [p.id, p]));
const used = new Set(),
  todo = [meta.resolve.root];
while (todo.length) {
  const id = todo.pop();
  if (used.has(id)) continue;
  used.add(id);
  for (const d of nodes.get(id).deps) if (d.dep_kinds.some((k) => k.kind === null)) todo.push(d.pkg);
}
const LICENCE = /^(licen[cs]e|copying|notice)/i;
const crates = [...used]
  .map((id) => pkgs.get(id))
  .filter((p) => p.source && !p.targets.every((t) => t.kind.includes("proc-macro")))
  .sort((a, b) => a.name.localeCompare(b.name));
const out = [
  "@yomiscript/ja-accent includes wasm/pkg/frontend_bg.wasm, compiled from the Rust crates below (wasm/Cargo.lock).",
  "Each crate's licence files follow, as the crate publishes them. The accent dictionary is not part of this package;",
  "it is downloaded from Hugging Face (receptron/yomiscript-ja-dict), whose NOTICE covers NAIST-JDIC.",
  "",
  ...crates.map((p) => `- ${p.name} ${p.version}: ${p.license}`),
];
// each distinct licence text once, with the crates that publish it (most of them share the Apache-2.0 text)
const texts = new Map();
for (const p of crates) {
  const dir = path.dirname(p.manifest_path);
  const files = fs.readdirSync(dir).filter((f) => LICENCE.test(f) && fs.statSync(path.join(dir, f)).isFile());
  if (!files.length) files.push(null);
  for (const f of files.sort()) {
    const text = f ? fs.readFileSync(path.join(dir, f), "utf8").trimEnd() : `(no licence file in the crate; licence: ${p.license})`;
    if (!texts.has(text)) texts.set(text, []);
    const where = f ? ` (${f})` : "";
    texts.get(text).push(`${p.name} ${p.version}${where}`);
  }
}
for (const [text, who] of texts) out.push("", "=".repeat(78), ...who, "=".repeat(78), "", text);
fs.writeFileSync(path.join(here, "..", "NOTICE"), out.join("\n") + "\n");
console.log(`${crates.length} crates`);
