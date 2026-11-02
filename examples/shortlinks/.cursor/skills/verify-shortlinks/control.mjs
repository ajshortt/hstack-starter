#!/usr/bin/env node
// Managed by pstack-kit. Verification harness for a Cloudflare Worker running under `wrangler dev --local`.
// Project-specific behavior lives in verify.config.json, seed/, smoke.json and features/ next to this file.
import { spawn, execFile } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync, readdirSync, statSync, copyFileSync, openSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(SKILL_DIR, "verify.config.json");
const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const PROJECT_ROOT = resolve(SKILL_DIR, config.projectRoot ?? "../../..");
const VERIFY_DIR = join(PROJECT_ROOT, ".verify");
const RUNS_DIR = join(VERIFY_DIR, "runs");
const EVIDENCE_ROOT = join(VERIFY_DIR, "evidence");
const CURRENT = join(VERIFY_DIR, "current");
const WRANGLER = join(PROJECT_ROOT, "node_modules", ".bin", "wrangler");
const CHILD_ENV = { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1", FORCE_COLOR: "0", CI: "1" };

class UsageError extends Error {}

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

function wranglerConfig() {
  const file = join(PROJECT_ROOT, config.wranglerConfig ?? "wrangler.jsonc");
  const raw = parseJsonc(readFileSync(file, "utf8"));
  return config.env ? { ...raw, ...raw.env?.[config.env] } : raw;
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

function bucketFor(binding) {
  const bucket = (wranglerConfig().r2_buckets ?? []).find((b) => b.binding === binding);
  if (!bucket) throw new UsageError(`No R2 binding named ${binding} in the wrangler config.`);
  return bucket.bucket_name;
}

function render(value, vars) {
  if (typeof value === "string") return value.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? String(vars[key]) : `{{${key}}}`));
  if (Array.isArray(value)) return value.map((v) => render(v, vars));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, render(v, vars)]));
  return value;
}

export function subsetMismatch(expected, actual, path = "$") {
  if (expected === "$present") return actual === null || actual === undefined ? `${path}: expected a value, got ${JSON.stringify(actual)}` : null;
  if (typeof expected === "string" && expected.startsWith("$match:")) {
    return new RegExp(expected.slice(7)).test(String(actual)) ? null : `${path}: ${JSON.stringify(actual)} does not match /${expected.slice(7)}/`;
  }
  if (expected === null || typeof expected !== "object") {
    return Object.is(expected, actual) ? null : `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  }
  if (actual === null || typeof actual !== "object") return `${path}: expected an object or array, got ${JSON.stringify(actual)}`;
  for (const [key, value] of Object.entries(expected)) {
    const miss = subsetMismatch(value, actual[key], `${path}.${key}`);
    if (miss) return miss;
  }
  return null;
}

const pick = (obj, path) => path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);

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

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const cmdlineOf = (pid) => {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" ");
  } catch {
    return null;
  }
};

function runIdOrCurrent(flags) {
  const id = flags.run ?? (existsSync(CURRENT) ? readFileSync(CURRENT, "utf8").trim() : null);
  if (!id) throw new UsageError("No active run. Start one with `control.mjs start`.");
  return id;
}

function loadRun(flags) {
  const id = runIdOrCurrent(flags);
  const file = join(RUNS_DIR, id, "run.json");
  if (!existsSync(file)) throw new UsageError(`Run ${id} has no run.json. It was stopped or never started.`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function evidenceDir(runId) {
  const dir = join(EVIDENCE_ROOT, runId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function record(run, entry) {
  appendFileSync(join(evidenceDir(run.runId), "transcript.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

async function wrangler(args, { json = false } = {}) {
  const { stdout } = await execFileP(WRANGLER, args, { cwd: PROJECT_ROOT, env: CHILD_ENV, maxBuffer: 32 * 1024 * 1024 });
  return json ? JSON.parse(stdout.slice(stdout.indexOf("["))) : stdout;
}

const localArgs = (run) => ["--local", "--persist-to", run.persistTo, ...(config.env ? ["--env", config.env] : [])];

async function d1(run, binding, sql) {
  const out = await wrangler(["d1", "execute", binding, ...localArgs(run), "--json", "--command", sql], { json: true });
  return out.flatMap((r) => r.results ?? []);
}

async function kvGet(run, binding, key) {
  const out = await wrangler(["kv", "key", "get", "--binding", binding, key, ...localArgs(run)]).catch(() => null);
  if (out === null || out.trim() === "Value not found") return null;
  return out.replace(/\n$/, "");
}

async function r2Get(run, binding, key) {
  return (await wrangler(["r2", "object", "get", `${bucketFor(binding)}/${key}`, ...localArgs(run), "--pipe"]).catch(() => null)) ?? null;
}

async function seed(run) {
  const seedConfig = config.seed ?? {};
  for (const { binding, file } of seedConfig.d1 ?? []) {
    await wrangler(["d1", "execute", binding, ...localArgs(run), "--file", join(SKILL_DIR, file)]);
  }
  for (const { binding, file } of seedConfig.kv ?? []) {
    const entries = JSON.parse(readFileSync(join(SKILL_DIR, file), "utf8"));
    for (const [key, value] of Object.entries(entries)) {
      await wrangler(["kv", "key", "put", "--binding", binding, key, typeof value === "string" ? value : JSON.stringify(value), ...localArgs(run)]);
    }
  }
  for (const { binding, dir } of seedConfig.r2 ?? []) {
    const root = join(SKILL_DIR, dir);
    const walk = (d) => readdirSync(d).flatMap((name) => (statSync(join(d, name)).isDirectory() ? walk(join(d, name)) : [join(d, name)]));
    for (const file of existsSync(root) ? walk(root) : []) {
      await wrangler(["r2", "object", "put", `${bucketFor(binding)}/${relative(root, file)}`, "--file", file, ...localArgs(run)]);
    }
  }
}

async function fetchJson(run, method, path, { json, headers = {} } = {}) {
  const started = Date.now();
  const response = await fetch(new URL(path, run.baseUrl), {
    method,
    redirect: "manual",
    headers: { ...(json === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: json === undefined ? undefined : JSON.stringify(json),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: response.status, headers: Object.fromEntries(response.headers), body, ms: Date.now() - started };
}

async function waitReady(run, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const { path, expectStatus = 200, expectJson } = config.ready;
  let last = "no response yet";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited with ${child.exitCode}. See ${run.log}.`);
    try {
      const res = await fetchJson(run, "GET", path);
      const miss = res.status === expectStatus ? (expectJson ? subsetMismatch(expectJson, res.body) : null) : `status ${res.status}`;
      if (!miss) return res;
      last = miss;
    } catch (error) {
      last = error.message;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Not ready after ${timeoutMs}ms on ${path}: ${last}. See ${run.log}.`);
}

async function start(flags) {
  if (config._template) throw new UsageError("verify.config.json is still the kit template. Tailor it (see SKILL.md, 'Tailor this skill') before launching.");
  const runId = flags["run-id"] ?? `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "")}-${process.pid}`;
  const runDir = join(RUNS_DIR, runId);
  if (existsSync(join(runDir, "run.json"))) throw new UsageError(`Run ${runId} already exists. Stop it or pick another --run-id.`);
  mkdirSync(runDir, { recursive: true });
  const port = Number(flags.port ?? (await freePort()));
  const inspectorPort = await freePort();
  const run = {
    runId,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    persistTo: join(runDir, "state"),
    log: join(runDir, "wrangler.log"),
    evidence: evidenceDir(runId),
    startedAt: new Date().toISOString(),
  };
  const vars = render(config.vars ?? {}, { port, runId });

  for (const db of wranglerConfig().d1_databases ?? []) {
    await wrangler(["d1", "migrations", "apply", db.binding, ...localArgs(run)]);
  }
  await seed(run);

  const args = ["dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", String(inspectorPort), "--persist-to", run.persistTo, "--test-scheduled", "--show-interactive-dev-session=false", ...(config.env ? ["--env", config.env] : []), ...Object.entries(vars).flatMap(([k, v]) => ["--var", `${k}:${v}`])];
  const logFd = openSync(run.log, "a");
  const child = spawn(WRANGLER, args, { cwd: PROJECT_ROOT, env: CHILD_ENV, detached: true, stdio: ["ignore", logFd, logFd] });
  run.pid = child.pid;
  writeFileSync(join(runDir, "run.json"), JSON.stringify(run, null, 2));
  writeFileSync(CURRENT, runId);
  try {
    const ready = await waitReady(run, child, Number(flags.timeout ?? 90000));
    record(run, { command: "start", ok: true, ready });
  } catch (error) {
    await stop({ run: runId });
    throw error;
  }
  child.unref();
  return { ok: true, ...run };
}

async function doctor(flags) {
  const run = loadRun(flags);
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

  const cmdline = cmdlineOf(run.pid) ?? "";
  check("process", isAlive(run.pid) && cmdline.includes(`--port ${run.port}`), isAlive(run.pid) ? `pid ${run.pid}: ${cmdline.slice(0, 160)}` : `pid ${run.pid} is not running`);

  const ready = await fetchJson(run, "GET", config.ready.path).catch((error) => ({ status: 0, body: error.message }));
  const readyMiss = ready.status === (config.ready.expectStatus ?? 200) ? (config.ready.expectJson ? subsetMismatch(config.ready.expectJson, ready.body) : null) : `status ${ready.status}`;
  check("ready", !readyMiss, readyMiss ?? `${config.ready.path} returned the expected body`);

  const log = existsSync(run.log) ? readFileSync(run.log, "utf8") : "";
  const table = parseBindingTable(log);
  const declared = declaredBindings(wranglerConfig());
  const seen = new Set(table.map((r) => r.name));
  const missing = declared.filter((name) => !seen.has(name));
  const remote = table.filter((r) => r.mode !== "local");
  check("bindings", missing.length === 0 && remote.length === 0, missing.length || remote.length ? { missing, notLocal: remote } : `${declared.length} bindings, all local`);

  const wc = wranglerConfig();
  for (const db of wc.d1_databases ?? []) {
    const out = await wrangler(["d1", "migrations", "list", db.binding, ...localArgs(run)]).catch((e) => String(e.stdout ?? e.message));
    check(`migrations:${db.binding}`, /No migrations to apply/i.test(out), out.trim().split("\n").slice(-3).join(" "));
  }

  for (const probe of config.doctor?.d1 ?? []) {
    const rows = await d1(run, probe.binding, probe.sql).catch((e) => e.message);
    const ok = Array.isArray(rows) && (probe.expect ? !subsetMismatch(probe.expect, rows) : rows.length > 0);
    check(`seed:${probe.name ?? probe.sql}`, ok, rows);
  }
  for (const probe of config.doctor?.kv ?? []) {
    const value = await kvGet(run, probe.binding, probe.key);
    check(`seed:kv:${probe.key}`, value !== null, value);
  }

  const today = new Date().toISOString().slice(0, 10);
  check("compatibility_date", typeof wc.compatibility_date === "string" && wc.compatibility_date <= today, wc.compatibility_date);

  const result = { ok: checks.every((c) => c.ok), runId: run.runId, baseUrl: run.baseUrl, checks };
  writeFileSync(join(evidenceDir(run.runId), "doctor.json"), JSON.stringify(result, null, 2));
  return result;
}

async function stop(flags) {
  const ids = flags.all ? (existsSync(RUNS_DIR) ? readdirSync(RUNS_DIR) : []) : [runIdOrCurrent(flags)];
  const stopped = [];
  for (const id of ids) {
    const runDir = join(RUNS_DIR, id);
    const file = join(runDir, "run.json");
    if (!existsSync(file)) continue;
    const run = JSON.parse(readFileSync(file, "utf8"));
    if (run.pid && isAlive(run.pid) && (cmdlineOf(run.pid) ?? "").includes(`--port ${run.port}`)) {
      try {
        process.kill(-run.pid, "SIGTERM");
      } catch {}
      for (let i = 0; i < 50 && isAlive(run.pid); i++) await new Promise((r) => setTimeout(r, 100));
      if (isAlive(run.pid)) process.kill(-run.pid, "SIGKILL");
    }
    if (existsSync(run.log)) copyFileSync(run.log, join(evidenceDir(id), "wrangler.log"));
    rmSync(runDir, { recursive: true, force: true });
    if (existsSync(CURRENT) && readFileSync(CURRENT, "utf8").trim() === id) rmSync(CURRENT);
    stopped.push({ runId: id, evidence: relative(PROJECT_ROOT, evidenceDir(id)) });
  }
  return { ok: true, stopped };
}

async function step(run, spec, vars) {
  const s = render(spec, vars);
  if (s.request) {
    const { method = "GET", path, json, headers } = s.request;
    return fetchJson(run, method, path, { json, headers });
  }
  if (s.scheduled) return fetchJson(run, "GET", `/cdn-cgi/handler/scheduled?cron=${encodeURIComponent(s.scheduled.cron ?? "* * * * *")}`);
  if (s.d1) return { rows: await d1(run, s.d1.binding, s.d1.sql) };
  if (s.kv) {
    const value = await kvGet(run, s.kv.binding, s.kv.key);
    let parsed = value;
    try {
      parsed = value === null ? null : JSON.parse(value);
    } catch {}
    return { value: parsed };
  }
  if (s.r2) {
    const value = await r2Get(run, s.r2.binding, s.r2.key);
    let parsed = value;
    try {
      parsed = value === null ? null : JSON.parse(value);
    } catch {}
    return { value: parsed };
  }
  if (s.log) {
    const log = readFileSync(run.log, "utf8");
    return { matched: new RegExp(s.log.pattern).test(log) };
  }
  throw new UsageError(`Unknown step: ${JSON.stringify(spec)}`);
}

function judge(expect = {}, result) {
  if (expect.status !== undefined && result.status !== expect.status) return `status: expected ${expect.status}, got ${result.status}`;
  for (const [key, field] of [["json", "body"], ["headers", "headers"], ["rows", "rows"], ["value", "value"]]) {
    if (expect[key] === undefined) continue;
    const miss = subsetMismatch(expect[key], result[field], key);
    if (miss) return miss;
  }
  if (expect.matched !== undefined && result.matched !== expect.matched) return `log pattern matched=${result.matched}`;
  return null;
}

async function runJourney(run, journey, vars) {
  const steps = [];
  for (const spec of journey.steps) {
    const { expect, save, retry, label } = spec;
    const deadline = Date.now() + (retry?.timeoutMs ?? 0);
    let result;
    let miss;
    for (;;) {
      result = await step(run, spec, vars);
      miss = judge(render(expect, vars), result);
      if (!miss || Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, retry?.intervalMs ?? 500));
    }
    for (const [name, path] of Object.entries(save ?? {})) vars[name] = pick(result.body ?? result, path);
    const entry = { journey: journey.feature, label: label ?? Object.keys(spec).find((k) => !["expect", "save", "retry", "label"].includes(k)), ok: !miss, miss, result };
    record(run, { command: "smoke-step", ...entry });
    steps.push(entry);
    if (miss) break;
  }
  return { feature: journey.feature, ok: steps.every((s) => s.ok), steps };
}

function summaryMarkdown(run, doctorResult, journeys) {
  const lines = [`# Verification evidence: ${config.app}`, "", `- Run: \`${run.runId}\``, `- Started: ${run.startedAt}`, `- Base URL: ${run.baseUrl}`, `- Doctor: ${doctorResult.ok ? "pass" : "FAIL"}`, "", "| Feature | Step | Result |", "|---|---|---|"];
  for (const j of journeys) for (const s of j.steps) lines.push(`| ${j.feature} | ${s.label} | ${s.ok ? "pass" : `FAIL: ${String(s.miss).replace(/\|/g, "\\|")}`} |`);
  lines.push("", "Raw responses are in `transcript.jsonl`. Wrangler output is in `wrangler.log`.", "");
  return lines.join("\n");
}

async function smoke(flags) {
  const spec = JSON.parse(readFileSync(join(SKILL_DIR, config.smoke ?? "smoke.json"), "utf8"));
  const started = await start(flags);
  const run = loadRun({ run: started.runId });
  let doctorResult = { ok: false, checks: [] };
  const journeys = [];
  try {
    doctorResult = await doctor({ run: run.runId });
    if (doctorResult.ok) {
      const only = flags.feature ? String(flags.feature).split(",") : null;
      for (const journey of spec.journeys.filter((j) => !only || only.includes(j.feature))) {
        journeys.push(await runJourney(run, journey, { runId: run.runId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-10), port: run.port, baseUrl: run.baseUrl }));
      }
    }
  } finally {
    writeFileSync(join(run.evidence, "summary.md"), summaryMarkdown(run, doctorResult, journeys));
    if (!flags.keep) await stop({ run: run.runId });
  }
  const ok = doctorResult.ok && journeys.length > 0 && journeys.every((j) => j.ok);
  return { ok, runId: run.runId, evidence: relative(PROJECT_ROOT, run.evidence), doctor: doctorResult.ok, journeys: journeys.map((j) => ({ feature: j.feature, ok: j.ok, failed: j.steps.find((s) => !s.ok)?.miss })) };
}

async function drive(command, positional, flags) {
  const run = loadRun(flags);
  let result;
  if (command === "request") {
    const [method, path] = positional;
    if (!method || !path) throw new UsageError("Usage: request <METHOD> <PATH> [--json '<body>'] [--header 'k: v']");
    const headers = Object.fromEntries([flags.header ?? []].flat().map((h) => h.split(/:\s*/, 2)));
    result = await fetchJson(run, method.toUpperCase(), path, { json: flags.json === undefined ? undefined : JSON.parse(flags.json), headers });
  } else if (command === "scheduled") {
    result = await step(run, { scheduled: { cron: flags.cron } }, {});
  } else if (command === "d1") {
    const [binding, sql] = positional;
    result = { rows: await d1(run, binding, sql) };
  } else if (command === "kv-get") {
    result = await step(run, { kv: { binding: positional[0], key: positional[1] } }, {});
  } else if (command === "r2-get") {
    result = await step(run, { r2: { binding: positional[0], key: positional[1] } }, {});
  }
  record(run, { command, args: positional, flags, label: flags.label, result });
  return result;
}

function logs(flags) {
  const run = loadRun(flags);
  const lines = readFileSync(run.log, "utf8").split("\n");
  const filtered = flags.grep ? lines.filter((l) => new RegExp(flags.grep).test(l)) : lines;
  return { log: run.log, lines: filtered.slice(-Number(flags.tail ?? 50)) };
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split(/=(.*)/s, 2);
    const value = inline ?? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true);
    flags[key] = key in flags ? [flags[key], value].flat() : value;
  }
  return { positional, flags };
}

const HELP = `control.mjs: drive ${config.app} under wrangler dev --local. Every command prints JSON.
  start [--port N] [--run-id ID]   migrate, seed and launch an isolated instance; waits for ${config.ready?.path}
  doctor [--run ID]                read-only: process owned by us, ready, bindings local, migrations, seed
  request METHOD PATH [--json B] [--header 'k: v'] [--label L]
  scheduled [--cron "0 * * * *"]   fire the scheduled() handler
  d1 BINDING "SQL"                 query local D1 (read-back)
  kv-get BINDING KEY               read local KV
  r2-get BINDING KEY               read local R2 object
  logs [--grep RE] [--tail N]      wrangler output for this run
  smoke [--feature a,b] [--keep]   start, doctor, run smoke.json journeys, write evidence, stop
  stop [--run ID | --all]          kill only the process this harness started; keeps evidence
Evidence: .verify/evidence/<run-id>/ (transcript.jsonl, doctor.json, summary.md, wrangler.log)`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  let result;
  switch (command) {
    case "start":
      result = await start(flags);
      break;
    case "doctor":
      result = await doctor(flags);
      break;
    case "stop":
      result = await stop(flags);
      break;
    case "smoke":
      result = await smoke(flags);
      break;
    case "logs":
      result = logs(flags);
      break;
    case "request":
    case "scheduled":
    case "d1":
    case "kv-get":
    case "r2-get":
      result = await drive(command, positional, flags);
      break;
    default:
      console.log(HELP);
      process.exit(command && command !== "help" && command !== "--help" ? 2 : 0);
  }
  console.log(JSON.stringify(result, null, 2));
  if (result && result.ok === false) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = error instanceof UsageError ? 2 : 1;
  });
}
