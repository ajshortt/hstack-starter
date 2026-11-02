import globals from "globals";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import workers from "./eslint.workers.js";

export default tseslint.config(
  { ignores: ["worker-configuration.d.ts", ".wrangler/**", ".verify/**", "node_modules/**", ".pstack-kit/**"] },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: { parserOptions: { projectService: { allowDefaultProject: ["*.config.ts"] }, tsconfigRootDir: import.meta.dirname } },
    rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: { globals: globals.node },
  },
  workers,
);
