"""学習型メモリ (PKM) の差し替え比較。models/yomi/mlx から実行:
  python tools/pkm_compare.py [--ckpt ckpt/mold_tiny] [--mem name=path ...] [--limit N] [--skip-jsut] [--skip-names]
各メモリについて eval_names.py と evaluate.py を --pkm 付きで実行し、出力全体を eval_out/ に保存して表にまとめる。
存在しないメモリは飛ばす。--mem を指定すると既定 (default/names/general) を同名で上書き・追加する。
--mem name=a.mem.safetensors,b.mem.safetensors で積み重ね、末尾に @ckpt/X を付けるとその項目だけ別の ckpt を使う
(例: --mem default=ckpt/mfz_default.mem.safetensors@ckpt/mfz_general --mem stacked=ckpt/mfz_default.mem.safetensors,ckpt/names2.mem.safetensors@ckpt/mfz_stack)"""
import argparse, json, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
DEFAULTS = {"default": "ckpt/mold_tiny/default.mem.safetensors", "names": "ckpt/names.mem.safetensors",
            "general": "ckpt/general.mem.safetensors"}


def last_json_object(text):
    """ログ行の後ろに出る JSON (複数行) を取り出す。最後に読める '{' から始まる塊を返す。"""
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
    """eval_names.py の 'split mode {json}' 行を {split/mode: dict} にする。"""
    res = {}
    for line in text.splitlines():
        m = re.match(r"^(names_eval_\w+)\s+(model|memory)\s+(\{.*\})\s*$", line)
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


def run(cmd, log):
    p = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True)
    log.write_text(f"$ {' '.join(cmd)}\n# exit {p.returncode}\n{p.stdout}\n--- stderr ---\n{p.stderr}", encoding="utf-8")
    if p.returncode:
        print(f"  失敗 (exit {p.returncode}): {log}", file=sys.stderr)
    return p.stdout


def fmt(v, pct=True):
    return "-" if v is None else (f"{v*100:.1f}" if pct else f"{v:.3f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", default="ckpt/mold_tiny")
    ap.add_argument("--mem", action="append", default=[], help="name=path (複数可)")
    ap.add_argument("--only", nargs="*", help="比較するメモリ名だけに絞る")
    ap.add_argument("--out-dir", default="eval_out")
    ap.add_argument("--limit", type=int, default=0, help="eval_names.py の --limit (動作確認用)")
    ap.add_argument("--skip-jsut", action="store_true"); ap.add_argument("--skip-names", action="store_true")
    a = ap.parse_args()
    mems = dict(DEFAULTS)
    for s in a.mem:
        if "=" not in s:
            ap.error(f"--mem は name=path 形式: {s}")
        k, v = s.split("=", 1); mems[k] = v
    if a.only:
        mems = {k: v for k, v in mems.items() if k in a.only}
    out = HERE / a.out_dir; out.mkdir(exist_ok=True)
    tag = Path(a.ckpt).name
    rows = []
    for name, spec in mems.items():
        path, _, ck = spec.partition("@"); ck = ck or a.ckpt
        miss = [p for p in path.split(",") if p and not (HERE / p).exists() and not Path(p).exists()]
        if miss:
            print(f"skip {name}: {', '.join(miss)} がありません", file=sys.stderr); continue
        print(f"== {name}: {path} (ckpt {ck})", file=sys.stderr, flush=True)
        r = {"memory": name}
        if not a.skip_names:
            cmd = [sys.executable, "eval_names.py", "--ckpt", ck, "--pkm", path] + (["--limit", str(a.limit)] if a.limit else [])
            r["names"] = parse_names(run(cmd, out / f"{tag}.{name}.eval_names.log"))
        if not a.skip_jsut:
            r["jsut"] = last_json_object(run([sys.executable, "evaluate.py", "--ckpt", ck, "--pkm", path],
                                             out / f"{tag}.{name}.evaluate.log")) or {}
        rows.append(r)
    (out / f"{tag}.compare.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    if not rows:
        print("比較できるメモリがありません"); return 1
    if not a.skip_jsut:
        print(f"\nJSUT / hard ({a.ckpt})  [%]")
        print(f"{'memory':10} {'CER':>6} {'sent':>6} {'loose':>6} {'bndF1':>6} {'accF1':>6} {'hard':>6}")
        for r in rows:
            j = r.get("jsut", {})
            print(f"{r['memory']:10} {fmt(pick(j,'jsut','kana_cer')):>6} {fmt(pick(j,'jsut','sent_acc')):>6} "
                  f"{fmt(pick(j,'jsut','sent_acc_loose')):>6} {fmt(pick(j,'jsut','phrase_boundary_p_r_f1')):>6} "
                  f"{fmt(pick(j,'jsut','accent_nucleus_p_r_f1')):>6} {fmt(pick(j,'hard','sent_acc')):>6}")
    if not a.skip_names:
        print(f"\n人名 (reading / prosody exact / accent F1) [%]  model=辞書なし, memory=辞書メモリあり")
        print(f"{'memory':10} {'split':7} {'mode':7} {'read':>6} {'pros':>6} {'accF1':>6}")
        for r in rows:
            for key, v in sorted(r.get("names", {}).items()):
                split, mode = key.split("/"); split = split.replace("names_eval_", "")
                print(f"{r['memory']:10} {split:7} {mode:7} {fmt(v.get('name_reading_acc')):>6} "
                      f"{fmt(v.get('name_prosody_exact')):>6} {fmt(v.get('accent_f1')):>6}")
            if not r.get("names"):
                print(f"{r['memory']:10} (結果なし: ログを確認)")
    print(f"\n出力: {out}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
