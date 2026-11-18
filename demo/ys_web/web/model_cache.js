// Hugging Face redirects each model file to a signed URL that changes on every request, with `no-store` on the redirect,
// so the browser's HTTP cache never reuses a download. The files are kept in the Cache API instead, keyed by the URL
// pinned to the repository's commit: a new commit gets new keys, and the entries of the repository's other commits are removed.
// All the demo pages of an origin share this one cache: the Kokoro models and voices, the accent dictionary, the pitch model.
export const MODEL_CACHE = "yomiscript-models";
// caches an earlier version of the public site made
export const OLD_CACHES = ["yomiscript-models-1"];
const HF = "https://huggingface.co/",
  RESOLVE = "/resolve/";
const COMMIT = /^[0-9a-f]{40}$/;

/** the Hugging Face API URL giving the commit a `.../resolve/<revision>/[folder/]` base points at; null for any other base
 * @param {string} base
 * @returns {string | null} */
export const revisionApiUrl = (base) => {
  const at = base.indexOf(RESOLVE);
  if (!base.startsWith(HF) || at <= HF.length || !base.endsWith("/")) return null;
  const rest = base.slice(at + RESOLVE.length),
    revision = rest.slice(0, rest.indexOf("/"));
  return revision ? `${HF}api/models/${base.slice(HF.length, at)}/revision/${revision}` : null;
};
/** @param {string} base @param {string} sha */
export const pinnedBase = (base, sha) => base.replace(/\/resolve\/[^/]+\//, `/resolve/${sha}/`);

/** @param {string} base @returns {Promise<string | null>} */
const resolveCommit = async (base) => {
  const api = revisionApiUrl(base);
  if (!api) return null;
  try {
    const r = await fetch(api, { cache: "no-cache" });
    const sha = r.ok ? (await r.json()).sha : null;
    return COMMIT.test(sha) ? sha : null;
  } catch {
    return null;
  }
};
const openCache = async () => {
  try {
    return await caches.open(MODEL_CACHE);
  } catch {
    return null;
  }
};
const dropOldCaches = async () => {
  try {
    await Promise.all(OLD_CACHES.map((name) => caches.delete(name)));
  } catch {
    // a cache left behind costs space, not correctness
  }
};
/** the entries of the base's repository at any other commit; those of the other repositories stay */
/** @param {Cache} cache @param {string} base @param {string} sha */
const dropOtherCommits = async (cache, base, sha) => {
  try {
    const repository = base.slice(0, base.indexOf(RESOLVE) + RESOLVE.length),
      current = `${repository}${sha}/`;
    const stale = (await cache.keys()).filter((q) => q.url.startsWith(repository) && !q.url.startsWith(current));
    await Promise.all(stale.map((q) => cache.delete(q)));
  } catch {
    // an entry left behind costs space, not correctness: it is never matched again
  }
};

/** @typedef {(path: string) => Promise<Response>} ModelFetch */
/** a fetch of `base + path` that reuses earlier downloads when `base` is on Hugging Face and the Cache API is there
 * @param {string} base
 * @returns {Promise<ModelFetch>} */
export async function modelFetcher(base) {
  await dropOldCaches();
  const sha = await resolveCommit(base);
  const cache = sha && (await openCache());
  if (!cache) return (path) => fetch(base + path);
  const pinned = pinnedBase(base, sha);
  await dropOtherCommits(cache, base, sha);
  return async (path) => {
    const url = pinned + path;
    const hit = await cache.match(url).catch(() => undefined);
    if (hit) return hit;
    const r = await fetch(url);
    if (r.ok) cache.put(url, r.clone()).catch(() => {});
    return r;
  };
}

/** what the dictionary and pitch model loaders take: a file's bytes through a modelFetcher
 * @param {ModelFetch} fetchModel
 * @returns {(path: string) => Promise<Uint8Array<ArrayBuffer>>} */
export const modelBytes = (fetchModel) => async (path) => {
  const r = await fetchModel(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
};
