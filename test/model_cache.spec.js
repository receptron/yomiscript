// The demos' model loader (demo/ys_web/web/model_cache.js): Hugging Face files kept in the Cache API under the URL
// pinned to the repository's commit, and the plain fetch whenever that cannot be done.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL_CACHE, modelFetcher, pinnedBase, revisionApiUrl } from "../demo/ys_web/web/model_cache.js";

const BASE = "https://huggingface.co/receptron/yomiscript-kokoro/resolve/main/";
const REVISION_URL = "https://huggingface.co/api/models/receptron/yomiscript-kokoro/revision/main";
const SHA = "2ea067091fbb0082d71ebcec73cd73269c26318b";
const OLD = "0".repeat(40);
const pinned = (sha, path) => `https://huggingface.co/receptron/yomiscript-kokoro/resolve/${sha}/${path}`;

const fakeCache = () => {
  const entries = new Map();
  return {
    entries,
    match: async (url) => entries.get(url)?.clone(),
    put: async (url, r) => void entries.set(url, new Response(await r.arrayBuffer(), { status: r.status })),
    keys: async () => [...entries.keys()].map((url) => ({ url })),
    delete: async (q) => entries.delete(q.url),
  };
};
let cache, served, sha;
const fakeFetch = vi.fn(async (url) => {
  if (url.startsWith(REVISION_URL)) return sha instanceof Error ? Promise.reject(sha) : Response.json({ sha });
  return served.has(url) ? new Response(served.get(url)) : new Response("", { status: 404 });
});
const settle = () => new Promise((r) => setTimeout(r, 0));
const text = async (r) => r.text();

beforeEach(() => {
  cache = fakeCache();
  sha = SHA;
  served = new Map([
    [pinned(SHA, "models/enc_w16.onnx"), "enc"],
    [BASE + "models/enc_w16.onnx", "enc from main"],
  ]);
  fakeFetch.mockClear();
  vi.stubGlobal("fetch", fakeFetch);
  vi.stubGlobal("caches", { open: async (name) => (name === MODEL_CACHE ? cache : null) });
});
afterEach(() => vi.unstubAllGlobals());

describe("revisionApiUrl / pinnedBase", () => {
  it("map a Hugging Face resolve base to its revision API and to a commit", () => {
    expect(revisionApiUrl(BASE)).toBe(REVISION_URL);
    expect(pinnedBase(BASE, SHA)).toBe(pinned(SHA, ""));
  });
  it("give no revision API for any other base", () => {
    ["./", "https://example.com/m/", "https://huggingface.co/a/b/resolve/main", ""].forEach((b) => expect(revisionApiUrl(b)).toBeNull());
  });
});

describe("modelFetcher", () => {
  it("downloads a file once and serves it from the cache after that", async () => {
    const get = await modelFetcher(BASE);
    expect(await text(await get("models/enc_w16.onnx"))).toBe("enc");
    await settle();
    served.clear();
    const again = await modelFetcher(BASE);
    expect(await text(await again("models/enc_w16.onnx"))).toBe("enc");
    expect(fakeFetch.mock.calls.filter(([u]) => u === pinned(SHA, "models/enc_w16.onnx"))).toHaveLength(1);
  });
  it("does not keep a failed download", async () => {
    const get = await modelFetcher(BASE);
    expect((await get("models/missing.onnx")).status).toBe(404);
    await settle();
    expect(cache.entries.size).toBe(0);
  });
  it("revalidates the revision on every load, so a new model commit is seen", async () => {
    await modelFetcher(BASE);
    expect(fakeFetch).toHaveBeenCalledWith(REVISION_URL, { cache: "no-cache" });
  });
  it("removes the files of other commits and keeps those of the current one", async () => {
    cache.entries.set(pinned(OLD, "models/enc_w16.onnx"), new Response("old"));
    cache.entries.set(pinned(SHA, "voices/jf_alpha.bin"), new Response("voice"));
    await modelFetcher(BASE);
    expect([...cache.entries.keys()]).toStrictEqual([pinned(SHA, "voices/jf_alpha.bin")]);
  });
  it.each([
    ["the revision API fails", () => (sha = new Error("offline"))],
    ["the revision is not a commit", () => (sha = "main")],
    ["there is no Cache API", () => vi.stubGlobal("caches", undefined)],
    ["the cache cannot be opened", () => vi.stubGlobal("caches", { open: () => Promise.reject(new Error("denied")) })],
  ])("falls back to the plain fetch of the base when %s", async (_, arrange) => {
    arrange();
    const get = await modelFetcher(BASE);
    expect(await text(await get("models/enc_w16.onnx"))).toBe("enc from main");
    expect(cache.entries.size).toBe(0);
  });
  it("fetches a base that is not on Hugging Face as it is, without asking for a revision", async () => {
    served.set("./models/enc_w16.onnx", "local");
    const get = await modelFetcher("./");
    expect(await text(await get("models/enc_w16.onnx"))).toBe("local");
    expect(fakeFetch.mock.calls.map(([u]) => u)).toStrictEqual(["./models/enc_w16.onnx"]);
  });
  it("still serves a download the cache could not store", async () => {
    cache.put = () => Promise.reject(new Error("quota"));
    const get = await modelFetcher(BASE);
    expect(await text(await get("models/enc_w16.onnx"))).toBe("enc");
  });
});
