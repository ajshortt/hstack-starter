The react adapter's checks (`.hstack-kit/checks/react.json`) run these:

```bash
npm ci                                                           # setup (pnpm/yarn if their lockfile is present)
npx tsc --noEmit                                                 # typecheck
npx eslint . --max-warnings 0                                    # lint
npx vitest run                                                   # component tests (jsdom/happy-dom + Testing Library)
npx vite build                                                   # production build
```
