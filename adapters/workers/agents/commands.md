The workers adapter's checks (`.hstack-kit/checks/workers.json`) run these:

```bash
node scripts/kit/checks.mjs install                              # setup; lockfile may live at the workspace root
npx wrangler types --check && npx tsc --noEmit                  # typecheck
npx eslint . --max-warnings 0                                   # lint
npx vitest run                                                   # tests in workerd
```
