# The react adapter

React front ends on top of the hstack-kit core: a Vite dev server, Vitest + Testing Library component tests, and a Playwright-backed verification driver that proves routes render with a clean console. [`examples/react-counter`](../../examples/react-counter) is its reference project. Every kit change must keep that example's checks and its verification smoke green.

```bash
npx --yes git+https://github.com/ajshortt/hstack-starter.git#v0.2.0 apply --target . --adapter react --owners "@hugeinc/<team>" --write
```

## Package manager and framework

Every command the adapter installs detects pnpm (`pnpm-lock.yaml`) or yarn (`yarn.lock`) and falls back to npm. There is no other branching: the dev server command (`vite`, via `npm run dev` / `pnpm dev` / `yarn dev`) and the build command (`vite build`) assume **Vite**. Create React App, Next.js and other frameworks are not covered yet; a Next.js project's dev server, routing and SSR differ enough (file-based routes, a different `page`-ready signal) that it needs its own driver and checks, not a flag on this one. Add a `next` adapter, modeled on this one, if that need shows up.

## What it adds

| Phase | Files | Purpose |
|---|---|---|
| 0 | `.gitignore` lines (`node_modules/`, `dist/`, `.vite/`) | Ignore build output and the package manager's cache before anything else lands |
| 1 | `driver.mjs` and `DRIVER.md` in the verification skill, React skill seeds (`verify.config.json`, `smoke.json`, `features/`), `.hstack-kit/checks/react.json`, `tsconfig.react.json` | Vite dev server launch, a Playwright `page` step for route smoke, and the `typecheck` / `lint` / `test` / `build` / `verify-smoke` checks |
| 2 | `.cursor/rules/react.mdc`, `eslint.react.js`, `scripts/kit/eslint-rules-react.mjs` | Component, hook and accessibility rules, the ESLint preset, and `lint-react:<rule>` enforcers for the AGENTS.md rule table |

Checks it defines, run by `node scripts/kit/checks.mjs` locally and in CI:

| Check | Command |
|---|---|
| setup | `npm ci` (or the pnpm/yarn equivalent) |
| `typecheck` | `npx tsc --noEmit` |
| `lint` | `npx eslint . --max-warnings 0` (skipped until an `eslint.config.*` exists) |
| `test` | `npx vitest run` |
| `build` | `npx vite build` |
| `verify-smoke` | `npx playwright install chromium && node .cursor/skills/verify-<project>/control.mjs smoke --if-tailored` |

The core adds `agents-rules`, `plans` and `diff-limit` (excluding `**/dist/**` here).

## New React app

### 1. Scaffold

```bash
npm create vite@latest my-app -- --template react-ts
cd my-app && git init && npm install
```

### 2. Toolchain

```bash
npm install -D vitest@5 @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom \
  eslint@10 @eslint/js typescript-eslint globals eslint-plugin-react-hooks eslint-plugin-react-refresh \
  playwright
npx playwright install chromium
```

The example pins React 19, Vite 6, Vitest 3 and `eslint-plugin-react-hooks` 7 (the first version with official ESLint 10 support).

### 3. Apply core plus the adapter

Run the `apply` command at the top of this page, dry run first.

### 4. Wire your config to the adapter's files

The kit does not rewrite your own config files. Make these edits, all of which match the example:

- **`tsconfig.app.json`** (or `tsconfig.json`) extends the strict settings: `{ "extends": "./tsconfig.react.json" }`.
- **`eslint.config.js`** adds `react-hooks` and `react-refresh`, plus the last entry, `react` from `./eslint.react.js` (it sets `react-hooks/exhaustive-deps` to `"error"`, which the rule table needs).
- **`vite.config.ts`** wires `@vitejs/plugin-react` and a `test` block (`environment: "jsdom"`, a setup file importing `@testing-library/jest-dom`). Copy `examples/react-counter/vite.config.ts` and `src/setupTests.ts`.
- **`package.json` scripts** are optional shortcuts. The example uses `"check": "node scripts/kit/checks.mjs run --all"`.

### 5. Tailor the verification skill

The kit seeds `.cursor/skills/verify-my-app/` with the React driver. `start` refuses to run until `"_template": true` is removed from `verify.config.json`.

1. In Cursor, run `/create-verification-skill` and say: "Extend the existing `.cursor/skills/verify-my-app/`. Keep `control.mjs` and `driver.mjs`. Fill `verify.config.json` (drop `_template`, confirm `launch` and `ready`), `smoke.json` and `features/` from this repo. Read `DRIVER.md` first."
2. Compare the result with the example: one feature file per route, and at least one smoke journey per feature using the `page` step with `"expect": { "status": 200, "consoleErrorCount": 0 }`.
3. Run `node .cursor/skills/verify-my-app/control.mjs smoke`. It must pass from a clean checkout, leave no Vite dev server process behind, and write a screenshot plus `.verify/evidence/<run-id>/summary.md` per journey.

Then continue with the core [new-project guide](../../docs/adoption-new-project.md) from "Tailor `AGENTS.md`".

## Existing React app

Follow the core [existing-project guide](../../docs/adoption-existing-project.md) with `--adapter react` on every `apply`. The React-specific work per phase:

- **Phase 1, start from empty.** The Vite dev server must start with only `npm ci` and the files in the repo. Typical fixes: mock or stub a backend the app calls in dev, move a required API key into a dev-only `.env.local` the project already gitignores.
- **Phase 1, tests.** If the project has no tests, add Vitest with jsdom (or happy-dom) and Testing Library as in the example. Before refactoring anything, add characterization tests for current behavior.
- **Phase 1, TypeScript.** Extend `tsconfig.react.json` from your own tsconfig. If the error count is large, override the noisiest flags in your own config for now and remove one override per PR.
- **Phase 2, ESLint.** Wire `eslint.react.js` into your ESLint config. Fix the violations it finds, or scope it down with `files`/`ignores` and record the gap as a plan.

## Verification loop design

The driver (`DRIVER.md` has the full contract) adds one journey step, `page`, on top of the core harness's `request`: it opens a path in headless Chromium, waits for `load` (not `networkidle`, since Vite's HMR WebSocket never goes idle), and returns `status`, `consoleErrors`, `consoleErrorCount`, and a screenshot (or a trace, with `"trace": true`) under the run's evidence directory. `"expect": { "consoleErrorCount": 0 }` in a journey step or the `doctor` probe is how "no console errors" becomes a pass/fail assertion instead of a log someone has to read. A shared headless browser launches lazily on the first `page` step and closes in `cleanup`, so a multi-journey `smoke` run pays Chromium's startup cost once.

## Combining with another adapter

The CLI accepts a comma-separated `--adapter` list (`--adapter workers,react`), and fragment-based pieces combine cleanly: AGENTS.md map/commands/rules rows from both adapters concatenate, and `.hstack-kit/checks/*.json` files all load together. But **the verification skill does not**: this adapter and `workers` both ship `driver.mjs` and `verify.config.json` at the same seeded path (`.cursor/skills/verify-{{projectName}}/`), and the per-file layering rule is "same destination, last adapter wins" (see [adapters/README.md](../README.md#adapterjson)). Applying both to one target silently drops one driver.

For a repo with a Worker API and a React web app, apply each adapter to its own target directory instead, so each gets its own verification skill, driver and checks:

```bash
npx --yes $KIT apply --target apps/api --adapter workers --write
npx --yes $KIT apply --target apps/web --adapter react --write
```

This also matches how most such repos are laid out: the API and the web app have independent dev servers, ports and ready checks, so independent verification runs are the right shape, not a shared one.

## CI credentials

None. Every check runs locally against the Vite dev server with a headless browser the project's own `playwright` devDependency drives. CI needs `npx playwright install chromium` (wired into the `verify-smoke` check), nothing else.
