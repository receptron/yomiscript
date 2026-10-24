"""MoLD (Memory-of-Language/Domain) for Yomi-0.

2種類の Memory を持つ:
  1. LexMemory  : .koedict を学習なしで決定的にコンパイルした「辞書メモリ」(差し替え可能)。
                  key = 表層形 (+ 文脈条件), value = 読み(カナ, アクセント記号)。
                  推論時に入力中の該当スパンを見つけ、優先順位
                  「その場の注記 {表層|読み} > 文脈一致の項目 > [default] > 先頭項目 > モデル」で読みを決め、
                  エンコーダ入力のそのスパンを読み(カナ)で置き換える。モデルはカナをそのまま写し、アクセント/境界だけ予測する。
  2. ProductKeyMemory (PKM): エンコーダ層に挿す学習型 key-value メモリ。値テーブルだけを
                  別ファイル (*.mem.safetensors) に保存・差し替えできる (言語/方言/ドメインごと)。
モード: fixed (@dialect や設定で指定) / auto (入力から推定)。明示指定が常に勝つ。
"""
import json, re
from dataclasses import dataclass, field
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn

# ---------------------------------------------------------------- .koedict パーサ
@dataclass
class Entry:
    surface: str
    reading: str
    contexts: list = field(default_factory=list)
    default: bool = False
    accent: int | None = None
    dialect: str | None = None


_COND = re.compile(r"\[(context|default|accent)(?::\s*([^\]]*))?\]")


def hira2kata(s):
    return "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in s)


def parse_koedict(text):
    """KOE-IR v0.1 の @lexicon ブロックを読む。戻り値: list[Entry]"""
    text = "\n".join(l.split("#", 1)[0] if not l.lstrip().startswith("#") else "" for l in text.splitlines())
    out = []
    for m in re.finditer(r"@lexicon\s*(?:\(\s*dialect:\s*(\w+)\s*\))?\s*\{(.*?)\}", text, re.S):
        dialect, body = m.group(1), m.group(2)
        for raw in re.split(r"[;\n]", body):
            raw = raw.strip()
            if "=" not in raw:
                continue
            surf, rest = (x.strip() for x in raw.split("=", 1))
            conds = list(_COND.finditer(rest))
            reading = _COND.sub("", rest).strip()
            e = Entry(surf, hira2kata(reading), dialect=dialect)
            for c in conds:
                if c.group(1) == "default":
                    e.default = True
                elif c.group(1) == "context":
                    e.contexts += [w.strip() for w in c.group(2).split(",") if w.strip()]
                elif c.group(1) == "accent":
                    e.accent = int(c.group(2))
            out.append(e)
    return out


# 性別などの文脈キーの同義語 (KOE-IR に [sex:] が入るまでの橋渡し)
CTX_ALIASES = {"male": "男性", "m": "男性", "男": "男性", "female": "女性", "f": "女性", "女": "女性"}
HONORIFICS = ("さん", "くん", "君", "ちゃん", "様", "さま", "氏", "先生", "選手", "殿")
ANNOT = re.compile(r"\{([^{}|]+)\|([^{}|]+)\}")


class LexMemory:
    """学習なしでコンパイルされる辞書メモリ。scope='always' は常に適用、'name' は人名らしい位置だけ適用。"""

    # レイヤー優先度 (大きいほど勝つ): base(pyopenjtalk変換) < clean(青空ルビ/人手確認) < user(.koedict)
    PRIORITY = {"base": 0, "clean": 50, "user": 100}

    def __init__(self, entries, name="lex", scope="always", dialect=None, layer="user"):
        self.name, self.scope, self.dialect, self.layer = name, scope, dialect, layer
        self.priority = self.PRIORITY.get(layer, 100)
        self.table = {}
        for e in entries:
            if e.dialect not in (None, dialect):
                continue
            self.table.setdefault(e.surface, []).append(e)
        self.maxlen = max((len(s) for s in self.table), default=0)

    @classmethod
    def from_file(cls, path, scope=None, dialect=None, layer=None):
        """入力は .koedict のみ (pyopenjtalk 辞書などは tools/pyopenjtalk_to_koedict.py で先に変換)。
        ヘッダの '# layer: base|clean|user' と '# scope: always|name' を読む。"""
        p = Path(path)
        if p.suffix != ".koedict":
            raise ValueError("Memory コンパイラは .koedict だけを受け付けます")
        txt = p.read_text(encoding="utf-8")
        hdr = dict(re.findall(r"^#\s*(layer|scope):\s*(\w+)", txt, re.M))
        scope = scope or hdr.get("scope") or ("name" if "names" in p.parts else "always")
        layer = layer or hdr.get("layer", "user")
        return cls(parse_koedict(txt), name=p.stem, scope=scope, dialect=dialect, layer=layer)

    def __len__(self):
        return sum(len(v) for v in self.table.values())

    def choose(self, surface, sentence, ctx):
        """読みの決定: 文脈一致 > [default] > 先頭。"""
        cands = self.table[surface]
        for e in cands:
            if e.contexts and any(c in ctx or (len(c) > 1 and c in sentence) for c in e.contexts):
                return e, "context"
        for e in cands:
            if e.default:
                return e, "default"
        plain = [e for e in cands if not e.contexts]
        return (plain or cands)[0], "first"

    def matches(self, text):
        """最長一致で候補スパンを列挙: list[(start, end, surface)]"""
        i, out = 0, []
        while i < len(text):
            for L in range(min(self.maxlen, len(text) - i), 0, -1):
                if text[i:i + L] in self.table:
                    out.append((i, i + L, text[i:i + L])); i += L; break
            else:
                i += 1
        return out

    def to_arrays(self, tgt_vocab=None):
        """メモリをテンソル形式 (keys=表層のハッシュ, values=読みのトークン列) にする。保存/検査用。"""
        surfs = sorted(self.table)
        keys = mx.array([hash_surface(s) for s in surfs], dtype=mx.uint32)
        reads = [self.choose(s, "", set())[0].reading for s in surfs]
        L = max((len(r) for r in reads), default=1)
        enc = (lambda r: tgt_vocab.encode(r)) if tgt_vocab else (lambda r: [ord(c) for c in r])
        vals = mx.array([enc(r) + [0] * (L - len(r)) for r in reads], dtype=mx.int32)
        return keys, vals


def hash_surface(s):
    h = 2166136261
    for b in s.encode("utf-8"):
        h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    return h


def _is_namey(text, s, e, name_spans):
    after, before = text[e:], text[:s]
    if after.startswith(HONORIFICS):
        return True
    return any(ns_e == s or ns_s == e for ns_s, ns_e in name_spans)  # 苗字+名前のように隣接


class MemoryRouter:
    """複数の LexMemory を束ね、優先順位どおりに入力を書き換える。"""

    def __init__(self, memories=()):
        self.memories = list(memories)

    def add(self, mem):
        self.memories = [m for m in self.memories if m.name != mem.name] + [mem]; return self

    def remove(self, name):
        self.memories = [m for m in self.memories if m.name != name]; return self

    def resolve(self, text, context=None):
        """戻り値: (書き換え後テキスト, 適用ログ list[dict])。context: {'sex':'female'} や ['朝市'] など。"""
        ctx = set()
        if isinstance(context, dict):
            for v in context.values():
                ctx.add(CTX_ALIASES.get(str(v).lower(), str(v)))
        elif context:
            ctx |= {CTX_ALIASES.get(str(c).lower(), str(c)) for c in context}
        log, spans = [], []  # spans: (s, e, reading)
        # 1) その場の注記が最優先
        plain, pos, mapping = [], 0, []
        for m in ANNOT.finditer(text):
            plain.append(text[pos:m.start()]); start = sum(map(len, plain))
            plain.append(m.group(1)); spans.append((start, start + len(m.group(1)), hira2kata(m.group(2))))
            log.append({"surface": m.group(1), "reading": hira2kata(m.group(2)), "by": "annotation", "memory": "-"})
            pos = m.end()
        plain.append(text[pos:]); text = "".join(plain)
        taken = lambda s, e: any(not (e <= a or s >= b) for a, b, _ in spans)
        # 2) 常時適用の辞書 → 3) 人名辞書 (人名らしい位置だけ)。苗字が見つかると隣の名前も人名扱い。
        name_mems = [m for m in self.memories if m.scope == "name"]
        cand = []
        for m in sorted(name_mems, key=lambda m: -m.priority):
            cand += [(s, e, sf, m) for s, e, sf in m.matches(text)]
        name_spans = []
        changed = True
        while changed:
            changed = False
            for s, e, sf, m in sorted(cand, key=lambda x: (x[0], -(x[1] - x[0]))):
                if taken(s, e) or (s, e) in name_spans:
                    continue
                pair = any(m2 is not m and (s2 == e or e2 == s) for s2, e2, _, m2 in cand)  # 苗字+名前の並び
                if pair or _is_namey(text, s, e, name_spans):
                    ent, by = m.choose(sf, text, ctx)
                    spans.append((s, e, ent.reading.replace("'", ""))); name_spans.append((s, e)); changed = True
                    log.append({"surface": sf, "reading": ent.reading, "by": by, "memory": m.name})
        for m in sorted(self.memories, key=lambda m: -m.priority):  # 上位レイヤーが先に取る = 上書き
            if m.scope != "always":
                continue
            for s, e, sf in m.matches(text):
                if not taken(s, e):
                    ent, by = m.choose(sf, text, ctx)
                    spans.append((s, e, ent.reading.replace("'", "")))
                    log.append({"surface": sf, "reading": ent.reading, "by": by, "memory": m.name})
        out, pos = [], 0
        for s, e, r in sorted(spans):
            out += [text[pos:s], r]; pos = e
        out.append(text[pos:])
        return "".join(out), log


# ---------------------------------------------------------------- 学習型メモリ層 (Product-Key Memory)
class ProductKeyMemory(nn.Module):
    """Lample+ 2019 の product-key memory。n_keys^2 個のスロット、トークンごとに top-k を読む。
    values は初期値 0 なので、既存チェックポイントに足しても出力は変わらない (後方互換)。"""

    def __init__(self, d, n_keys=64, k_dim=64, topk=8, d_value=None):
        super().__init__()
        self.n_keys, self.topk, self.k_dim = n_keys, topk, k_dim
        self.norm = nn.LayerNorm(d)
        self.query = nn.Linear(d, 2 * k_dim, bias=False)
        self.subkeys = mx.random.normal((2, n_keys, k_dim)) * (k_dim ** -0.5)
        self.slots = mx.zeros((n_keys * n_keys, d))

    def __call__(self, x):
        B, L, D = x.shape
        q = self.query(self.norm(x)).reshape(B, L, 2, self.k_dim)
        s1 = q[..., 0, :] @ self.subkeys[0].T  # (B,L,n)
        s2 = q[..., 1, :] @ self.subkeys[1].T
        k = self.topk
        i1 = mx.stop_gradient(mx.argpartition(-s1, k - 1, axis=-1)[..., :k]); v1 = mx.take_along_axis(s1, i1, -1)
        i2 = mx.stop_gradient(mx.argpartition(-s2, k - 1, axis=-1)[..., :k]); v2 = mx.take_along_axis(s2, i2, -1)
        sc = (v1[..., :, None] + v2[..., None, :]).reshape(B, L, k * k)
        idx = (i1[..., :, None] * self.n_keys + i2[..., None, :]).reshape(B, L, k * k)
        j = mx.stop_gradient(mx.argpartition(-sc, k - 1, axis=-1)[..., :k])
        sc, idx = mx.take_along_axis(sc, j, -1), mx.stop_gradient(mx.take_along_axis(idx, j, -1))
        w = mx.softmax(sc.astype(mx.float32), axis=-1).astype(x.dtype)
        vals = self.slots[idx]  # (B,L,k,D)
        return (w[..., None] * vals).sum(axis=2)


def memory_params(model):
    """差し替え対象 (メモリ層) のパラメータだけを平坦な dict で返す。"""
    from mlx.utils import tree_flatten
    return {k: v for k, v in tree_flatten(model.parameters()) if ".mem." in f".{k}." or k.startswith("mem")}


def save_memory(model, path, meta=None):
    p = memory_params(model)
    if not p:
        raise ValueError("このモデルにはメモリ層がありません (config.model.memory を設定)")
    mx.save_safetensors(str(path), p, metadata={"mold": json.dumps(meta or {}, ensure_ascii=False)})


def load_memory(model, path):
    """共有重みはそのまま、メモリ層だけを差し替える。"""
    w = mx.load(str(path))
    own = memory_params(model)
    bad = [k for k in w if k not in own or own[k].shape != w[k].shape]
    if bad:
        raise ValueError(f"メモリの形が合いません: {bad[:3]}")
    model.load_weights(list(w.items()), strict=False)
    return model


def detect_mode(text, explicit=None):
    """auto モードの簡易推定。明示指定 (explicit) が常に勝つ。"""
    if explicit:
        return explicit
    if re.search(r"(さかい|やねん|あかん|ほんま|おおきに)", text):
        return "kansai"
    return None
