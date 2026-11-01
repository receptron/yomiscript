// Download the benchmark (JVS-nonpara-kana, Koriyama 2026) at a fixed commit into data/ (gitignored: CC BY-SA 4.0,
// derived from the JVS corpus; see README.md) and check that it is the file the results were measured on.
// usage: node fetch.mjs
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { CSV } from "./items.mjs";

const REPO = "CyberAgentAILab/jvs_nonpara_kana";
const COMMIT = "3c7f1cd936f3b45f4bd78171d8df9feddadc3b33";
const SHA256 = "b637aa3cebf702f221321dd4b1c2b3a259e7f02fc42d1a7c3ce0a3228236d399";
const FILES = ["jvs_nonpara_kana.csv", "LICENSE", "README.md", "eval_cer.py"];

fs.mkdirSync(path.dirname(CSV), { recursive: true });
for (const f of FILES) {
  const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${COMMIT}/${f}`);
  if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
  fs.writeFileSync(path.join(path.dirname(CSV), f), Buffer.from(await r.arrayBuffer()));
}
const sha = crypto.createHash("sha256").update(fs.readFileSync(CSV)).digest("hex");
if (sha !== SHA256) throw new Error(`jvs_nonpara_kana.csv: sha256 ${sha}, expected ${SHA256}`);
console.log(`${REPO}@${COMMIT.slice(0, 7)} -> ${path.dirname(CSV)}`);
