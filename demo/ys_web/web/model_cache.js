// Hugging Face redirects each model file to a signed URL that changes on every request, with `no-store` on the redirect,
// so the browser's HTTP cache never reuses a download. The files are kept in the Cache API instead, keyed by the URL
// pinned to the repository's commit: a new commit gets new keys, and the entries of other commits are removed.
export const MODEL_CACHE = "kokoro-models";
const HF_BASE = /^(https:\/\/huggingface\.co)\/(.+)\/resolve\/([^/]+)\/$/;
const COMMIT = /^[0-9a-f]{40}$/;

/** the Hugging Face API URL giving the commit a `.../resolve/<revision>/` base points at; null for any other base */
export const revisionApiUrl = (base) => {
  const m = HF_BASE.exec(base);
  return m ? `${m[1]}/api/models/${m[2]}/revision/${m[3]}` : null;
};
export const pinnedBase = (base, sha) => base.replace(/\/resolve\/[^/]+\/$/, `/resolve/${sha}/`);

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
const dropOtherCommits = async (cache, pinned) => {
  try {
    const stale = (await cache.keys()).filter((q) => !q.url.startsWith(pinned));
    await Promise.all(stale.map((q) => cache.delete(q)));
  } catch {
    // an entry left behind costs space, not correctness: it is never matched again
  }
};

/** a fetch of `base + path` that reuses earlier downloads when `base` is on Hugging Face and the Cache API is there */
export async function modelFetcher(base) {
  const sha = await resolveCommit(base);
  const cache = sha && (await openCache());
  if (!cache) return (path) => fetch(base + path);
  const pinned = pinnedBase(base, sha);
  await dropOtherCommits(cache, pinned);
  return async (path) => {
    const url = pinned + path;
    const hit = await cache.match(url).catch(() => undefined);
    if (hit) return hit;
    const r = await fetch(url);
    if (r.ok) cache.put(url, r.clone()).catch(() => {});
    return r;
  };
}
