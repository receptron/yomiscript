// What the Node Katarites share: a loader that reads model files from a directory and, when a file is missing,
// downloads it once from a base URL (Hugging Face) into that directory.
import fs from "node:fs/promises";
import path from "node:path";
import type { LoadBytes } from "./katarite.ts";

export interface CachedLoaderOptions {
  /** the directory the files are read from and downloaded into */
  dir: string;
  /** where missing files are downloaded from (ends with "/"); none: a missing file is an error */
  baseUrl?: string;
  /** called before each download, e.g. to tell the user (the first run downloads hundreds of MB) */
  onDownload?: (url: string) => void;
  fetch?: typeof globalThis.fetch;
}

const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";

export function cachedLoader({ dir, baseUrl, onDownload, fetch = globalThis.fetch }: CachedLoaderOptions): LoadBytes {
  return async (file) => {
    const local = path.join(dir, file);
    try {
      return new Uint8Array(await fs.readFile(local));
    } catch (e) {
      if (!missing(e) || !baseUrl) throw e;
    }
    const url = new URL(file, baseUrl).href;
    onDownload?.(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: ${url} (${res.status} ${res.statusText})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    await fs.mkdir(path.dirname(local), { recursive: true });
    const tmp = `${local}.${process.pid}.part`; // written whole, then renamed: an interrupted download leaves no file
    await fs.writeFile(tmp, bytes);
    await fs.rename(tmp, local);
    return bytes;
  };
}
