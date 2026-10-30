import js from "@eslint/js";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";
import security from "eslint-plugin-security";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import tseslint from "typescript-eslint";

// Same policy as ../mulmoterminal: take each preset's choice of rules, but run every one of them at error. A warning
// does not fail anything, so a rule left at warn reports a violation and ships it. A rule that must not fail the
// build is turned off by name, with the reason, below.
const raise = (entry) => {
  const severity = Array.isArray(entry) ? entry[0] : entry;
  if (severity !== 1 && severity !== "warn") return entry;
  return Array.isArray(entry) ? ["error", ...entry.slice(1)] : "error";
};
const enforced = (config) =>
  config.rules ? { ...config, rules: Object.fromEntries(Object.entries(config.rules).map(([id, entry]) => [id, raise(entry)])) } : config;

export default [
  {
    ignores: [
      "**/node_modules/",
      "packages/*/dist/",
      "paper/",
      "demo/ys_web/web/ort/",
      "demo/ys_web/web/models/",
      "demo/ys_web/web/voices/",
      "models/yomi/mlx/",
    ],
  },
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  enforced(js.configs.recommended),
  enforced(sonarjs.configs.recommended),
  enforced(security.configs.recommended),
  // TypeScript (packages/): the typescript-eslint recommended rules, at error like the rest
  ...tseslint.configs.recommended.map((c) => enforced({ ...c, files: ["**/*.ts", "**/*.tsx", "**/*.vue"] })),
  {
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.node } },
    rules: {
      "max-lines": ["error", { max: 600, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true, IIFEs: true }],
      complexity: ["error", 20],
      "max-depth": ["error", 4],
      "max-params": ["error", 6],
      "max-nested-callbacks": ["error", 4],
      // Paths here come from this repo's own scripts and their command-line arguments, not from untrusted input.
      "security/detect-non-literal-fs-filename": "off",
      // Indexing arrays and lookup tables by computed keys is how phoneme tables work; this rule flags every one.
      "security/detect-object-injection": "off",
    },
  },
  {
    // the demo's browser modules (also imported by the Node scripts)
    files: ["demo/ys_web/web/**/*.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // the LLM experiment runs the user's own claude / codex CLIs, found on PATH like any shell would
    files: ["eval/llm_yomite/llm.mjs"],
    rules: { "sonarjs/no-os-command-from-path": "off" },
  },
  {
    // Playwright scripts: the callbacks of page.evaluate / waitForFunction run in the browser
    files: ["demo/ys_web/pw_*.mjs"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  prettierRecommended,
];
