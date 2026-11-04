"""The supervised prosody data: Qwen's pitch and timing on the units of each sentence it read right.

For each sentence of work/items.json with audio (generate.py):

1. Reading check, as eval/prosody_ref/refcheck.py: Whisper twice (as usual, and with a prompt in hiragana), each
   transcript turned into katakana by pronunciation and compared with JSUT's hand-checked kana (kana_level0), two
   spellings of the same sound taken as one (SAME). A sentence is kept only when one matches, so a misreading by Qwen (it reads the plain text) never gets in;
   Whisper's own errors can only drop a sentence.
2. Measurement, as eval/qwen3_tts/measure.py: the units force-aligned (MMS_FA), three pitch values per mora at the
   start, middle and end of its voiced frames (semitones, the sentence's median 0), each unit's span, the pauses.

Transcripts are cached (work/asr.json), so a rerun after more audio only does the new sentences.

A record's `given` is "text" (the plain text was read) or "kana" (the kana pass).

With --wiki, the Wikipedia sentences (wiki_items.mjs): there is no hand-checked reading, so the transcript is checked
against the reading of the item's own YomiScript (its `kana`): a sentence is kept when Qwen read it as the YomiScript
says, so the pitch lies under the right morae (whether the YomiScript reads the sentence right is not checked). Only
the plain text is read (the kana pass is not a pitch target).

usage: ../prosody_ref/.venv/bin/python extract.py [--wiki]   -> data/jsut_qwen_clone.jsonl, work/rejected.json
       (misread from the plain text: kana_items.mjs's input), work/misread.json (misread in every pass); with --wiki
       work/wiki/qwen_clone.jsonl, work/wiki/misread.json
"""

import argparse
import json
import sys
from pathlib import Path

import mlx_whisper

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "prosody_ref"))
sys.path.insert(0, str(HERE.parent / "qwen3_tts"))
sys.path.insert(0, str(HERE.parent / "browser_tts"))
from asr_score import norm  # noqa: E402
from measure import measure  # noqa: E402
from refcheck import KANA_PROMPT, MODEL, expected, heard  # noqa: E402

OUT = HERE / "data/jsut_qwen_clone.jsonl"
# spellings of one pronunciation that the katakana of a transcript and JSUT's kana write differently: a long e
# (シェイクスピア / シェエクスピア) and 言う (トイウ / トユウ)
SAME = [("エイ", "エエ"), ("イウ", "ユウ")]


def canon(kana):
    for a, b in SAME:
        kana = kana.replace(a, b)
    return kana


def transcribe(asr, name, wav):
    if name not in asr:
        asr[name] = [
            mlx_whisper.transcribe(str(wav), path_or_hf_repo=MODEL, language="ja")["text"].strip(),
            mlx_whisper.transcribe(str(wav), path_or_hf_repo=MODEL, language="ja", initial_prompt=KANA_PROMPT)["text"].strip(),
        ]
    return asr[name]


def by_unit(toks, keyed):
    """{token index: seconds} -> {the index of the unit before it: seconds}"""
    units = [k for k, t in enumerate(toks) if t["kind"] == "unit"]
    return {str(max(i for i, k in enumerate(units) if k < int(q))): s for q, s in keyed.items()}


def record(x, m, got, given):
    units = [t for t in x["toks"] if t["kind"] == "unit"]
    return {
        "name": x["name"],
        "text": x["text"],
        "given": given,
        "ys": x["ys"],
        "units": [t["ipa"] for t in units],
        "f0": m["values"],
        "spans": m["spans"],
        "pauses": by_unit(x["toks"], m["pauses"]),
        "gaps": by_unit(x["toks"], m["gaps"]),
        "align": m["align_score"],
        "heard": got,
    }


# the two passes: the plain text (generate.py), then, for the sentences misread from it, the text with every word
# that has a kanji in kana (kana_items.mjs, generate.py --items work/items_kana.json --out work/audio_kana)
PASSES = [("text", "work/audio", ""), ("kana", "work/audio_kana", "kana/")]
WIKI_PASSES = [("text", "work/wiki/audio", "")]


def check(asr, gold, x, passes=PASSES):
    """(the record, or None) and, per pass, what Whisper heard in a pass that misread"""
    misread = {}
    for given, folder, key in passes:
        wav = HERE / folder / f"{x['name']}.wav"
        if not wav.exists():
            continue
        got = [heard(t) for t in transcribe(asr, key + x["name"], wav)]
        right = [g for g in got if canon(g) in {canon(k) for k in gold[x["name"]]}]
        if right:
            try:
                return record(x, measure(x, wav), right[0], given), misread
            except KeyError as e:  # a letter the aligner's alphabet does not have
                misread[given] = f"not aligned: {e}"
                return None, misread
        misread[given] = got
    return None, misread


def corpus(wiki):
    """the items, the readings they are checked against ({name: {kana}}), the passes and the output files"""
    if wiki:
        items = json.loads((HERE / "work/wiki/items.json").read_text())
        gold = {x["name"]: {norm(x["kana"])} for x in items}
        return items, gold, WIKI_PASSES, HERE / "work/wiki/qwen_clone.jsonl", None, HERE / "work/wiki/misread.json"
    gold = {k.removeprefix("jsut."): v for k, v in expected().items() if k.startswith("jsut.")}
    items = json.loads((HERE / "work/items.json").read_text())
    return items, gold, PASSES, OUT, HERE / "work/rejected.json", HERE / "work/misread.json"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wiki", action="store_true")
    items, gold, passes, out, rejected_file, misread_file = corpus(ap.parse_args().wiki)
    cache = HERE / "work/asr.json"
    asr = json.loads(cache.read_text()) if cache.exists() else {}
    kept, rejected, final = [], {}, {}
    for n, x in enumerate(items):
        r, misread = check(asr, gold, x, passes)
        if r:
            kept.append(r)
        if "text" in misread:
            rejected[x["name"]] = misread["text"]
        if not r and misread:
            final[x["name"]] = misread
        if n % 100 == 0:
            cache.write_text(json.dumps(asr, ensure_ascii=False))
            print(f"{n}/{len(items)}: {len(kept)} kept, {len(final)} misread", flush=True)
    cache.write_text(json.dumps(asr, ensure_ascii=False))
    out.parent.mkdir(exist_ok=True)
    out.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in kept))
    if rejected_file:
        rejected_file.write_text(json.dumps(rejected, ensure_ascii=False, indent=0))
    misread_file.write_text(json.dumps(final, ensure_ascii=False, indent=0))
    by = {g: sum(r["given"] == g for r in kept) for g in ("kana",)}
    print(f"{len(kept)} kept ({by['kana']} from the kana pass), {len(final)} misread -> {out.relative_to(HERE)}")


if __name__ == "__main__":
    main()
