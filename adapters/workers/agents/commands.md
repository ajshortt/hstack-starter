The workers adapter's checks (`.pstack-kit/checks/workers.json`) run these:

```bash
npm ci                                                           # setup
npx wrangler types --check && npx tsc --noEmit                  # typecheck
npx eslint . --max-warnings 0                                   # lint
npx vitest run                                                   # tests in workerd
```
