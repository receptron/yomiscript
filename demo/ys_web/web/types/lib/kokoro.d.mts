// lib/kokoro.mjs is @yomiscript/kokoro's jsDelivr bundle (worker_lib.sh), not in the repository; tsconfig.json's rootDirs
// lets the worker's import of it be type-checked as the package.
export * from "@yomiscript/kokoro";
