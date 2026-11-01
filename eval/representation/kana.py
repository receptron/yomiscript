"""Readings -> YomiScript, with the converter eval/browser_tts uses for the hard set's gold (refs.kana_ys).

stdin: a JSON list; stdout: the JSON list of their YomiScript ("error: ..." where the conversion fails).
  (default)  katakana strings.
  --sparse   {"text": ..., "spans": [[start, end, katakana], ...]}: the sparse format (formats.mjs). The text is read by
             pyopenjtalk as a whole (OpenJTalk's words and their pronunciations, as eval/browser_tts reads its
             pyopenjtalk reference); each annotated span is then read as its annotation instead. A word only partly
             inside a span keeps pyopenjtalk's reading of the part outside it, read on its own. Where OpenJTalk's words
             cannot be lined up with the text, the readings are put into the text as katakana and pyopenjtalk reads
             that (reported on stderr).
usage: ../prosody_ref/.venv/bin/python kana.py [--sparse] < in.json     (score.mjs runs it; needs pyopenjtalk)
"""

import json
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "browser_tts"))
import pyopenjtalk  # noqa: E402
from refs import kana_ys  # noqa: E402

NUMERALS = set("〇一二三四五六七八九十百千万億兆．・")
nfkc = lambda s: unicodedata.normalize("NFKC", s)  # noqa: E731
pron = lambda n: n["pron"].replace("’", "")  # noqa: E731


def _number_end(t, pos, nodes, j):
    # a number written in digits that OpenJTalk spelt as numerals: from pos to the end of the digits, plus the part of
    # the last node after its numerals (二十日 for 20日)
    end = pos
    while end < len(t) and (t[end].isdigit() or t[end] in ".,"):
        end += 1
    tail = nfkc(nodes[j]["string"]).lstrip("".join(NUMERALS))
    return end + len(tail) if tail and t.startswith(tail, end) else end


def words(text, nodes):
    """OpenJTalk's words as [(start, end, pronunciation)] over the text, or None where they do not line up"""
    t, pos, i, out = nfkc(text), 0, 0, []
    while i < len(nodes):
        s = nfkc(nodes[i]["string"])
        if t.startswith(s, pos):
            out.append((pos, pos + len(s), pron(nodes[i])))
            pos, i = pos + len(s), i + 1
            continue
        if pos >= len(t) or not t[pos].isdigit():
            return None
        group = []
        while i < len(nodes):  # the numerals up to the node that matches again after the number
            group.append(pron(nodes[i]))
            end = _number_end(t, pos, nodes, i)
            i += 1
            if i == len(nodes) or t.startswith(nfkc(nodes[i]["string"]), end):
                break
        out.append((pos, end, "".join(group)))
        pos = end
    return out if pos == len(t) and len(t) == len(text) else None


def sparse_reading(text, spans):
    nodes = pyopenjtalk.run_frontend(text)
    W = words(text, nodes)
    if W is None:
        print(f"kana.py: words not lined up, readings put into the text: {text}", file=sys.stderr)
        mixed, last = "", 0
        for s, e, k in spans:
            mixed, last = mixed + text[last:s] + k, e
        return pyopenjtalk.g2p(mixed + text[last:], kana=True)
    out, done = [], set()
    for s, e, p in W:
        inside = [sp for sp in spans if sp[0] < e and s < sp[1]]
        if not inside:
            out.append(p)
            continue
        pos = s
        for a, b, k in inside:
            if a > pos:
                out.append(pyopenjtalk.g2p(text[pos:a], kana=True))
            if (a, b) not in done:
                out.append(k)
                done.add((a, b))
            pos = max(pos, b)
        if pos < e:
            out.append(pyopenjtalk.g2p(text[pos:e], kana=True))
    return "".join(out)


if __name__ == "__main__":
    items = json.load(sys.stdin)
    if "--sparse" in sys.argv:
        items = [sparse_reading(x["text"], x["spans"]) for x in items]
    json.dump([kana_ys(k) for k in items], sys.stdout, ensure_ascii=False)
