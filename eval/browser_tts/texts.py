"""The texts for the scripts that give a text engine (Supertonic 3, Audio8) something to read.

load_sets()                   the sets of sets.mjs (ja, en, hard)
katarite(sets, llm, rule)     the LLM's YomiScript (results/<llm>.<set>.json) as the text the Supertonic Katarite
                              gives its engine: the original text (D23) with kana where RULE says (ambiguous, kanji),
                              by packages/supertonic via render_text.mjs (built: yarn build)
"""

import json
import subprocess
from pathlib import Path

HERE = Path(__file__).parent


def load_sets():
    return json.loads(
        subprocess.run(
            ["node", "-e", 'import("./sets.mjs").then(m=>console.log(JSON.stringify(m.SETS)))'], cwd=HERE, capture_output=True, text=True, check=True
        ).stdout
    )


def katarite(sets, llm, rule, names=("ja", "hard", "en")):
    # the same YomiScript Kokoro is given, as the original text with kana where the rule says
    out = {}
    for name in names:
        R = json.loads((HERE / f"results/{llm}.{name}.json").read_text())
        items = [x for x in sets[name] if R["output"].get(x["name"])]
        ys = [R["output"][x["name"]] for x in items]
        kana = json.loads(
            subprocess.run(
                ["node", str(HERE / "render_text.mjs"), rule],
                input=json.dumps(ys),
                capture_output=True,
                text=True,
                check=True,
            ).stdout
        )
        out[name] = [{**x, "text": k["text"]} for x, k in zip(items, kana, strict=True) if "text" in k]
    return out
