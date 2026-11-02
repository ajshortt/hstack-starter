import { Report } from "./schema";

export const LATEST_REPORT_KEY = "report:latest";

export async function buildReport(env: Env, now: Date): Promise<Report> {
  const counts = await env.DB.prepare(
    "SELECT COUNT(*) AS total, COUNT(archived_at) AS archived FROM links",
  ).first<{ total: number; archived: number }>();
  const report: Report = {
    generatedAt: now.toISOString(),
    totalLinks: counts?.total ?? 0,
    archivedLinks: counts?.archived ?? 0,
  };
  const body = JSON.stringify(report);
  await env.ARCHIVE.put(`reports/${report.generatedAt}.json`, body, {
    httpMetadata: { contentType: "application/json" },
  });
  await env.LINK_CACHE.put(LATEST_REPORT_KEY, body);
  console.log(`report generated: ${body}`);
  return report;
}

export async function latestReport(env: Env): Promise<Report | null> {
  const raw = await env.LINK_CACHE.get(LATEST_REPORT_KEY, "json");
  return raw === null ? null : Report.parse(raw);
}
