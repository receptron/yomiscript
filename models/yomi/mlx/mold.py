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


# ---- 長音の正規化: 学習ラベル (pyopenjtalk の pron 形, g2p(kana=True)) に合わせる
_O = set("オコソトノホモヨロヲゴゾドボポョォ")
_E = set("エケセテネヘメレゲゼデベペェ")
_U = set("ウクスツヌフムユルグズヅブプュゥ")


def to_pron(kana):
    """辞書の読み (表記形: サトウ, ケイ) を発音形 (サトー, ケー) にする。o段/u段+ウ→ー, e段+イ→ー (pyopenjtalk: 優→ユー, 裕子→ユーコ)。
    pyopenjtalk は語中のこれらを長音にするため、名前・名詞の辞書読みではこれで学習ラベルと揃う。
    動詞の語尾 (オモウ等) は辞書側で ' や [pron] を付けず、そのまま書いた場合でも人名用途では問題になりにくい。"""
    out = []
    for c in kana:
        if out and ((c == "ウ" and (out[-1] in _O or out[-1] in _U)) or (c == "イ" and out[-1] in _E)):
            out.append("ー")
        else:
            out.append(c)
    return "".join(out)


SMALL = set("ャュョァィゥェォヮ")


def morae(k):
    m = []
    for c in k:
        if c in SMALL and m:
            m[-1] += c
        else:
            m.append(c)
    return m


def split_name_phrases(output, pairs):
    """苗字+名前が1つのアクセント句に融合した出力に '#' を差し込み、名前側を新しい句にする。
    pairs: [(苗字の読み, 名前の読み)] (発音形)。名前側の先頭が頭高 ']' でなければ1モーラ目の後に '[' を入れる。"""
    for sur, giv in pairs:
        kana_pos = [i for i, c in enumerate(output) if c not in "^$?#_[]"]
        stream = "".join(output[i] for i in kana_pos)
        j = stream.find(sur + giv)
        if j < 0:
            continue
        b = kana_pos[j + len(sur)]          # 名前の先頭文字の出力位置
        pre = output[:b]
        if pre.endswith("#"):
            continue
        post = output[b:]
        # 名前側の最初のモーラの後ろを調べる
        m1 = morae(giv)[0]
        after = post[len(m1):]
        if not after.startswith(("]", "[")):
            post = m1 + "[" + after
        out = pre.rstrip("[]") + ("]" if pre.endswith("]") else "") + "#" + post
        output = out
    return output


# 性別などの文脈キーの同義語 (KOE-IR に [sex:] が入るまでの橋渡し)
CTX_ALIASES = {"male": "男性", "m": "男性", "男": "男性", "female": "女性", "f": "女性", "女": "女性"}
HONORIFICS = ("さん", "くん", "君", "ちゃん", "様", "さま", "氏", "先生", "選手", "殿")
KANJI = re.compile(r"[\u4e00-\u9fff々〆ヶ]")
# 名前の前に来やすい語 (父の匠 / 名前は璃子 / 彼女八重子)。敬称が無くても人名辞書を使う手がかり。
NAME_CUES = ("父の", "母の", "兄の", "姉の", "弟の", "妹の", "息子の", "娘の", "夫の", "妻の", "祖父の", "祖母の",
             "孫の", "友人の", "名前は", "名は", "彼女", "彼", "私は", "僕は")
NAME_TAILS = ("が生まれ", "と申します", "といいます", "と言います", "です。")
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

    def all_matches(self, text):
        """重なりを許して全一致を列挙 (ルーターで最長一致をレイヤー横断で選ぶため)。"""
        out = []
        for i in range(len(text)):
            for L in range(1, min(self.maxlen, len(text) - i) + 1):
                if text[i:i + L] in self.table:
                    out.append((i, i + L, text[i:i + L]))
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
    if before.endswith(NAME_CUES) and (e == len(text) or not KANJI.match(text[e])):
        return True
    if after.startswith(NAME_TAILS) and (s == 0 or not KANJI.match(text[s - 1])) and before.endswith(("の", "は", "が", "、")):
        return True
    return any(ns_e == s or ns_s == e for ns_s, ns_e in name_spans)  # 苗字+名前のように隣接


def _default_tokenizer():
    """形態素境界の判定に pyopenjtalk (あれば) を使う。無ければ None (簡易規則にフォールバック)。"""
    try:
        import pyopenjtalk
    except Exception:
        return None

    def tok(text):
        b, pos = {0}, 0
        for f in pyopenjtalk.run_frontend(text):
            k = text.find(f["string"], pos)
            if k < 0:
                return None
            pos = k + len(f["string"]); b |= {k, pos}
        return b
    return tok




class MemoryRouter:
    """複数の LexMemory を束ね、優先順位どおりに入力を書き換える。
    tokenizer: text -> 形態素境界の位置集合。'always' 辞書の項目はスパンが形態素境界に揃うときだけ使う
    (朝市 の中の 市 は置換しない)。'auto' なら pyopenjtalk があれば使い、無ければ「前後が漢字でない」簡易規則。"""

    def __init__(self, memories=(), tokenizer="auto", normalize=True, split_names=True):
        self.memories = list(memories)
        self.tokenizer = _default_tokenizer() if tokenizer == "auto" else tokenizer
        self.normalize, self.split_names = normalize, split_names
        self.last_pairs = []

    def _standalone(self, text, s, e, bounds):
        if bounds is not None:
            return s in bounds and e in bounds
        prev_k = s > 0 and KANJI.match(text[s - 1])
        next_k = e < len(text) and KANJI.match(text[e])
        return not (prev_k or next_k)

    def postprocess(self, output, log):
        if not self.split_names:
            return output
        pairs = [(a["reading_pron"], b["reading_pron"]) for a, b in zip(log, log[1:])
                 if a.get("name_end") is not None and a.get("name_end") == b.get("name_start")]
        return split_name_phrases(output, pairs)

    def add(self, mem):
        self.memories = [m for m in self.memories if m.name != mem.name] + [mem]; return self

    def remove(self, name):
        self.memories = [m for m in self.memories if m.name != name]; return self

    def _pron(self, r):
        r = r.replace("'", "")
        return to_pron(r) if self.normalize else r

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
                    rp = self._pron(ent.reading)
                    spans.append((s, e, rp)); name_spans.append((s, e)); changed = True
                    log.append({"surface": sf, "reading": ent.reading, "reading_pron": rp, "by": by, "memory": m.name,
                                "name_start": s, "name_end": e})
        # always 辞書: 全レイヤーの候補を「長い一致 > 高いレイヤー」の順に取る。形態素の途中は使わない。
        cands = []
        for m in self.memories:
            if m.scope == "always":
                cands += [(s, e, sf, m) for s, e, sf in m.all_matches(text)]
        bounds = self.tokenizer(text) if (self.tokenizer and cands) else None
        cands.sort(key=lambda x: (-(x[1] - x[0]), -x[3].priority, x[0]))
        for s, e, sf, m in cands:
            if taken(s, e) or not self._standalone(text, s, e, bounds):
                continue
            ent, by = m.choose(sf, text, ctx)
            spans.append((s, e, self._pron(ent.reading)))
            log.append({"surface": sf, "reading": ent.reading, "reading_pron": self._pron(ent.reading), "by": by, "memory": m.name})
        log.sort(key=lambda l: l.get("name_start", 1 << 30))
        out, pos = [], 0
        for s, e, r in sorted(spans):
            out += [text[pos:s], r]; pos = e
        out.append(text[pos:])
        return "".join(out), log


# ---------------------------------------------------------------- 学習型メモリ層 (Product-Key Memory)
class ProductKeyMemory(nn.Module):
    """Lample+ 2019 の product-key memory。n_keys^2 個のスロット、トークンごとに top-k を読む。
    values は初期値 0 なので、既存チェックポイントに足しても出力は変わらない (後方互換)。"""

    def __init__(self, d, n_keys=64, k_dim=64, topk=8, d_value=None, temp=15.0, gate_init=1.0, balance=0.01,
                 cond_gate=False, cond_bias=0.0):
        super().__init__()
        self.n_keys, self.topk, self.k_dim = n_keys, topk, k_dim
        self.norm = nn.LayerNorm(d)
        self.query = nn.Linear(d, 2 * k_dim, bias=False)
        self.subkeys = mx.random.normal((2, n_keys, k_dim)) * (k_dim ** -0.5)
        # 値テーブルは 0、ゲートは 0 でない値 (既定 1) から始める。開始時の出力は 0 (後方互換・雑音を足さない) で、
        # 値には gate*rms 倍の勾配がすぐ流れる。旧版 (乱数値+ゲート0) は ゲートが ~0 のまま動かず、乱数値は雑音になった
        self.slots = mx.zeros((n_keys * n_keys, d))
        self.gate = mx.full((1,), gate_init)
        # v2: query 半分と subkey を L2 正規化したコサイン類似度 x 温度。生の内積はスコアが ~300 に
        # 膨らみ softmax が one-hot になってスロットが偏る (routing collapse) ため
        self.temp = temp
        self.balance = balance  # 負荷分散の補助 loss の係数 (train.train_loss_fn が aux を足す)
        # aux は配列なのでモジュール属性にするとパラメータ扱いになる。ただの入れ物に入れる
        self._st = __import__('types').SimpleNamespace(aux=None, off=False, cg=None)
        if cond_gate:  # 入力に応じたゲート sigmoid(w·LN(x)+b): 一般文では黙る (積み重ねた人名メモリ用)
            self.cgate = nn.Linear(d, 1)
            self.cgate.weight = mx.zeros_like(self.cgate.weight); self.cgate.bias = mx.full((1,), cond_bias)

    probe = None  # 診断用: list を入れると (重み, スロット番号, 出力, 入力, スコア) を貯める

    @staticmethod
    def _l2(v):
        return v * mx.rsqrt((v * v).sum(-1, keepdims=True) + 1e-6)

    def __call__(self, x):
        if self._st.off:  # 教師 (このメモリ無し) の出力を作るときに一時的に止める
            return mx.zeros_like(x)
        B, L, D = x.shape
        q = self.query(self.norm(x)).reshape(B, L, 2, self.k_dim).astype(mx.float32)
        q = self._l2(q); sk = self._l2(self.subkeys.astype(mx.float32))
        s1 = (q[..., 0, :] @ sk[0].T) * self.temp  # (B,L,n) 値域 [-temp, temp]
        s2 = (q[..., 1, :] @ sk[1].T) * self.temp
        # 負荷分散: 各半分のキー分布 (全トークン平均) が一様から外れるほど大きい。一様なら 0
        p1 = mx.softmax(s1, axis=-1).reshape(-1, self.n_keys).mean(0)
        p2 = mx.softmax(s2, axis=-1).reshape(-1, self.n_keys).mean(0)
        self._st.aux = self.n_keys * ((p1 * p1).sum() + (p2 * p2).sum()) - 2.0
        k = self.topk
        i1 = mx.stop_gradient(mx.argpartition(-s1, k - 1, axis=-1)[..., :k]); v1 = mx.take_along_axis(s1, i1, -1)
        i2 = mx.stop_gradient(mx.argpartition(-s2, k - 1, axis=-1)[..., :k]); v2 = mx.take_along_axis(s2, i2, -1)
        sc = (v1[..., :, None] + v2[..., None, :]).reshape(B, L, k * k)
        idx = (i1[..., :, None] * self.n_keys + i2[..., None, :]).reshape(B, L, k * k)
        j = mx.stop_gradient(mx.argpartition(-sc, k - 1, axis=-1)[..., :k])
        sc, idx = mx.take_along_axis(sc, j, -1), mx.stop_gradient(mx.take_along_axis(idx, j, -1))
        w = mx.softmax(sc, axis=-1).astype(x.dtype)
        vals = self.slots[idx]  # (B,L,k,D)
        out = (w[..., None] * vals).sum(axis=2)
        # 残差の大きさ (RMS) に合わせて出力を拡大する。残差のノルムが ~150 あるため、生の値では効かない
        rms = mx.stop_gradient(mx.sqrt(mx.mean(x.astype(mx.float32) ** 2, axis=-1, keepdims=True))).astype(x.dtype)
        out = self.gate * rms * out
        if "cgate" in self:
            g = mx.sigmoid(self.cgate(self.norm(x)).astype(mx.float32))
            self._st.cg = g[..., 0]  # (B,L) 条件付きゲート値 (漏れ対策の loss と診断用)
            out = g.astype(out.dtype) * out
        if ProductKeyMemory.probe is not None:
            ProductKeyMemory.probe.append((w, idx, out, x, sc))
        return out


def memory_aux_loss(model):
    """メモリ層の負荷分散 loss (係数込み) の合計。メモリ層がなければ 0。"""
    tot = 0.0
    for m in memories(model):
        if m._st.aux is not None and m.balance:
            tot = tot + m.balance * m._st.aux
    return tot


MEM_GROUPS = ("mem", "mem2")
_MEM_RE = re.compile(r"(^|\.)(mem|mem2)\.")


def is_mem_key(k, group=None):
    m = _MEM_RE.search(k)
    return bool(m) and (group is None or m.group(2) == group)


def memories(model, group=None):
    """エンコーダ内のメモリ層を順番 (層順, 各層で mem→mem2) に返す。"""
    out = []
    for l in getattr(model, "enc", []):
        for g in MEM_GROUPS:
            if g in l and (group is None or g == group):
                out.append(l[g])
    return out


def split_pkm(spec):
    """--pkm の指定 (str / カンマ区切り / list, 入れ子可) を平坦なパスのリストにする。"""
    if not spec:
        return []
    if isinstance(spec, (list, tuple)):
        return [p for s in spec for p in split_pkm(s)]
    return [p for p in str(spec).split(",") if p]


def memory_params(model, group=None):
    """差し替え対象 (メモリ層) のパラメータだけを平坦な dict で返す。group: "mem" / "mem2" / None (全部)。"""
    from mlx.utils import tree_flatten
    return {k: v for k, v in tree_flatten(model.parameters()) if is_mem_key(k, group)}


def save_memory(model, path, meta=None, group=None):
    p = memory_params(model, group)
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
