The react adapter's checks (`.hstack-kit/checks/react.json`) run these:

```bash
node scripts/kit/checks.mjs install                              # setup; nearest pnpm, yarn, bun or npm lockfile up to the git root
npx tsc --noEmit                                                 # typecheck
npx eslint . --max-warnings 0                                    # lint
npx vitest run                                                   # component tests (jsdom/happy-dom + Testing Library)
npx vite build                                                   # production build
```
