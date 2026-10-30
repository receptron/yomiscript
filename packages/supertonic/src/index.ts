export * from "./text.ts";
export * from "./preprocess.ts";
export * from "./engine.ts";
export * from "./katarite.ts";

/** where the list of ambiguous written forms is (data/ambiguous.json: form -> number of readings) */
export const AMBIGUOUS_URL = new URL("../data/ambiguous.json", import.meta.url);
/** the written forms of an ambiguous.json object, as toText() takes them */
export const ambiguousSet = (json: Record<string, number>): ReadonlySet<string> => new Set(Object.keys(json));
/** Supertonic 3 on Hugging Face (weights under OpenRAIL-M, see its model card) */
export const SUPERTONIC_MODELS_URL = "https://huggingface.co/Supertone/supertonic-3/resolve/main/";
