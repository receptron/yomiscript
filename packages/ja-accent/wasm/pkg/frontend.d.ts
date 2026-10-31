/* tslint:disable */
/* eslint-disable */

export class Frontend {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * `[njd, labels]` as JSON: the NJD features of each word (CSV, as pyopenjtalk's run_frontend prints them) and
     * the full-context label of each phoneme.
     */
    analyze(text: string): string;
    /**
     * `bytes`: the dictionary files one after another (in the order of DICT_FILES); `lengths`: the length of each;
     * `user`: a user dictionary, rows in the system dictionary's CSV format (one per line, `#` comments), whose
     * entries take part in the analysis next to the system dictionary's.
     */
    constructor(bytes: Uint8Array | number[], lengths: Uint32Array | number[], user?: string | null);
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_frontend_free: (a: number, b: number) => void;
    readonly frontend_analyze: (a: number, b: number, c: number) => [number, number, number, number];
    readonly frontend_new: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
