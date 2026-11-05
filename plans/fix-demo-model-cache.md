# Keep the Kokoro models between visits on the public demo pages (#47)

## Problem
The public pages fetch the models from `https://huggingface.co/receptron/yomiscript-kokoro/resolve/main/<file>`.
Hugging Face answers with a `302` marked `cache-control: no-store` to a signed CDN URL whose query changes on every
request, and the final `200` has no `cache-control`. The browser's HTTP cache never gets a reusable entry, so every
visit downloads the models in full.

## Fix
`demo/ys_web/web/model_cache.js` exports `modelFetcher(base)`, which returns the fetch the pages give the Engine:
- for a Hugging Face `.../resolve/<revision>/` base, it asks the Hugging Face API for the commit that revision points
  at, fetches from the base pinned to that commit, and keeps each successful response in the Cache API under that
  pinned URL. A later visit with the same commit is served from the cache; a new model commit gets new keys, and the
  entries of other commits are removed when the fetcher is made;
- for any other base (`?local`), when the commit cannot be resolved, or when the Cache API cannot be opened, it is the
  plain `fetch(base + path)` of before;
- a response the cache cannot store (quota) is still returned; a failed response is not stored.

`misread.html` (the site's index) and `announce.html` use it; `misread_site.sh` copies it to the site. `index.html`
and `accent_edit.html` load from the same origin through `serve.py`, where the HTTP cache works, and are unchanged.

## Verified
- `test/model_cache.spec.js` with `fetch` and `caches` faked: one download then cache hits, failures not stored, other
  commits removed, each fallback, a non-Hugging Face base, a cache that cannot store. Each test goes red on its mutant
  (no cache hit, storing failures, no removal, no commit check, an unpinned key, an unhandled `put` rejection, no
  check for a non-Hugging Face base).
- The built site in Chromium against the real Hugging Face: the second load of the page fetches no model file from
  the network.

## Out of scope
- Offline use: without the revision API the pages fall back to the network, even with the files in the cache.
