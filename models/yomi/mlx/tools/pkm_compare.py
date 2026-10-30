"""Compare swapped learned memories (PKM). Run from models/yomi/mlx:
  python tools/pkm_compare.py [--ckpt ckpt/mold_tiny] [--mem name=path ...] [--limit N] [--skip-jsut] [--skip-names]
For each memory, runs eval_names.py and evaluate.py with --pkm, saves the full output under eval_out/ and summarizes it in a table.
Memories that do not exist are skipped. --mem overrides or adds to the defaults (default/names/general) under the same name.
--mem name=a.mem.safetensors,b.mem.safetensors stacks them; a trailing @ckpt/X uses another ckpt for that entry only
(a trailing #cg0.5 sets the inference-time gate threshold. E.g.: --mem default=ckpt/mfz_default.mem.safetensors@ckpt/mfz_general
 --mem stacked=ckpt/mfz_default.mem.safetensors,ckpt/names2.mem.safetensors@ckpt/mfz_stack)"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
DEFAULTS = {"default": "ckpt/mold_tiny/default.mem.safetensors", "names": "ckpt/names.mem.safetensors", "general": "ckpt/general.mem.safetensors"}


def last_json_object(text):
    """Extract the JSON (several lines) that follows the log lines. Returns the last parsable chunk starting with '{'."""
    dec = json.JSONDecoder()
    for m in reversed([m.start() for m in re.finditer(r"^\{", text, re.M)]):
        try:
            obj, _ = dec.raw_decode(text[m:])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            continue
    return None


def parse_names(text):
    """Turn eval_names.py's 'split mode {json}' lines into {split/mode: dict}."""
    res = {}
    for line in text.splitlines():
        m = re.match(r"^((?:names|places)_eval_\w+)\s+(model|memory)\s+(\{.*\})\s*$", line)
        if m:
            try:
                res[f"{m.group(1)}/{m.group(2)}"] = json.loads(m.group(3))
            except json.JSONDecodeError:
                pass
    return res


def pick(d, *path):
    for k in path:
        if not isinstance(d, dict) or k not in d:
            return None
        d = d[k]
    return d[2] if isinstance(d, list) and len(d) == 3 else d  # p_r_f1 → f1


ENV = {}


def run(cmd, log):
    import os

    p = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True, env={**os.environ, **ENV})
    log.write_text(f"$ {' '.join(cmd)}\n# exit {p.returncode}\n{p.stdout}\n--- stderr ---\n{p.stderr}", encoding="utf-8")
    if p.returncode:
        print(f"  failed (exit {p.returncode}): {log}", file=sys.stderr)
    return p.stdout


def fmt(v, pct=True):
    return "-" if v is None else (f"{v*100:.1f}" if pct else f"{v:.3f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", default="ckpt/mold_tiny")
    ap.add_argument("--mem", action="append", default=[], help="name=path (repeatable)")
    ap.add_argument("--only", nargs="*", help="compare only these memory names")
    ap.add_argument("--out-dir", default="eval_out")
    ap.add_argument("--limit", type=int, default=0, help="--limit for eval_names.py (for a quick check)")
    ap.add_argument("--general-eval", type=int, default=0, metavar="N", help="also evaluate N held-out general sentences (gen/gCER columns in the table)")
    ap.add_argument("--places", default="data/places", help="location of the place-name evaluation (places_eval_seen/unseen). Skipped if missing")
    ap.add_argument("--skip-jsut", action="store_true")
    ap.add_argument("--skip-names", action="store_true")
    a = ap.parse_args()
    mems = dict(DEFAULTS)
    for s in a.mem:
        if "=" not in s:
            ap.error(f"--mem takes the form name=path: {s}")
        k, v = s.split("=", 1)
        mems[k] = v
    if a.only:
        mems = {k: v for k, v in mems.items() if k in a.only}
    out = HERE / a.out_dir
    out.mkdir(exist_ok=True)
    tag = Path(a.ckpt).name
    rows = []
    for name, spec in mems.items():
        spec, *opts = spec.split("#")  # trailing #cg0.5 = inference-time gate threshold (MOLD_CG_THRESH)
        ENV.clear()
        for o in opts:
            ENV.update({"MOLD_CG_THRESH": o[2:]} if o.startswith("cg") else {"MOLD_MEM_OFF": o[4:]} if o.startswith("off=") else {})
        path, _, ck = spec.partition("@")
        ck = ck or a.ckpt
        miss = [p for p in path.split(",") if p and not (HERE / p).exists() and not Path(p).exists()]
        if miss:
            print(f"skip {name}: {', '.join(miss)} not found", file=sys.stderr)
            continue
        print(f"== {name}: {path} (ckpt {ck})", file=sys.stderr, flush=True)
        r = {"memory": name}
        if not a.skip_names:
            cmd = [sys.executable, "eval_names.py", "--ckpt", ck] + (["--pkm", path] if path else []) + (["--limit", str(a.limit)] if a.limit else [])
            r["names"] = parse_names(run(cmd, out / f"{tag}.{name}.eval_names.log"))
            if (HERE / a.places).exists():  # place-name (mem3) reading accuracy
                r["names"].update(
                    parse_names(
                        run(
                            cmd + ["--data", a.places, "--model-only", "--splits", "places_eval_seen", "places_eval_unseen"],
                            out / f"{tag}.{name}.eval_places.log",
                        )
                    )
                )
        if not a.skip_jsut:
            r["jsut"] = (
                last_json_object(
                    run(
                        [sys.executable, "evaluate.py", "--ckpt", ck]
                        + (["--pkm", path] if path else [])
                        + (["--general-eval", str(a.general_eval)] if a.general_eval else []),
                        out / f"{tag}.{name}.evaluate.log",
                    )
                )
                or {}
            )
        rows.append(r)
    (out / f"{tag}.compare.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    if not rows:
        print("no memories to compare")
        return 1
    # End with a table of one line per memory, so pasting the last few lines is enough (nothing is printed after it)
    print(f"output: {out}/  ckpt {a.ckpt}  [%]  names = read/pros without the lexicon (model)", flush=True)
    print(
        f"{'memory':10} {'CER':>5} {'sent':>5} {'loose':>5} {'hard':>5} {'bndF1':>5} {'accF1':>5} {'gen':>5} "
        f"{'gCER':>5} | {'seenR':>5} {'seenP':>5} {'unsR':>5} {'unsP':>5} | {'plcS':>5} {'plcU':>5}"
    )
    for r in rows:
        j, n = r.get("jsut", {}), r.get("names", {})
        sm, um = n.get("names_eval_seen/model", {}), n.get("names_eval_unseen/model", {})
        ps, pu = n.get("places_eval_seen/model", {}), n.get("places_eval_unseen/model", {})

        def f(x):
            return f"{fmt(x):>5}"

        print(
            f"{r['memory'][:10]:10} {f(pick(j,'jsut','kana_cer'))} {f(pick(j,'jsut','sent_acc'))} {f(pick(j,'jsut','sent_acc_loose'))} "
            f"{f(pick(j,'hard','sent_acc'))} {f(pick(j,'jsut','phrase_boundary_p_r_f1'))} "
            f"{f(pick(j,'jsut','accent_nucleus_p_r_f1'))} {f(pick(j,'general','sent_acc'))} {f(pick(j,'general','kana_cer'))} | "
            f"{f(sm.get('name_reading_acc'))} {f(sm.get('name_prosody_exact'))} {f(um.get('name_reading_acc'))} "
            f"{f(um.get('name_prosody_exact'))} | {f(ps.get('name_reading_acc'))} {f(pu.get('name_reading_acc'))}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
