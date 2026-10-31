// The texts of the prosody score: the Japanese sets of eval/browser_tts (the hard set and the Kokoro parity texts),
// and for the accent extractor (accent.py) the first JSUT sentences, whose accents are hand-labelled (jsut-label).
import fs from "fs";
import path from "path";
import { SETS } from "../browser_tts/sets.mjs";

export const JSUT_TEXTS = path.join(process.env.HOME, "yomi_tts/jsut-label/text_kana/basic5000.yaml");

/** { set, name, text } for every Japanese item */
export const items = () => ["hard", "ja"].flatMap((set) => SETS[set].map((x) => ({ set, name: x.name, text: x.text })));

/** { set: "jsut", name, text } for the first n JSUT sentences (BASIC5000_0001 …) */
export function jsut(n) {
  // basic5000.yaml: "BASIC5000_0001:" then indented "text_level0: …" (the text as read), "kana_level0: …"
  const out = [];
  for (const line of fs.readFileSync(JSUT_TEXTS, "utf8").split("\n")) {
    const name = /^(BASIC5000_\d+):/.exec(line),
      text = /^\s+text_level0: (.*)$/.exec(line);
    if (name) out.push({ set: "jsut", name: name[1], text: "" });
    else if (text && out.length) out[out.length - 1].text = text[1].trim();
  }
  return out.slice(0, n);
}
