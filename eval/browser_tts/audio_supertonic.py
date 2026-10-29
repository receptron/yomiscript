"""Supertonic 3 (raw text in, no front end), for listening.

  (default)   every set as written: audio/supertonic/<set>.<name>.wav
  --hints     the hard set's homographs with the intended word replaced by its reading in hiragana (the note in
              hard_set.tsv, e.g. 一日=ついたち): what "plain text plus hints" gives an engine that reads raw text
              -> audio/supertonic_hints/hard.<name>.wav
  --kana      the hard set's homographs written entirely in hiragana (the gold reading) -> audio/supertonic_kana/hard.<name>.wav
  --ys LLM [RULE]  the Supertonic Katarite: the LLM's YomiScript (results/<LLM>.<set>.json) rendered as text by
              katarite/supertonic/kana.js: all kana (no RULE), or the original text (D23) with kana where RULE says
              (ambiguous, kanji) -> audio/supertonic_ys_<LLM>[_<RULE>]/<set>.<name>.wav

usage: python audio_supertonic.py [--hints | --kana | --ys claude|codex [ambiguous|kanji]]
       (python with supertonic installed; downloads the model on first use)
"""

import json
import re
import subprocess
import sys
import time
from pathlib import Path

from supertonic import TTS

HERE = Path(__file__).parent


HINT = re.compile(r"^([^=、。\s]+)=([ぁ-ゖー]+)")


def hiragana(kata):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in kata)


def hinted(items, how):
    # homographs only; the note names the word and its intended reading
    notes = {l.split("\t")[0]: l.split("\t")[4] for l in (HERE.parent / "data/hard_set.tsv").read_text().splitlines() if l and not l.startswith("#")}
    out = []
    for x in items:
        m = HINT.match(notes.get(x["name"], ""))
        if x["category"] != "homograph" or not m:
            continue
        text = x["text"].replace(m[1], m[2], 1) if how == "hints" else hiragana(x["gold"][0])
        out.append({**x, "text": text})
    return out


def katarite(sets, llm, rule):
    # the same YomiScript Kokoro is given, as text; English needs the original text (a rule), IPA has no spelling to go back to
    out = {}
    for name in ("ja", "hard", "en") if rule else ("ja", "hard"):
        R = json.loads((HERE / f"results/{llm}.{name}.json").read_text())
        items = [x for x in sets[name] if R["output"].get(x["name"])]
        ys = [R["output"][x["name"]] for x in items]
        kana = json.loads(
            subprocess.run(
                ["node", str(HERE.parents[1] / "katarite/supertonic/render.mjs"), *([rule] if rule else [])],
                input=json.dumps(ys),
                capture_output=True,
                text=True,
                check=True,
            ).stdout
        )
        out[name] = [{**x, "text": k["text"]} for x, k in zip(items, kana, strict=True) if "text" in k]
    return out


def main():
    sets = json.loads(
        subprocess.run(
            ["node", "-e", 'import("./sets.mjs").then(m=>console.log(JSON.stringify(m.SETS)))'], cwd=HERE, capture_output=True, text=True, check=True
        ).stdout
    )
    how = sys.argv[1][2:] if len(sys.argv) > 1 else None
    if how == "ys":
        rule = sys.argv[3] if len(sys.argv) > 3 else None
        how = f"ys_{sys.argv[2]}" + (f"_{rule}" if rule else "")
        sets = katarite(sets, sys.argv[2], rule)
    elif how:
        sets = {"hard": hinted(sets["hard"], how)}
    out = HERE / ("audio/supertonic" + (f"_{how}" if how else ""))
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    tts = TTS(model="supertonic-3")
    style = tts.get_voice_style("F1")
    print(f"load {time.time() - t0:.1f} s")
    times = []
    for name, items in sets.items():
        for x in items:
            t = time.time()
            wav, _ = tts.synthesize(x["text"], voice_style=style, lang=x["lang"][:2])
            times.append(time.time() - t)
            tts.save_audio(wav, str(out / f"{name}.{x['name']}.wav"))
    times.sort()
    print(f"{len(times)} texts, median {times[len(times) // 2]:.2f} s per text (CPU)")


if __name__ == "__main__":
    main()
