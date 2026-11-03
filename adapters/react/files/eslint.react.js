// Managed by hstack-kit. Local edits are detected on update; put project rules in eslint.config.js.
// Mirrors the eslint config `npm create vite@latest -- --template react-ts` scaffolds: react-hooks and
// react-refresh at the rule level, nothing heavier. Requires eslint-plugin-react-hooks and
// eslint-plugin-react-refresh as project devDependencies. exhaustive-deps is forced to "error"
// (the plugin's own recommended config ships it as "warn") so it is a real `lint-react:` enforcer;
// only-export-components stays "warn" (Fast Refresh advice, not correctness) and is not one.
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "error",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
];
