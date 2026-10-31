// A blind listening test for the trial, rep 2, three ways (variants.mjs): kokoro, rules, halved.
// usage: node listen.mjs [twopass|onepass|dict]   -> audio/[onepass/]<variant>/<set>.<name>.wav and listen.json there;
//        open listen.html (twopass) or listen.html?test=onepass, served from here
import fs from "fs";
import path from "path";
import { engine, K } from "../../../../demo/ys_web/node.mjs";
import { HERE, sentences } from "./variants.mjs";

const TEST = process.argv[2] ?? "twopass";
const OUT = path.join(HERE, "audio", TEST === "twopass" ? "" : TEST);
const E = await engine("fp32");
const items = [];
for (const { set, name, text, marks, variants } of sentences(TEST)) {
  for (const [key, [y, mode]] of Object.entries(variants)) {
    const dir = path.join(OUT, key);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${set}.${name}.wav`), Buffer.from(K.wav((await E.synth(y, mode)).audio)));
  }
  items.push({ set, name, text, marks: marks.replace(/<t:[^>]*>/g, "") });
  console.log(set, name);
}
fs.writeFileSync(path.join(OUT, "listen.json"), JSON.stringify({ variants: ["kokoro", "rules", "halved"], items }, null, 1));
