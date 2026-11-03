// Managed by hstack-kit (react adapter). Verification driver for a React (Vite) dev server.
// control.mjs owns runs, doctor, journeys and evidence; launch and the ready check use the core
// harness directly (see verify.config.json's "launch" and "ready"). This driver adds the one
// browser-backed step smoke journeys need: rendering a route and reading back its real state.
import { mkdirSync } from "node:fs";
import { join, relative } from "node:path";

export const slugFor = (path) =>
  path
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "root";

let browserPromise;
async function getBrowser() {
  // "playwright" is the project's own devDependency, imported lazily so the kit itself never needs it.
  if (!browserPromise) browserPromise = import("playwright").then(({ chromium }) => chromium.launch());
  return browserPromise;
}

async function pageStep(ctx, { path = "/", trace = false } = {}) {
  const browser = await getBrowser();
  const context = await browser.newContext();
  if (trace) await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  try {
    const response = await page.goto(new URL(path, ctx.run.baseUrl).toString(), { waitUntil: "load", timeout: 20000 });
    const dir = join(ctx.run.evidence, "screenshots");
    mkdirSync(dir, { recursive: true });
    const slug = slugFor(path);
    const screenshotPath = join(dir, `${slug}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const result = { status: response?.status() ?? null, consoleErrors, consoleErrorCount: consoleErrors.length, screenshot: relative(ctx.projectRoot, screenshotPath) };
    if (trace) {
      const tracePath = join(dir, `${slug}.zip`);
      await context.tracing.stop({ path: tracePath });
      result.trace = relative(ctx.projectRoot, tracePath);
    }
    return result;
  } finally {
    await context.close();
  }
}

export default {
  name: "react (Playwright against the Vite dev server)",
  steps: { page: pageStep },
  commands: {
    page: { usage: "page PATH [--trace]            render a route with Playwright: screenshot, console errors", run: (ctx, [path], flags) => pageStep(ctx, { path: path ?? "/", trace: Boolean(flags.trace) }) },
  },
  async cleanup() {
    if (!browserPromise) return;
    const browser = await browserPromise;
    browserPromise = undefined;
    await browser.close();
  },
};
