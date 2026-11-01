"""The reading of each item's homograph in every YomiScript of run.mjs (results/r<run>/...), by condition.

The word's reading comes from the <t:…> layer and is compared with the right readings and the misreadings of
items.tsv in the coarse spelling of eval/author_reading/score.py (imported); when several listed readings match, the
longest decides (ダイテ is in イダイテ). pyopenjtalk reads the target sentences as a dictionary baseline.

Statistics (README.md): per item, the share of the LLMs that read it right; a condition's accuracy and the paired
difference of two conditions with 95% intervals from resampling whole words (10,000 times); an exact sign test with
one vote per word; exact McNemar on the item x LLM pairs. The authors' answers are scored on the answers that contain
the word, and again on those that do not restate the user's message.

usage: ../prosody_ref/.venv/bin/python score.py [run]   -> results/r<run>/summary.md, items.md, other.md
"""

import json
import sys
from pathlib import Path

import numpy as np
import pyopenjtalk

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "author_reading"))
import score as ar  # noqa: E402

LLMS, NAMES = ar.LLMS, ar.NAMES
CONTENT = ("名詞", "動詞", "形容詞", "副詞")


def items():
    out = []
    for line in (HERE / "items.tsv").read_text().splitlines():
        if line and not line.startswith("#"):
            iid, word, right, wrong, target, paragraph, user = line.split("\t")
            out.append({"id": iid, "word": word, "right": right.split("|"), "wrong": wrong.split("|"), "target": target, "user": user})
    return out


def classify(got, s, spell):
    # right / misread / other: the longest listed reading found in got (both spelled by spell) decides
    hits = [(len(spell(k)), v) for v, ks in (("right", s["right"]), ("misread", s["wrong"])) for k in ks if spell(k) in got]
    return max(hits)[1] if hits else "other"


def spell(ipa):
    # the coarse spelling of author_reading, with ヒュ written hj (hjɯːɡa) as kana2ipa writes it (çɯː)
    return ar.coarse(ipa).replace("hy", "h")


def verdict(ys, s, text):
    ipa = ar.word_ipa(ys or "", s["word"], text)
    return (classify(spell(ipa), s, lambda k: spell(ar.kana2ipa.convert(k))), ipa) if ipa else ("other", ipa)


def openjtalk(text, s):
    return classify(ar.norm(pyopenjtalk.g2p(text, kana=True)), s, ar.norm)


def batch_out(run, cond, llm, k):
    f = run / cond / llm / f"b{k}.json"
    out = json.loads(f.read_text()).get("output") if f.exists() else None
    return {x["n"]: x for x in (out or {}).get("items", []) if isinstance(x, dict) and "n" in x}


def restates(answer, s):
    # a content word of the answer, with a kanji or katakana in it and not part of the homograph, that the user wrote
    for w in pyopenjtalk.run_frontend(answer):
        word = w["string"]
        if not w["pos"].startswith(CONTENT) or word in s["word"] or s["word"] in word:
            continue
        if any("一" <= c <= "鿿" or "ァ" <= c <= "ヺ" for c in word) and (word in s["user"] or w["orig"] in s["user"]):
            return True
    return False


def load(run):
    # R[cond][(llm, id)] = right / misread / other; A[(author, id)] = the author's answer and whether it restates
    S = {s["id"]: s for s in items()}
    B = json.loads((run / "batches.json").read_text())
    R, A, other = {}, {}, []

    def put(cond, llm, s, ys, text):
        # a call that gave no YomiScript for the item (a failed call) is missing, not a misreading
        v, ipa = verdict(ys, s, text) if ys is not None else ("missing", None)
        R.setdefault(cond, {})[(llm, s["id"])] = v
        if v == "other":
            other.append(f"| {s['id']} | {s['word']} | {'/'.join(s['right'])} | {cond} | {NAMES[llm]} | {text} | {ipa} |")

    for k, ids in enumerate(B):
        for llm in LLMS:
            for cond in ("ext.alone", "ext.context", "chat.alone", "chat.context"):
                out = batch_out(run, cond, llm, k)
                for n, iid in enumerate(ids, 1):
                    put(cond, llm, S[iid], out.get(n, {}).get("ys"), S[iid]["target"])
            load_author(run, k, llm, [S[i] for i in ids], A, put)
    return R, A, other


def load_author(run, k, a, batch, A, put):
    # the author's own YomiScript, then each reader's of the answers the author gave (numbered in that order)
    out = batch_out(run, "author", a, k)
    given = [(s, out[n]["text"], out[n].get("ys")) for n, s in enumerate(batch, 1) if n in out and out[n].get("text")]
    for s, text, ys in given:
        A[(a, s["id"])] = {"text": text, "has": s["word"] in text, "restates": restates(text, s), "chars": len(text.rstrip("。！!？?"))}
        put(f"author.{a}", a, s, ys, text)
    for r in LLMS:
        for c in ("alone", "context"):
            got = batch_out(run, f"authread/{a}", f"{r}.{c}", k)
            for n, (s, text, _) in enumerate(given, 1):
                put(f"authread.{a}.{c}", r, s, got.get(n, {}).get("ys"), text)


def per_item(R, cond, ids, llms=LLMS):
    # the share of the LLMs that read each item right (an LLM without a YomiScript for it counts as not right)
    return np.array([np.mean([R[cond].get((m, i)) == "right" for m in llms]) for i in ids])


def interval(x, words, rng):
    return ar.clustered_mean(list(x), words, rng)


def sign_test(x, words):
    per = {}
    for v, w in zip(x, words, strict=True):
        per[w] = per.get(w, 0) + v
    return ar.mcnemar([d > 0 for d in per.values()], [d < 0 for d in per.values()])


def pairs_mcnemar(R, a, b, ids, llms=LLMS):
    keys = [(m, i) for m in llms for i in ids]
    return ar.mcnemar([R[a].get(k) == "right" for k in keys], [R[b].get(k) == "right" for k in keys])


def diff_row(name, xa, xb, words, rng, mc):
    x = xa - xb
    m, lo, hi = interval(x, words, rng)
    wp, wn, p = sign_test(x, words)
    pairs = f"{mc[0]} / {mc[1]} (p = {mc[2]:.2g})" if mc else "n/a (two readers averaged)"
    return f"| {name} | {100 * m:+.1f} | [{100 * lo:+.1f}, {100 * hi:+.1f}] | {wp} / {wn} (p = {p:.2g}) | {pairs} |"


DIFF_HEAD = [
    "| A − B | difference (points) | 95% interval, resampling words | words A / B better (sign test) | item x LLM pairs A / B better (McNemar) |",
    "|---|---|---|---|---|",
]


def accuracy_table(R, S, rng):
    ids, words = [s["id"] for s in S], [s["word"] for s in S]
    out = [f"Homograph read right, {len(ids)} items ({len(set(words))} words), [95% interval resampling words]", ""]
    out += ["| condition | 3 LLMs pooled | " + " | ".join(NAMES[m] for m in LLMS) + " |", "|---" * (2 + len(LLMS)) + "|"]
    for cond in ("ext.alone", "ext.context", "chat.alone", "chat.context"):
        m, lo, hi = interval(per_item(R, cond, ids), words, rng)
        per = [f"{per_item(R, cond, ids, [x]).mean():.1%}" for x in LLMS]
        out.append(f"| {cond} | {m:.1%} [{lo:.1%}, {hi:.1%}] | " + " | ".join(per) + " |")
    oj = np.array([openjtalk(s["target"], s) == "right" for s in S], float)
    m, lo, hi = interval(oj, words, rng)
    out.append(f"| pyopenjtalk (target sentence) | {m:.1%} [{lo:.1%}, {hi:.1%}] | | | |")
    return out


def context_diffs(R, S, rng):
    ids, words = [s["id"] for s in S], [s["word"] for s in S]
    out = ["Paired differences on the same items (pooled: the share of the 3 LLMs; one LLM: 0 or 1 per item)", "", *DIFF_HEAD]
    for a, b, label in [("ext.context", "ext.alone", "PRIMARY "), ("chat.context", "chat.alone", ""), ("ext.context", "chat.context", "")]:
        out.append(diff_row(f"{label}{a} − {b}, pooled", per_item(R, a, ids), per_item(R, b, ids), words, rng, pairs_mcnemar(R, a, b, ids)))
        for m in LLMS:
            xa, xb = per_item(R, a, ids, [m]), per_item(R, b, ids, [m])
            out.append(diff_row(f"{a} − {b}, {NAMES[m]}", xa, xb, words, rng, pairs_mcnemar(R, a, b, ids, [m])))
    return out


def author_vectors(R, A, S, keys):
    # per (author, item): right or not, for the author and its readers (the same LLM, and the other two averaged)
    def get(cond, llms_of):
        return np.array([np.mean([R[cond.format(a=a)].get((m, i)) == "right" for m in llms_of(a)]) for a, i in keys])

    same, others = (lambda a: [a]), (lambda a: [m for m in LLMS if m != a])
    return {
        "author": get("author.{a}", same),
        "same LLM, answer alone": get("authread.{a}.alone", same),
        "same LLM, with the user's message": get("authread.{a}.context", same),
        "other LLMs, answer alone": get("authread.{a}.alone", others),
        "other LLMs, with the user's message": get("authread.{a}.context", others),
        "pyopenjtalk on the answer": np.array([openjtalk(A[k]["text"], S[k[1]]) == "right" for k in keys], float),
    }


AUTHOR_DIFFS = [
    ("author", "same LLM, answer alone"),
    ("author", "same LLM, with the user's message"),
    ("author", "other LLMs, with the user's message"),
    ("same LLM, with the user's message", "same LLM, answer alone"),
    ("other LLMs, with the user's message", "other LLMs, answer alone"),
]


def author_section(R, A, S, rng):
    out = ["Authors: answers of at most 15 characters with the word, readers of those answers", ""]
    out += ["| author | answers | with the word | over 15 characters | restating the user's message |", "|---|---|---|---|---|"]
    for a in LLMS:
        mine = [v for (x, _), v in A.items() if x == a]
        n15 = sum(v["chars"] > 15 for v in mine)
        out.append(f"| {NAMES[a]} | {len(mine)} | {sum(v['has'] for v in mine)} | {n15} | {sum(v['restates'] for v in mine if v['has'])} |")

    def read_by_all(k):
        # every reader gave a YomiScript for this answer, with and without the message
        return all(R[f"authread.{k[0]}.{c}"].get((r, k[1])) not in (None, "missing") for r in LLMS for c in ("alone", "context"))

    dropped = sum(v["has"] and not read_by_all(k) for k, v in A.items())
    out += ["", f"Left out: {dropped} answers that some reader's call did not return (failed calls, see the top)."]
    for label, keep in [("all answers with the word", lambda v: True), ("answers that do not restate", lambda v: not v["restates"])]:
        keys = sorted(k for k, v in A.items() if v["has"] and keep(v) and read_by_all(k))
        words = [S[i]["word"] for _, i in keys]
        V = author_vectors(R, A, S, keys)
        out += ["", f"{label}: {len(keys)} answers, {len(set(words))} words", "", "| condition | right [95% interval resampling words] |", "|---|---|"]
        for c, x in V.items():
            m, lo, hi = interval(x, words, rng)
            out.append(f"| {c} | {m:.1%} [{lo:.1%}, {hi:.1%}] |")
        out += ["", *DIFF_HEAD]
        for a, b in AUTHOR_DIFFS:
            mc = ar.mcnemar(list(V[a] == 1), list(V[b] == 1)) if "other" not in a + b else None
            out.append(diff_row(f"{a} − {b}", V[a], V[b], words, rng, mc))
    return out


def calls(run):
    files = sorted(run.rglob("b[0-9]*.json"))
    recs = [json.loads(f.read_text()) for f in files]
    failed = [str(f.relative_to(run)) for f, r in zip(files, recs, strict=True) if not r.get("output")]
    secs = {m: sum(r["seconds"] for r in recs if r["llm"] == m) for m in LLMS}
    models = sorted({f"{NAMES[r['llm']]}: {r.get('model')}" for r in recs})
    head = f"{len(recs)} calls, {len(failed)} without a complete answer after 3 tries; seconds per LLM (summed): "
    return [head + ", ".join(f"{NAMES[m]} {secs[m]:.0f}" for m in LLMS), "Models: " + "; ".join(models), *[f"- failed: {f}" for f in failed]]


def item_table(R, A, S):
    out = ["| item | word | right | ext.alone | ext.context | chat.alone | chat.context | authors | pyopenjtalk |", "|---" * 9 + "|"]
    for s in S:
        cells = [f"{sum(R[c].get((m, s['id'])) == 'right' for m in LLMS)}/3" for c in ("ext.alone", "ext.context", "chat.alone", "chat.context")]
        au = "".join(("+" if R[f"author.{a}"].get((a, s["id"])) == "right" else "-") if A.get((a, s["id"]), {}).get("has") else "." for a in LLMS)
        out.append(f"| {s['id']} | {s['word']} | {'/'.join(s['right'])} | " + " | ".join(cells) + f" | {au} | {openjtalk(s['target'], s)} |")
    return out


def main():
    run = HERE / "results" / f"r{sys.argv[1] if len(sys.argv) > 1 else 1}"
    S = items()
    R, A, other = load(run)
    rng = np.random.default_rng(0)
    parts = [calls(run), accuracy_table(R, S, rng), context_diffs(R, S, rng), author_section(R, A, {s["id"]: s for s in S}, rng)]
    text = "\n\n".join("\n".join(p) for p in parts)
    (run / "summary.md").write_text(text + "\n")
    note = "authors: + right, - not, . no answer with the word (Claude, Codex, Gemini)\n\n"
    (run / "items.md").write_text(note + "\n".join(item_table(R, A, S)) + "\n")
    head = "| item | word | right | condition | LLM | text | IPA of the word |\n|---|---|---|---|---|---|---|\n"
    (run / "other.md").write_text(head + "\n".join(other) + "\n")
    print(text)


if __name__ == "__main__":
    main()
