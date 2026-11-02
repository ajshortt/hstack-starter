// Managed by pstack-kit (workers adapter). Verification driver for a Cloudflare Worker under `wrangler dev --local`.
// control.mjs owns runs, doctor, journeys and evidence; this file owns how a Worker is prepared, launched and read back.
// Project settings live under "workers" in verify.config.json.
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, openSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export function parseJsonc(text) {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === "\\") out += text[++i] ?? "";
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

export function declaredBindings(wc) {
  const names = [
    ...(wc.d1_databases ?? []).map((b) => b.binding),
    ...(wc.kv_namespaces ?? []).map((b) => b.binding),
    ...(wc.r2_buckets ?? []).map((b) => b.binding),
    ...(wc.queues?.producers ?? []).map((b) => b.binding),
    ...(wc.durable_objects?.bindings ?? []).map((b) => b.name),
    ...(wc.services ?? []).map((b) => b.binding),
    ...Object.keys(wc.vars ?? {}),
  ];
  return [...new Set(names)].sort();
}

export function parseBindingTable(log) {
  const rows = [];
  for (const line of log.split("\n")) {
    const match = line.match(/^env\.(\w+)\b.*?\s(local|remote|not connected)\s*$/);
    if (match) rows.push({ name: match[1], mode: match[2] });
  }
  return rows;
}

const settings = (ctx) => ctx.config.workers ?? {};
const wranglerBin = (ctx) => join(ctx.projectRoot, "node_modules", ".bin", "wrangler");
const childEnv = (ctx) => ({ ...ctx.env, WRANGLER_SEND_METRICS: "false" });

function wranglerConfig(ctx) {
  const s = settings(ctx);
  const raw = parseJsonc(readFileSync(join(ctx.projectRoot, s.wranglerConfig ?? "wrangler.jsonc"), "utf8"));
  return s.env ? { ...raw, ...raw.env?.[s.env] } : raw;
}

async function wrangler(ctx, args, { json = false } = {}) {
  const { stdout } = await execFileP(wranglerBin(ctx), args, { cwd: ctx.projectRoot, env: childEnv(ctx), maxBuffer: 32 * 1024 * 1024 });
  return json ? JSON.parse(stdout.slice(stdout.indexOf("["))) : stdout;
}

const localArgs = (ctx) => ["--local", "--persist-to", ctx.run.persistTo, ...(settings(ctx).env ? ["--env", settings(ctx).env] : [])];

function bucketFor(ctx, binding) {
  const bucket = (wranglerConfig(ctx).r2_buckets ?? []).find((b) => b.binding === binding);
  if (!bucket) throw new ctx.UsageError(`No R2 binding named ${binding} in the wrangler config.`);
  return bucket.bucket_name;
}

async function d1(ctx, binding, sql) {
  const out = await wrangler(ctx, ["d1", "execute", binding, ...localArgs(ctx), "--json", "--command", sql], { json: true });
  return out.flatMap((r) => r.results ?? []);
}

async function kvGet(ctx, binding, key) {
  const out = await wrangler(ctx, ["kv", "key", "get", "--binding", binding, key, ...localArgs(ctx)]).catch(() => null);
  if (out === null || out.trim() === "Value not found") return null;
  return out.replace(/\n$/, "");
}

const r2Get = async (ctx, binding, key) => (await wrangler(ctx, ["r2", "object", "get", `${bucketFor(ctx, binding)}/${key}`, ...localArgs(ctx), "--pipe"]).catch(() => null)) ?? null;

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

async function seed(ctx) {
  const seedConfig = settings(ctx).seed ?? {};
  for (const { binding, file } of seedConfig.d1 ?? []) await wrangler(ctx, ["d1", "execute", binding, ...localArgs(ctx), "--file", join(ctx.skillDir, file)]);
  for (const { binding, file } of seedConfig.kv ?? []) {
    const entries = JSON.parse(readFileSync(join(ctx.skillDir, file), "utf8"));
    for (const [key, value] of Object.entries(entries)) {
      await wrangler(ctx, ["kv", "key", "put", "--binding", binding, key, typeof value === "string" ? value : JSON.stringify(value), ...localArgs(ctx)]);
    }
  }
  for (const { binding, dir } of seedConfig.r2 ?? []) {
    const root = join(ctx.skillDir, dir);
    const walk = (d) => readdirSync(d).flatMap((name) => (statSync(join(d, name)).isDirectory() ? walk(join(d, name)) : [join(d, name)]));
    for (const file of existsSync(root) ? walk(root) : []) {
      await wrangler(ctx, ["r2", "object", "put", `${bucketFor(ctx, binding)}/${relative(root, file)}`, "--file", file, ...localArgs(ctx)]);
    }
  }
}

export default {
  name: "workers (wrangler dev --local)",
  logName: "wrangler.log",

  async prepare(ctx) {
    ctx.run.persistTo = join(ctx.run.runDir, "state");
    ctx.run.inspectorPort = await freePort();
    for (const db of wranglerConfig(ctx).d1_databases ?? []) await wrangler(ctx, ["d1", "migrations", "apply", db.binding, ...localArgs(ctx)]);
    await seed(ctx);
  },

  launch(ctx) {
    const { run } = ctx;
    const s = settings(ctx);
    const vars = ctx.render(s.vars ?? {}, { port: run.port, runId: run.runId });
    const args = [
      "dev", "--local", "--ip", "127.0.0.1", "--port", String(run.port), "--inspector-port", String(run.inspectorPort),
      "--persist-to", run.persistTo, "--test-scheduled", "--show-interactive-dev-session=false",
      ...(s.env ? ["--env", s.env] : []),
      ...Object.entries(vars).flatMap(([k, v]) => ["--var", `${k}:${v}`]),
    ];
    const logFd = openSync(run.log, "a");
    return spawn(wranglerBin(ctx), args, { cwd: ctx.projectRoot, env: childEnv(ctx), detached: true, stdio: ["ignore", logFd, logFd] });
  },

  async doctor(ctx) {
    const checks = [];
    const wc = wranglerConfig(ctx);
    const log = ctx.run.log && existsSync(ctx.run.log) ? readFileSync(ctx.run.log, "utf8") : "";
    const table = parseBindingTable(log);
    const declared = declaredBindings(wc);
    const seen = new Set(table.map((r) => r.name));
    const missing = declared.filter((name) => !seen.has(name));
    const notLocal = table.filter((r) => r.mode !== "local");
    checks.push({ name: "bindings", ok: missing.length === 0 && notLocal.length === 0, detail: missing.length || notLocal.length ? { missing, notLocal } : `${declared.length} bindings, all local` });
    for (const db of wc.d1_databases ?? []) {
      const out = await wrangler(ctx, ["d1", "migrations", "list", db.binding, ...localArgs(ctx)]).catch((e) => String(e.stdout ?? e.message));
      checks.push({ name: `migrations:${db.binding}`, ok: /No migrations to apply/i.test(out), detail: out.trim().split("\n").slice(-3).join(" ") });
    }
    const today = new Date().toISOString().slice(0, 10);
    checks.push({ name: "compatibility_date", ok: typeof wc.compatibility_date === "string" && wc.compatibility_date <= today, detail: wc.compatibility_date });
    return checks;
  },

  steps: {
    scheduled: (ctx, { cron = "* * * * *" }) => ctx.request("GET", `/cdn-cgi/handler/scheduled?cron=${encodeURIComponent(cron)}`),
    d1: async (ctx, { binding, sql }) => ({ rows: await d1(ctx, binding, sql) }),
    kv: async (ctx, { binding, key }) => ({ value: ctx.parseMaybeJson(await kvGet(ctx, binding, key)) }),
    r2: async (ctx, { binding, key }) => ({ value: ctx.parseMaybeJson(await r2Get(ctx, binding, key)) }),
  },

  commands: {
    scheduled: { usage: 'scheduled [--cron "0 * * * *"]   fire the scheduled() handler', run: (ctx, _p, flags) => ctx.request("GET", `/cdn-cgi/handler/scheduled?cron=${encodeURIComponent(flags.cron ?? "* * * * *")}`) },
    d1: { usage: 'd1 BINDING "SQL"                 query local D1 (read-back)', run: async (ctx, [binding, sql]) => ({ rows: await d1(ctx, binding, sql) }) },
    "kv-get": { usage: "kv-get BINDING KEY               read local KV", run: async (ctx, [binding, key]) => ({ value: ctx.parseMaybeJson(await kvGet(ctx, binding, key)) }) },
    "r2-get": { usage: "r2-get BINDING KEY               read local R2 object", run: async (ctx, [binding, key]) => ({ value: ctx.parseMaybeJson(await r2Get(ctx, binding, key)) }) },
  },
};
