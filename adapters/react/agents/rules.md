| Effects declare every dependency; no component logic in `main.tsx` beyond mounting | `lint-react:react-hooks/exhaustive-deps` |
| Hooks are only called from components or other hooks, never conditionally | `lint-react:react-hooks/rules-of-hooks` |
| TypeScript strict, no unchecked index access | `tsconfig.react.json`, `ci:typecheck` |
| Behavior is tested through what the user sees (Testing Library), not component internals | `ci:test` |
| The production bundle builds clean | `ci:build` |
| New routes get a feature-map entry and a smoke journey with a screenshot | `docs-only` |
| The browser console stays clean: every smoke journey asserts `consoleErrorCount: 0` | `ci:verify-smoke` |
