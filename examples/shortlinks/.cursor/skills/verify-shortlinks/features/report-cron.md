# Hourly report

Once an hour the Worker counts all links and archived links, stores the report in R2 under `reports/<timestamp>.json` and caches it in KV as `report:latest`. Clients read it from the latest-report route.

## Sub-features

- `report-none` returns `404 no_report_yet` before the first cron run.
- `report-build` writes the report to R2 and KV when the cron fires.
- `report-read` returns the cached report.

## How to get to it (user POV)

- Wait for the `0 * * * *` cron, or fire it in local dev.
- `GET /api/reports/latest`.

## Driving it with control.mjs

Preconditions:

- Fresh run. No report has been generated.

- **None yet.** Run `control.mjs request GET /api/reports/latest`. Status `404`, `error` is `no_report_yet`.
- **Fire cron.** Run `control.mjs scheduled --cron "0 * * * *"`. Status `200`. `logs --grep "report generated"` shows the report body.
- **Read.** Request `/api/reports/latest` again. Status `200` with `totalLinks`, `archivedLinks` and `generatedAt`.
- **Cached.** Run `control.mjs kv-get LINK_CACHE report:latest`. Same report.

## Gotchas

- Local dev never fires crons on its own. Use `scheduled`.
- Totals include every link created earlier in the same run. The smoke journey runs last and expects 4 links, 3 archived.
