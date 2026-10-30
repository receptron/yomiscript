"""MoLD (Memory-of-Language/Domain) for Yomi-0.

It has two kinds of memory:
  1. LexMemory  : a "lexicon memory" compiled deterministically from .koedict without training (swappable).
                  key = surface form (+ context condition), value = reading (kana, accent marks).
                  At inference it finds the matching spans in the input, decides the reading by the priority
                  "inline annotation {surface|reading} > entry whose context matches > [default] > first entry > model",
                  and replaces that span of the encoder input with the reading (kana). The model copies the kana and predicts only accent/boundaries.
  2. ProductKeyMemory (PKM): a learned key-value memory inserted into the encoder layers. Only the value table
                  can be saved to and swapped from a separate file (*.mem.safetensors) (per language / dialect / domain).
Modes: fixed (given by @dialect or settings) / auto (inferred from the input). An explicit setting always wins.
"""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn


# ---------------------------------------------------------------- .koedict parser
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
    """Read the @lexicon blocks of KOE-IR v0.1. Returns list[Entry]"""
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


# ---- Long-vowel normalization: match the training labels (pyopenjtalk's pron form, g2p(kana=True))
_O = set("オコソトノホモヨロヲゴゾドボポョォ")
_E = set("エケセテネヘメレゲゼデベペェ")
_U = set("ウクスツヌフムユルグズヅブプュゥ")


def to_pron(kana):
    """Turn a lexicon reading (spelling form: サトウ, ケイ) into the pronounced form (サトー, ケー).
    o/u-row + ウ → ー, e-row + イ → ー (pyopenjtalk: 優→ユー, 裕子→ユーコ).
    pyopenjtalk makes these long vowels inside words, so for lexicon readings of names and nouns this matches the training labels.
    Verb endings (オモウ etc.) written as is in the lexicon, without ' or [pron], are unlikely to matter for personal names."""
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
    """Insert '#' into output where surname + given name fused into one accent phrase, making the given name a new phrase.
    pairs: [(surname reading, given-name reading)] (pronounced form). If the given name does not start with a head-high ']', insert '[' after its first mora."""
    for sur, giv in pairs:
        kana_pos = [i for i, c in enumerate(output) if c not in "^$?#_[]"]
        stream = "".join(output[i] for i in kana_pos)
        j = stream.find(sur + giv)
        if j < 0:
            continue
        b = kana_pos[j + len(sur)]  # output position of the first character of the given name
        pre = output[:b]
        if pre.endswith("#"):
            continue
        post = output[b:]
        # Look at what follows the first mora of the given name
        m1 = morae(giv)[0]
        after = post[len(m1) :]
        if not after.startswith(("]", "[")):
            post = m1 + "[" + after
        out = pre.rstrip("[]") + ("]" if pre.endswith("]") else "") + "#" + post
        output = out
    return output


# Synonyms for context keys such as sex (a bridge until [sex:] is in KOE-IR)
CTX_ALIASES = {"male": "男性", "m": "男性", "男": "男性", "female": "女性", "f": "女性", "女": "女性"}
HONORIFICS = ("さん", "くん", "君", "ちゃん", "様", "さま", "氏", "先生", "選手", "殿")
KANJI = re.compile(r"[\u4e00-\u9fff々〆ヶ]")
# Words that tend to precede a name (父の匠 / 名前は璃子 / 彼女八重子). Cues to use the personal-name lexicon even without an honorific.
NAME_CUES = (
    "父の",
    "母の",
    "兄の",
    "姉の",
    "弟の",
    "妹の",
    "息子の",
    "娘の",
    "夫の",
    "妻の",
    "祖父の",
    "祖母の",
    "孫の",
    "友人の",
    "名前は",
    "名は",
    "彼女",
    "彼",
    "私は",
    "僕は",
)
NAME_TAILS = ("が生まれ", "と申します", "といいます", "と言います", "です。")
ANNOT = re.compile(r"\{([^{}|]+)\|([^{}|]+)\}")


class LexMemory:
    """Lexicon memory compiled without training. scope='always' always applies; 'name' applies only in positions that look like personal names."""

    # Layer priority (higher wins): base (converted from pyopenjtalk) < clean (Aozora ruby / checked by hand) < user (.koedict)
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
        """Input is .koedict only (convert the pyopenjtalk dictionary and the like first with tools/pyopenjtalk_to_koedict.py).
        Reads the header lines '# layer: base|clean|user' and '# scope: always|name'."""
        p = Path(path)
        if p.suffix != ".koedict":
            raise ValueError("the Memory compiler accepts only .koedict")
        txt = p.read_text(encoding="utf-8")
        hdr = dict(re.findall(r"^#\s*(layer|scope):\s*(\w+)", txt, re.M))
        scope = scope or hdr.get("scope") or ("name" if "names" in p.parts else "always")
        layer = layer or hdr.get("layer", "user")
        return cls(parse_koedict(txt), name=p.stem, scope=scope, dialect=dialect, layer=layer)

    def __len__(self):
        return sum(len(v) for v in self.table.values())

    def choose(self, surface, sentence, ctx):
        """Decide the reading: context match > [default] > first."""
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
        """List candidate spans by longest match: list[(start, end, surface)]"""
        i, out = 0, []
        while i < len(text):
            for L in range(min(self.maxlen, len(text) - i), 0, -1):
                if text[i : i + L] in self.table:
                    out.append((i, i + L, text[i : i + L]))
                    i += L
                    break
            else:
                i += 1
        return out

    def all_matches(self, text):
        """List all matches, overlaps allowed (so the router can pick the longest match across layers)."""
        out = []
        for i in range(len(text)):
            for L in range(1, min(self.maxlen, len(text) - i) + 1):
                if text[i : i + L] in self.table:
                    out.append((i, i + L, text[i : i + L]))
        return out

    def to_arrays(self, tgt_vocab=None):
        """Turn the memory into tensor form (keys = surface hashes, values = reading token sequences). For saving / inspection."""
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
    return any(ns_e == s or ns_s == e for ns_s, ns_e in name_spans)  # adjacent, like surname + given name


def _default_tokenizer():
    """Use pyopenjtalk (if installed) to find morpheme boundaries. None if not (fall back to the simple rule)."""
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
            pos = k + len(f["string"])
            b |= {k, pos}
        return b

    return tok


class MemoryRouter:
    """Combine several LexMemory objects and rewrite the input in priority order.
    tokenizer: text -> set of morpheme boundary positions. Entries of 'always' lexicons are used only when the span is aligned with morpheme boundaries
    (the 市 inside 朝市 is not replaced). 'auto' uses pyopenjtalk if installed, otherwise the simple rule "the neighbors are not kanji"."""

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
        pairs = [
            (a["reading_pron"], b["reading_pron"])
            for a, b in zip(log, log[1:], strict=False)
            if a.get("name_end") is not None and a.get("name_end") == b.get("name_start")
        ]
        return split_name_phrases(output, pairs)

    def add(self, mem):
        self.memories = [m for m in self.memories if m.name != mem.name] + [mem]
        return self

    def remove(self, name):
        self.memories = [m for m in self.memories if m.name != name]
        return self

    def _pron(self, r):
        r = r.replace("'", "")
        return to_pron(r) if self.normalize else r

    def resolve(self, text, context=None):
        """Returns (rewritten text, application log list[dict]). context: e.g. {'sex':'female'} or ['朝市']."""
        ctx = set()
        if isinstance(context, dict):
            for v in context.values():
                ctx.add(CTX_ALIASES.get(str(v).lower(), str(v)))
        elif context:
            ctx |= {CTX_ALIASES.get(str(c).lower(), str(c)) for c in context}
        log, spans = [], []  # spans: (s, e, reading)
        # 1) Inline annotations come first
        plain, pos, _mapping = [], 0, []
        for m in ANNOT.finditer(text):
            plain.append(text[pos : m.start()])
            start = sum(map(len, plain))
            plain.append(m.group(1))
            spans.append((start, start + len(m.group(1)), hira2kata(m.group(2))))
            log.append({"surface": m.group(1), "reading": hira2kata(m.group(2)), "by": "annotation", "memory": "-"})
            pos = m.end()
        plain.append(text[pos:])
        text = "".join(plain)

        def taken(s, e):
            return any(not (e <= a or s >= b) for a, b, _ in spans)

        # 2) Always-applied lexicons -> 3) personal-name lexicons (only in positions that look like names).
        #    A surname found makes the adjacent name a personal name too.
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
                pair = any(m2 is not m and (s2 == e or e2 == s) for s2, e2, _, m2 in cand)  # surname + given name side by side
                if pair or _is_namey(text, s, e, name_spans):
                    ent, by = m.choose(sf, text, ctx)
                    rp = self._pron(ent.reading)
                    spans.append((s, e, rp))
                    name_spans.append((s, e))
                    changed = True
                    log.append({"surface": sf, "reading": ent.reading, "reading_pron": rp, "by": by, "memory": m.name, "name_start": s, "name_end": e})
        # Always lexicons: take candidates from all layers in the order "longer match > higher layer". Never inside a morpheme.
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
            out += [text[pos:s], r]
            pos = e
        out.append(text[pos:])
        return "".join(out), log


# ---------------------------------------------------------------- Learned memory layer (Product-Key Memory)
class ProductKeyMemory(nn.Module):
    """The product-key memory of Lample+ 2019. n_keys^2 slots; each token reads its top-k.
    values start at 0, so adding it to an existing checkpoint does not change the output (backward compatible)."""

    def __init__(
        self,
        d,
        n_keys=64,
        k_dim=64,
        topk=8,
        d_value=None,
        temp=15.0,
        gate_init=1.0,
        balance=0.01,
        cond_gate=False,
        cond_bias=0.0,
        gate_floor=0.0,
        cg_thresh=0.0,
    ):
        super().__init__()
        # gate_floor: lower bound of the gate used for the output (straight-through: the gradient still flows to the gate, so it can recover).
        #   When a strong base model (tiny_aug) is frozen and only the memory is trained, the noise of the initial values drives the gate to 0,
        #   the value gradients vanish as they are scaled by the gate, and it never comes back (mfz_default on the Mac: gate 0.0003).
        #   With a floor the values keep learning
        # cg_thresh: at inference (eval), zero the output for tokens whose conditional gate is below the threshold (cuts leaks into general sentences)
        self.gate_floor, self.cg_thresh = gate_floor, cg_thresh
        self.n_keys, self.topk, self.k_dim = n_keys, topk, k_dim
        self.norm = nn.LayerNorm(d)
        self.query = nn.Linear(d, 2 * k_dim, bias=False)
        self.subkeys = mx.random.normal((2, n_keys, k_dim)) * (k_dim**-0.5)
        # The value table starts at 0 and the gate at a nonzero value (default 1). The output at the start is 0 (backward compatible, no added noise),
        # and the values get a gradient scaled by gate*rms right away. The old version (random values + gate 0) left the gate stuck at ~0,
        # and the random values became noise
        self.slots = mx.zeros((n_keys * n_keys, d))
        self.gate = mx.full((1,), gate_init)
        # v2: cosine similarity of the L2-normalized query halves and subkeys x temperature. The raw dot product inflates scores to ~300,
        # making softmax one-hot and skewing the slots (routing collapse)
        self.temp = temp
        self.balance = balance  # coefficient of the auxiliary load-balancing loss (train.train_loss_fn adds aux)
        # aux is an array, so as a module attribute it would count as a parameter. Keep it in a plain container
        self._st = __import__("types").SimpleNamespace(aux=None, off=False, cg=None)
        if cond_gate:  # input-dependent gate sigmoid(w·LN(x)+b): stays silent on general sentences (for the stacked personal-name memory)
            self.cgate = nn.Linear(d, 1)
            self.cgate.weight = mx.zeros_like(self.cgate.weight)
            self.cgate.bias = mx.full((1,), cond_bias)

    probe = None  # for diagnostics: set it to a list to collect (weights, slot ids, output, input, scores)

    @staticmethod
    def _l2(v):
        return v * mx.rsqrt((v * v).sum(-1, keepdims=True) + 1e-6)

    def __call__(self, x):
        if self._st.off:  # switched off temporarily to produce the teacher output (without this memory)
            return mx.zeros_like(x)
        B, L, D = x.shape
        q = self.query(self.norm(x)).reshape(B, L, 2, self.k_dim).astype(mx.float32)
        q = self._l2(q)
        sk = self._l2(self.subkeys.astype(mx.float32))
        s1 = (q[..., 0, :] @ sk[0].T) * self.temp  # (B,L,n) range [-temp, temp]
        s2 = (q[..., 1, :] @ sk[1].T) * self.temp
        # Load balancing: grows as the key distribution of each half (averaged over all tokens) departs from uniform. 0 if uniform
        p1 = mx.softmax(s1, axis=-1).reshape(-1, self.n_keys).mean(0)
        p2 = mx.softmax(s2, axis=-1).reshape(-1, self.n_keys).mean(0)
        self._st.aux = self.n_keys * ((p1 * p1).sum() + (p2 * p2).sum()) - 2.0
        k = self.topk
        i1 = mx.stop_gradient(mx.argpartition(-s1, k - 1, axis=-1)[..., :k])
        v1 = mx.take_along_axis(s1, i1, -1)
        i2 = mx.stop_gradient(mx.argpartition(-s2, k - 1, axis=-1)[..., :k])
        v2 = mx.take_along_axis(s2, i2, -1)
        sc = (v1[..., :, None] + v2[..., None, :]).reshape(B, L, k * k)
        idx = (i1[..., :, None] * self.n_keys + i2[..., None, :]).reshape(B, L, k * k)
        j = mx.stop_gradient(mx.argpartition(-sc, k - 1, axis=-1)[..., :k])
        sc, idx = mx.take_along_axis(sc, j, -1), mx.stop_gradient(mx.take_along_axis(idx, j, -1))
        w = mx.softmax(sc, axis=-1).astype(x.dtype)
        vals = self.slots[idx]  # (B,L,k,D)
        out = (w[..., None] * vals).sum(axis=2)
        # Scale the output to the size (RMS) of the residual. The residual norm is ~150, so the raw values have no effect
        rms = mx.stop_gradient(mx.sqrt(mx.mean(x.astype(mx.float32) ** 2, axis=-1, keepdims=True))).astype(x.dtype)
        g0 = self.gate
        if self.gate_floor:
            g0 = g0 + mx.stop_gradient(mx.maximum(g0, self.gate_floor) - g0)
        out = g0 * rms * out
        if "cgate" in self:
            g = mx.sigmoid(self.cgate(self.norm(x)).astype(mx.float32))
            self._st.cg = g[..., 0]  # (B,L) conditional gate values (for the leak loss and diagnostics)
            if self.cg_thresh and not self.training:
                g = g * (g >= self.cg_thresh)
            out = g.astype(out.dtype) * out
        if ProductKeyMemory.probe is not None:
            ProductKeyMemory.probe.append((w, idx, out, x, sc))
        return out


def memory_aux_loss(model):
    """Sum of the load-balancing losses of the memory layers (with coefficients). 0 if there are no memory layers."""
    tot = 0.0
    for m in memories(model):
        if m._st.aux is not None and m.balance:
            tot = tot + m.balance * m._st.aux
    return tot


MEM_GROUPS = ("mem", "mem2", "mem3")
_MEM_RE = re.compile(r"(^|\.)(mem|mem2|mem3)\.")


def is_mem_key(k, group=None):
    m = _MEM_RE.search(k)
    return bool(m) and (group is None or m.group(2) == group)


def memories(model, group=None):
    """Return the memory layers of the encoder in order (layer order, mem -> mem2 within each layer)."""
    out = []
    for l in getattr(model, "enc", []):
        for g in MEM_GROUPS:
            if g in l and (group is None or g == group):
                out.append(l[g])
    return out


def split_pkm(spec):
    """Flatten a --pkm value (str / comma-separated / list, nesting allowed) into a list of paths."""
    if not spec:
        return []
    if isinstance(spec, (list, tuple)):
        return [p for s in spec for p in split_pkm(s)]
    return [p for p in str(spec).split(",") if p]


def memory_params(model, group=None):
    """Return only the parameters to swap (the memory layers) as a flat dict. group: "mem" / "mem2" / None (all)."""
    from mlx.utils import tree_flatten

    return {k: v for k, v in tree_flatten(model.parameters()) if is_mem_key(k, group)}


def save_memory(model, path, meta=None, group=None):
    p = memory_params(model, group)
    if not p:
        raise ValueError("this model has no memory layers (set config.model.memory)")
    mx.save_safetensors(str(path), p, metadata={"mold": json.dumps(meta or {}, ensure_ascii=False)})


def load_memory(model, path):
    """Swap only the memory layers, keeping the shared weights."""
    w = mx.load(str(path))
    own = memory_params(model)
    bad = [k for k in w if k not in own or own[k].shape != w[k].shape]
    if bad:
        raise ValueError(f"memory shapes do not match: {bad[:3]}")
    model.load_weights(list(w.items()), strict=False)
    groups = sorted({_MEM_RE.search(k).group(2) for k in w if _MEM_RE.search(k)})
    for k, v in w.items():  # warn if the loaded memory is effectively off (gate ~ 0 / values ~ 0): that is why a default memory has no effect when stacking
        if k.endswith(".gate") and is_mem_key(k) and float(mx.abs(v).max()) < 1e-3:
            print(f"warning: {path}: {k} = {float(v.reshape(-1)[0]):.4f} (gate ~ 0 -> this memory has no effect on the output)", file=__import__("sys").stderr)
    if not any(k.endswith(".gate") for k in w):
        print(f"warning: {path}: no gate included (the checkpoint's gate is kept)", file=__import__("sys").stderr)
    model._mem_sources = getattr(model, "_mem_sources", []) + [(str(path), groups)]
    return model


def memory_file_summary(path):
    """Summary of a memory file's contents (groups, gate values, mean absolute value)."""
    w = mx.load(str(path))
    return {
        k: (round(float(v.reshape(-1)[0]), 4) if k.endswith(".gate") else round(float(mx.abs(v).mean()), 5))
        for k, v in w.items()
        if k.endswith((".gate", ".slots"))
    }


def detect_mode(text, explicit=None):
    """Simple inference for auto mode. An explicit setting (explicit) always wins."""
    if explicit:
        return explicit
    if re.search(r"(さかい|やねん|あかん|ほんま|おおきに)", text):
        return "kansai"
    return None
