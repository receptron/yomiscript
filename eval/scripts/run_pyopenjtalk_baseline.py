"""pyopenjtalk ベースライン (H1): 精度と CPU 速度を測る。

python eval/scripts/run_pyopenjtalk_baseline.py  -> eval/results/*.json, 誤り例 *.tsv
"""
import json, platform, re, statistics, sys, time
from pathlib import Path

import pyopenjtalk

sys.path.insert(0, str(Path(__file__).parent))
from metrics import edit_distance, f1, loose_kana, norm_kana, prosody_compare

EV = Path(__file__).resolve().parents[1]
OUT = EV / "results"
OUT.mkdir(exist_ok=True)


def _num(rx, s):
    m = re.search(rx, s)
    return -50 if m is None else int(m.group(1))


def pp_symbols(labels):
    """フルコンテキストラベル -> 音素+韻律記号 (ESPnet pyopenjtalk_prosody と同じ規則)。"""
    pp, n_ = [], len(labels)
    for n, lab in enumerate(labels):
        p3 = re.search(r"\-(.*?)\+", lab).group(1)
        if p3 == "sil":
            if n == 0:
                pp.append("^")
            elif n == n_ - 1:
                pp.append("?" if _num(r"!(\d+)_", lab) == 1 else "$")
            continue
        if p3 == "pau":
            pp.append("_")
            continue
        pp.append(p3)
        a1 = _num(r"/A:([0-9\-]+)\+", lab)
        a2 = _num(r"\+(\d+)\+", lab)
        a3 = _num(r"\+(\d+)/", lab)
        f1_ = _num(r"/F:(\d+)_", lab)
        a2n = _num(r"\+(\d+)\+", labels[n + 1])
        if a3 == 1 and a2n == 1 and p3 in "aeiouAEIOUNcl":
            pp.append("#")
        elif a1 == 0 and a2n == a2 + 1 and a2 != f1_:
            pp.append("]")
        elif a2 == 1 and a2n == 2:
            pp.append("[")
    return pp


def timed(fn, x):
    t = time.perf_counter()
    y = fn(x)
    return y, (time.perf_counter() - t) * 1000


def speed(lat):
    lat = sorted(lat)
    return {"n": len(lat), "mean_ms": statistics.mean(lat), "median_ms": statistics.median(lat),
            "p95_ms": lat[int(0.95 * (len(lat) - 1))], "sent_per_sec": 1000 * len(lat) / sum(lat)}


def main():
    pyopenjtalk.g2p("ウォームアップ")
    jsut = [json.loads(l) for l in open(EV / "data/jsut_basic5000_subset.jsonl", encoding="utf-8")]
    agg = dict.fromkeys(["ce", "cl", "sent_ok", "bnd_tp", "bnd_fp", "bnd_fn", "nuc_tp", "nuc_fp",
                         "nuc_fn", "ph_err", "ph_len", "ap_ok", "ap_tot", "ce_loose", "cl_loose", "sent_ok_loose"], 0)
    lat_kana, lat_full, errs = [], [], []
    for r in jsut:
        kana, t1 = timed(lambda s: pyopenjtalk.g2p(s, kana=True), r["text"])
        labels, t2 = timed(pyopenjtalk.extract_fullcontext, r["text"])
        lat_kana.append(t1); lat_full.append(t2)
        g = norm_kana(r["kana_prosody"]); p = norm_kana(kana)
        e = edit_distance(g, p)
        agg["ce"] += e; agg["cl"] += len(g); agg["sent_ok"] += e == 0
        gl, pl = loose_kana(r["kana_prosody"]), loose_kana(kana)
        el = edit_distance(gl, pl); agg["ce_loose"] += el; agg["cl_loose"] += len(gl); agg["sent_ok_loose"] += el == 0
        res = prosody_compare(r["phoneme_prosody"].split("-"), pp_symbols(labels))
        for k, v in res.items():
            agg[k] += v
        if e:
            errs.append((r["id"], r["text"], g, p, e))
    bp = f1(agg["bnd_tp"], agg["bnd_fp"], agg["bnd_fn"])
    npf = f1(agg["nuc_tp"], agg["nuc_fp"], agg["nuc_fn"])
    jres = {"n_sent": len(jsut), "kana_cer": agg["ce"] / agg["cl"], "sent_acc": agg["sent_ok"] / len(jsut),
            "kana_cer_loose": agg["ce_loose"] / agg["cl_loose"], "sent_acc_loose": agg["sent_ok_loose"] / len(jsut),
            "phoneme_er": agg["ph_err"] / agg["ph_len"],
            "phrase_boundary_p_r_f1": bp, "accent_nucleus_p_r_f1": npf,
            "accent_phrase_acc": agg["ap_ok"] / agg["ap_tot"], "counts": agg,
            "speed_g2p_kana": speed(lat_kana), "speed_fullcontext": speed(lat_full)}
    with open(OUT / "jsut_errors.tsv", "w", encoding="utf-8") as f:
        f.write("id\ttext\tgold\tpred\tedits\n")
        for x in errs:
            f.write("\t".join(map(str, x)) + "\n")

    # ハードセット
    rows = [l.rstrip("\n").split("\t") for l in open(EV / "data/hard_set.tsv", encoding="utf-8") if l.strip() and not l.startswith("#")]
    cats, hard = {}, []
    for hid, cat, text, gold, *note in rows:
        p = norm_kana(pyopenjtalk.g2p(text, kana=True))
        golds = [norm_kana(x) for x in gold.split("|")]
        e = min(edit_distance(x, p) for x in golds)
        el = min(edit_distance(loose_kana(x), loose_kana(p)) for x in golds)
        c = cats.setdefault(cat, {"n": 0, "ok": 0, "ce": 0, "cl": 0, "ok_loose": 0})
        c["n"] += 1; c["ok"] += e == 0; c["ce"] += e; c["cl"] += len(golds[0]); c["ok_loose"] += el == 0
        hard.append((hid, cat, text, gold, p, e, el))
    for c in cats.values():
        c["acc"] = c["ok"] / c["n"]; c["acc_loose"] = c["ok_loose"] / c["n"]; c["cer"] = c["ce"] / c["cl"]
    n = sum(c["n"] for c in cats.values())
    hres = {"n_sent": n, "sent_acc_loose": sum(c["ok_loose"] for c in cats.values()) / n, "sent_acc": sum(c["ok"] for c in cats.values()) / n,
            "kana_cer": sum(c["ce"] for c in cats.values()) / sum(c["cl"] for c in cats.values()), "by_category": cats}
    with open(OUT / "hard_set_predictions.tsv", "w", encoding="utf-8") as f:
        f.write("id\tcategory\ttext\tgold\tpred\tedits\tedits_loose\n")
        for x in hard:
            f.write("\t".join(map(str, x)) + "\n")
    env = {"pyopenjtalk": pyopenjtalk.__version__, "python": platform.python_version(),
           "cpu": platform.processor() or platform.machine(), "note": "1プロセス・1スレッド逐次、ウォームアップ後"}
    json.dump({"env": env, "jsut": jres, "hard": hres}, open(OUT / "pyopenjtalk_baseline.json", "w"), ensure_ascii=False, indent=2)
    print(json.dumps({"jsut": jres, "hard": hres}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
