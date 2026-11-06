// 青空朗読文庫 (aozora.html): a story read aloud sentence by sentence. The YomiScript was written ahead of time (../aozora.mjs),
// and it holds nothing but the LLM's readings. When a sentence is first asked for, the browser adds its accent and pitch as the
// tools do, makes its audio and keeps it; the sentence after the one playing is made ahead, so that the wait for it is hidden.
import { DICT_URL, loadFrontend, loadPitchModel, PITCH_URL, pitchOrAccentYomite } from "@yomiscript/ja-accent";
import { modelBytes, modelFetcher } from "./model_cache.js";

const BOOK = new URLSearchParams(location.search).get("book") ?? "chumon",
  GAP_MS = 250,
  PARAGRAPH_GAP_MS = 550;

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});
const status = (text, error = false) => {
  $("status").textContent = text;
  $("status").classList.toggle("err", error);
};

/** The Cache Storage cache of the audio, or null where the browser refuses one (a private window, an insecure origin). Its name has
 * the story's version and that of the accent code, whose URL holds it, so that audio made with other accents is not played; the
 * caches of other versions are removed. */
async function openAudio(storyVersion) {
  const prefix = `aozora-audio-${BOOK}-`,
    accentVersion = import.meta.resolve("@yomiscript/ja-accent").match(/@(\d[^/]*)\//)?.[1],
    name = `${prefix}${storyVersion}-${accentVersion}`;
  try {
    const stale = (await caches.keys()).filter((k) => k.startsWith(prefix) && k !== name);
    await Promise.all(stale.map((k) => caches.delete(k)));
    return await caches.open(name);
  } catch {
    return null;
  }
}

/** the step that adds a sentence's accent and pitch, as the tools have it */
async function startAccent() {
  const a = await loadFrontend(modelBytes(await modelFetcher(DICT_URL)));
  return pitchOrAccentYomite(
    a,
    async () => loadPitchModel(modelBytes(await modelFetcher(PITCH_URL))),
    (e) => console.warn("no pitch model, the dictionary accent is used:", e),
  );
}

/** The Katarite in its worker: a YomiScript in, its audio out. */
class Speaker {
  constructor() {
    Object.assign(this, { worker: new Worker("aozora_worker.js", { type: "module" }), waiting: new Map(), next: 0 });
    this.worker.onmessage = ({ data }) => {
      const { resolve, reject } = this.waiting.get(data.id);
      this.waiting.delete(data.id);
      if (data.error) reject(new Error(data.error));
      else resolve(data);
    };
    this.worker.onerror = (e) => {
      for (const { reject } of this.waiting.values()) reject(new Error(e.message));
      this.waiting.clear();
    };
  }

  /** the audio of a YomiScript; with none, resolves when the Katarite is ready */
  speak(ys) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.worker.postMessage({ id, ys });
    });
  }
}

/** The audio of the sentences: at most one made at a time, kept in memory and in the browser. */
class Voice {
  constructor(speaker, accent, sentences, cache) {
    Object.assign(this, { speaker, accent, sentences, cache, made: new Map(), running: Promise.resolve() });
  }

  key(i) {
    return `/aozora-audio/${i}.wav`;
  }

  /** the sentence's audio as a Blob; asking again waits for the same work */
  get(i) {
    if (!this.made.has(i)) {
      const work = (this.running = this.running.catch(() => {}).then(() => this.produce(i)));
      this.made.set(i, work);
      work.catch(() => this.made.delete(i)); // a failure can be asked again
    }
    return this.made.get(i);
  }

  async produce(i) {
    const kept = await this.cache?.match(this.key(i));
    if (kept) return { blob: await kept.blob(), kept: true };
    const t0 = performance.now(),
      { blob, seconds } = await this.speaker.speak(this.accent(this.sentences[i].ys)),
      ms = performance.now() - t0;
    await this.cache?.put(this.key(i), new Response(blob, { headers: { "Content-Type": "audio/wav" } })).catch(() => {});
    return { blob, ms, seconds, kept: false };
  }
}

/** the sentence's text with the book's ruby */
function sentenceNode(s, i) {
  const span = el("span", "s");
  span.dataset.i = i;
  let at = 0;
  for (const [start, n, reading] of s.ruby) {
    span.append(s.text.slice(at, start));
    const ruby = el("ruby", null, s.text.slice(start, start + n));
    ruby.append(el("rp", null, "（"), el("rt", null, reading), el("rp", null, "）"));
    span.append(ruby);
    at = start + n;
  }
  span.append(s.text.slice(at));
  return span;
}

/** the story on the page; returns the sentences in order, each with its node and whether it ends a paragraph */
function render(story) {
  const list = [];
  for (const p of story.paragraphs) {
    const node = el("p", p.first ? "first" : null);
    if (p.indent) node.style.marginInlineStart = `${p.indent}em`;
    p.sentences.forEach((s, k) => {
      const span = sentenceNode(s, list.length);
      node.append(span);
      list.push({ ...s, node: span, last: k === p.sentences.length - 1 });
    });
    $("story").append(node);
  }
  return list;
}

function showBook(story) {
  document.title = `${story.title}｜青空朗読文庫`;
  $("title").textContent = story.title;
  $("author").textContent = story.author;
  const source = el("a", null, "青空文庫");
  source.href = story.source;
  $("credit").append("本文：", source, `（${story.credit.join(" ／ ")}）`);
}

/** The reader: which sentence is current, and whether it is playing. */
class Reader {
  constructor(sentences, voice) {
    Object.assign(this, { sentences, voice, at: 0, playing: false, turn: 0, player: new Audio(), url: null, gap: 0 });
    this.player.onended = () => this.finished();
    this.player.onerror = () => this.fail(this.player.error?.message ?? "audio");
  }

  /** highlights the sentence, in view */
  show(i) {
    this.sentences[this.at].node.classList.remove("now");
    this.at = i;
    const { node, ys } = this.sentences[i];
    node.classList.add("now");
    node.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    $("ys").textContent = ys;
    $("progress").value = (i + 1) / this.sentences.length;
    $("prev").disabled = i === 0;
    $("next").disabled = i === this.sentences.length - 1;
  }

  /** plays sentence i, making it first if it is not ready; a later call makes this one give up */
  async play(i) {
    const turn = ++this.turn;
    clearTimeout(this.gap);
    this.player.pause();
    this.playing = true;
    $("play").textContent = "一時停止";
    this.show(i);
    status(`${i + 1} / ${this.sentences.length} 文目を準備しています…`);
    let got;
    try {
      got = await this.voice.get(i);
    } catch (e) {
      if (turn === this.turn) this.fail(e);
      return;
    }
    if (turn !== this.turn) return;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(got.blob);
    this.player.src = this.url;
    try {
      await this.player.play();
    } catch (e) {
      if (turn === this.turn) this.fail(e);
      return;
    }
    const how = got.kept ? "保存済みの音声" : `生成 ${(got.ms / 1000).toFixed(1)} 秒 ／ 音声 ${got.seconds.toFixed(1)} 秒`;
    status(`${i + 1} / ${this.sentences.length} 文目（${how}）`);
    if (i + 1 < this.sentences.length) this.voice.get(i + 1).catch(() => {}); // a failure shows when its turn comes
  }

  finished() {
    const i = this.at;
    if (i + 1 >= this.sentences.length) {
      this.stop();
      status("おしまい");
      return;
    }
    const turn = this.turn;
    this.gap = setTimeout(() => turn === this.turn && this.play(i + 1), this.sentences[i].last ? PARAGRAPH_GAP_MS : GAP_MS);
  }

  stop() {
    this.turn++;
    clearTimeout(this.gap);
    this.player.pause();
    this.playing = false;
    $("play").textContent = "再生";
  }

  fail(e) {
    this.stop();
    status(`音声を作れませんでした：${e}`, true);
  }

  /** the play button: pause keeps the place in the sentence; a sentence not begun or ended starts from its beginning */
  toggle() {
    if (this.playing) {
      this.stop();
      status("一時停止しました");
    } else if (this.player.src && this.player.currentTime > 0 && !this.player.ended) {
      this.playing = true;
      $("play").textContent = "一時停止";
      this.player.play().catch((e) => this.fail(e));
    } else {
      this.play(this.at);
    }
  }
}

async function main() {
  const r = await fetch(`aozora/${BOOK}.json`);
  if (!r.ok) throw new Error(`${BOOK}: ${r.status}`);
  const story = await r.json();
  showBook(story);
  const sentences = render(story);
  status("音声モデルと辞書を読み込んでいます…（初回は約 200 MB）");
  const speaker = new Speaker(),
    [accent] = await Promise.all([startAccent(), speaker.speak()]),
    audio = await openAudio(story.version),
    voice = new Voice(speaker, accent, sentences, audio),
    reader = new Reader(sentences, voice);
  status("最初の文を準備しています…");
  await voice.get(0); // so that the first press of play is heard at once
  $("story").onclick = (e) => {
    const node = e.target.closest(".s");
    if (node) reader.play(Number(node.dataset.i));
  };
  $("play").onclick = () => reader.toggle();
  $("prev").onclick = () => reader.play(reader.at - 1);
  $("next").onclick = () => reader.play(reader.at + 1);
  reader.show(0);
  scrollTo(0, 0);
  $("play").disabled = false;
  status("準備ができました");
}
main().catch((e) => status(`読み込めませんでした：${e}`, true));
