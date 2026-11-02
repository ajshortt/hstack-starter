#!/usr/bin/env node
// Managed by pstack-kit. Stack-neutral verification harness: isolated runs, doctor, drive steps, smoke journeys, evidence.
// How the app runs is project config (verify.config.json "launch") or an adapter driver (verify.config.json "driver").
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const CHILD_ENV = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", CI: "1" };

export class UsageError extends Error {}

let config;
let driver = {};
let PROJECT_ROOT;
let VERIFY_DIR;
let RUNS_DIR;
let EVIDENCE_ROOT;
let CURRENT;

async function init() {
  config = JSON.parse(readFileSync(join(SKILL_DIR, "verify.config.json"), "utf8"));
  PROJECT_ROOT = resolve(SKILL_DIR, config.projectRoot ?? "../../..");
  VERIFY_DIR = join(PROJECT_ROOT, ".verify");
  RUNS_DIR = join(VERIFY_DIR, "runs");
  EVIDENCE_ROOT = join(VERIFY_DIR, "evidence");
  CURRENT = join(VERIFY_DIR, "current");
  if (config.driver) driver = (await import(pathToFileURL(join(SKILL_DIR, config.driver)).href)).default ?? {};
}

export function render(value, vars) {
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

export function judge(expect = {}, result) {
  for (const [key, expected] of Object.entries(expect)) {
    const miss = subsetMismatch(expected, result?.[key === "json" ? "body" : key], key);
    if (miss) return miss;
  }
  return null;
}

export const parseMaybeJson = (text) => {
  if (text === null || text === undefined) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

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

const startTimeOf = (pid) => {
  try {
    return readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" ")[19];
  } catch {
    return null;
  }
};

const owned = (run) => Boolean(run.pid) && isAlive(run.pid) && (run.startTime == null || startTimeOf(run.pid) === run.startTime);

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

const saveRun = (run) => writeFileSync(join(run.runDir, "run.json"), JSON.stringify(run, null, 2));

function evidenceDir(runId) {
  const dir = join(EVIDENCE_ROOT, runId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function record(run, entry) {
  appendFileSync(join(evidenceDir(run.runId), "transcript.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

async function fetchJson(run, method, path, { json, headers = {}, body } = {}) {
  if (!run.baseUrl) throw new UsageError("This run has no baseUrl. Set `baseUrl` (and `launch`) in verify.config.json, or use a driver that serves HTTP.");
  const started = Date.now();
  const response = await fetch(new URL(path, run.baseUrl), {
    method,
    redirect: "manual",
    headers: { ...(json === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: json === undefined ? body : JSON.stringify(json),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, headers: Object.fromEntries(response.headers), body: parseMaybeJson(await response.text()), ms: Date.now() - started };
}

export function runCommand(command, { cwd, env = {}, timeoutMs = 120000, stdin } = {}) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    const child = execFile("sh", ["-c", command], { cwd, env: { ...CHILD_ENV, ...env }, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      const exitCode = error ? (typeof error.code === "number" ? error.code : 1) : 0;
      resolveRun({ exitCode, stdout: stdout.replace(/\n$/, ""), stderr: stderr.replace(/\n$/, ""), json: parseMaybeJson(stdout.trim() || null), ms: Date.now() - started });
    });
    if (stdin !== undefined) child.stdin.end(stdin);
  });
}

function context(run) {
  return {
    config,
    run,
    projectRoot: PROJECT_ROOT,
    skillDir: SKILL_DIR,
    env: CHILD_ENV,
    UsageError,
    render,
    parseMaybeJson,
    subsetMismatch,
    request: (method, path, opts) => fetchJson(run, method, path, opts),
    runCommand: (command, opts) => runCommand(command, { cwd: PROJECT_ROOT, ...opts }),
    record: (entry) => record(run, entry),
  };
}

const CORE_STEPS = {
  request: (ctx, { method = "GET", path, json, headers, body }) => ctx.request(method, path, { json, headers, body }),
  run: (ctx, { command, cwd, env, timeoutMs, stdin }) => runCommand(command, { cwd: resolve(PROJECT_ROOT, cwd ?? "."), env, timeoutMs, stdin }),
  log: (ctx, { pattern }) => {
    if (!ctx.run.log || !existsSync(ctx.run.log)) throw new UsageError("This run has no log. Only launched runs capture output.");
    return { matched: new RegExp(pattern).test(readFileSync(ctx.run.log, "utf8")) };
  },
  file: (ctx, { path }) => {
    const file = resolve(PROJECT_ROOT, path);
    return existsSync(file) ? { exists: true, value: parseMaybeJson(readFileSync(file, "utf8")) } : { exists: false, value: null };
  },
};

const RESERVED = new Set(["expect", "save", "retry", "label", "name"]);
const stepKind = (spec) => Object.keys(spec).find((k) => !RESERVED.has(k));

async function step(run, spec, vars) {
  const s = render(spec, vars);
  const kind = stepKind(s);
  const handler = driver.steps?.[kind] ?? CORE_STEPS[kind];
  if (!handler) throw new UsageError(`Unknown step "${kind}". Core steps: ${Object.keys(CORE_STEPS).join(", ")}. Driver steps: ${Object.keys(driver.steps ?? {}).join(", ") || "none"}.`);
  return handler(context(run), s[kind]);
}

function runVars(run) {
  // runId is the slug-safe form (lowercase letters and digits), so journeys can put it in names, slugs and keys.
  return { runId: run.runId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-10), port: run.port, baseUrl: run.baseUrl ?? "", runDir: run.runDir, projectRoot: PROJECT_ROOT };
}

async function waitReady(run, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = "no attempt yet";
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`The app exited with ${child.exitCode} before it was ready. See ${run.log}.`);
    try {
      const result = await step(run, config.ready, runVars(run));
      const miss = judge(render(config.ready.expect, runVars(run)), result);
      if (!miss) return result;
      last = miss;
    } catch (error) {
      if (error instanceof UsageError) throw error;
      last = error.message;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Not ready after ${timeoutMs}ms: ${last}.${run.log ? ` See ${run.log}.` : ""}`);
}

function launchFromConfig(run) {
  const launch = render(config.launch, runVars(run));
  const logFd = openSync(run.log, "a");
  return spawn("sh", ["-c", launch.command], { cwd: resolve(PROJECT_ROOT, launch.cwd ?? "."), env: { ...CHILD_ENV, ...launch.env }, detached: true, stdio: ["ignore", logFd, logFd] });
}

async function start(flags) {
  if (config._template) throw new UsageError("verify.config.json is still the kit template. Tailor it (see SKILL.md, 'Tailor this skill') before running.");
  const runId = flags["run-id"] ?? `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "")}-${process.pid}`;
  const runDir = join(RUNS_DIR, runId);
  if (existsSync(join(runDir, "run.json"))) throw new UsageError(`Run ${runId} already exists. Stop it or pick another --run-id.`);
  mkdirSync(runDir, { recursive: true });
  const port = Number(flags.port ?? (await freePort()));
  const run = { runId, runDir, port, log: null, evidence: evidenceDir(runId), startedAt: new Date().toISOString() };
  run.baseUrl = config.baseUrl ? render(config.baseUrl, runVars(run)) : `http://127.0.0.1:${port}`;
  saveRun(run);
  writeFileSync(CURRENT, runId);
  try {
    const ctx = context(run);
    if (driver.prepare) await driver.prepare(ctx);
    let child = null;
    if (driver.launch || config.launch) {
      run.log = join(runDir, driver.logName ?? "app.log");
      child = driver.launch ? await driver.launch(ctx) : launchFromConfig(run);
      run.pid = child.pid;
      run.startTime = startTimeOf(child.pid);
    }
    saveRun(run);
    const ready = config.ready ? await waitReady(run, child, Number(flags.timeout ?? config.launch?.timeoutMs ?? 90000)) : null;
    record(run, { command: "start", ok: true, ready });
    child?.unref();
  } catch (error) {
    await stop({ run: runId });
    throw error;
  }
  return { ok: true, ...run };
}

async function doctor(flags) {
  const run = loadRun(flags);
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
  if (run.pid) check("process", owned(run), owned(run) ? `pid ${run.pid} started by this run` : `pid ${run.pid} is not running or is not ours`);
  if (config.ready) {
    const result = await step(run, config.ready, runVars(run)).catch((error) => ({ error: error.message }));
    const miss = result.error ?? judge(render(config.ready.expect, runVars(run)), result);
    check("ready", !miss, miss ?? "ready check passes");
  }
  for (const probe of config.doctor ?? []) {
    const result = await step(run, probe, runVars(run)).catch((error) => ({ error: error.message }));
    const miss = result.error ?? judge(render(probe.expect, runVars(run)), result);
    check(probe.name ?? stepKind(probe), !miss, miss ?? result);
  }
  if (driver.doctor) for (const c of await driver.doctor(context(run))) checks.push({ ...c, ok: Boolean(c.ok) });
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
    if (owned(run)) {
      try {
        process.kill(-run.pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
      for (let i = 0; i < 50 && isAlive(run.pid); i++) await new Promise((r) => setTimeout(r, 100));
      if (isAlive(run.pid)) process.kill(-run.pid, "SIGKILL");
    }
    if (driver.cleanup) await driver.cleanup(context(run));
    if (run.log && existsSync(run.log)) copyFileSync(run.log, join(evidenceDir(id), driver.logName ?? "app.log"));
    rmSync(runDir, { recursive: true, force: true });
    if (existsSync(CURRENT) && readFileSync(CURRENT, "utf8").trim() === id) rmSync(CURRENT);
    stopped.push({ runId: id, evidence: relative(PROJECT_ROOT, evidenceDir(id)) });
  }
  return { ok: true, stopped };
}

async function runJourney(run, journey, vars) {
  const steps = [];
  for (const spec of journey.steps) {
    const { expect, save, retry, label } = spec;
    const deadline = Date.now() + (retry?.timeoutMs ?? 0);
    let result;
    let miss;
    for (;;) {
      result = await step(run, spec, vars).catch((error) => ({ error: error.message }));
      miss = result.error ?? judge(render(expect, vars), result);
      if (!miss || Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, retry?.intervalMs ?? 500));
    }
    for (const [name, path] of Object.entries(save ?? {})) vars[name] = pick(result.body ?? result, path);
    const entry = { journey: journey.feature, label: label ?? stepKind(spec), ok: !miss, miss, result };
    record(run, { command: "smoke-step", ...entry });
    steps.push(entry);
    if (miss) break;
  }
  return { feature: journey.feature, ok: steps.every((s) => s.ok), steps };
}

function summaryMarkdown(run, doctorResult, journeys) {
  const lines = [`# Verification evidence: ${config.app}`, "", `- Run: \`${run.runId}\``, `- Started: ${run.startedAt}`];
  if (run.pid) lines.push(`- Base URL: ${run.baseUrl}`);
  lines.push(`- Doctor: ${doctorResult.ok ? "pass" : "FAIL"}`, "", "| Feature | Step | Result |", "|---|---|---|");
  if (!doctorResult.ok) for (const c of doctorResult.checks.filter((c) => !c.ok)) lines.push(`| doctor | ${c.name} | FAIL: ${JSON.stringify(c.detail).replace(/\|/g, "\\|").slice(0, 300)} |`);
  for (const j of journeys) for (const s of j.steps) lines.push(`| ${j.feature} | ${s.label} | ${s.ok ? "pass" : `FAIL: ${String(s.miss).replace(/\|/g, "\\|")}`} |`);
  lines.push("", `Raw results are in \`transcript.jsonl\`.${run.log ? ` App output is in \`${driver.logName ?? "app.log"}\`.` : ""}`, "");
  return lines.join("\n");
}

async function smoke(flags) {
  if (config._template && flags["if-tailored"]) {
    console.error("warning: verify.config.json still has \"_template\": true, so there is nothing to prove yet. Tailor the verification skill (adoption phase 1).");
    return { ok: true, skipped: true, reason: "verification skill not tailored" };
  }
  const spec = JSON.parse(readFileSync(join(SKILL_DIR, config.smoke ?? "smoke.json"), "utf8"));
  const started = await start(flags);
  const run = loadRun({ run: started.runId });
  let doctorResult = { ok: false, checks: [] };
  const journeys = [];
  try {
    doctorResult = await doctor({ run: run.runId });
    if (doctorResult.ok) {
      const only = flags.feature ? String(flags.feature).split(",") : null;
      for (const journey of spec.journeys.filter((j) => !only || only.includes(j.feature))) journeys.push(await runJourney(run, journey, runVars(run)));
    }
  } finally {
    writeFileSync(join(run.evidence, "summary.md"), summaryMarkdown(run, doctorResult, journeys));
    if (!flags.keep) await stop({ run: run.runId });
  }
  const ok = doctorResult.ok && journeys.length > 0 && journeys.every((j) => j.ok);
  return {
    ok,
    runId: run.runId,
    evidence: relative(PROJECT_ROOT, run.evidence),
    doctor: doctorResult.ok,
    ...(doctorResult.ok ? {} : { doctorFailures: doctorResult.checks.filter((c) => !c.ok) }),
    journeys: journeys.map((j) => ({ feature: j.feature, ok: j.ok, failed: j.steps.find((s) => !s.ok)?.miss })),
  };
}

async function drive(command, positional, flags) {
  const run = loadRun(flags);
  let result;
  if (command === "request") {
    const [method, path] = positional;
    if (!method || !path) throw new UsageError("Usage: request <METHOD> <PATH> [--json '<body>'] [--header 'k: v']");
    const headers = Object.fromEntries([flags.header ?? []].flat().map((h) => h.split(/:\s*/, 2)));
    result = await fetchJson(run, method.toUpperCase(), path, { json: flags.json === undefined ? undefined : JSON.parse(flags.json), headers });
  } else if (command === "run") {
    if (!positional[0]) throw new UsageError('Usage: run "<shell command>" [--label L]');
    result = await CORE_STEPS.run(context(run), { command: positional[0] });
  } else {
    result = await driver.commands[command].run(context(run), positional, flags);
  }
  record(run, { command, args: positional, flags, label: flags.label, result });
  return result;
}

function logs(flags) {
  const run = loadRun(flags);
  if (!run.log) throw new UsageError("This run has no log. Only launched runs capture output.");
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

function help() {
  const driverLines = Object.entries(driver.commands ?? {}).map(([name, c]) => `  ${c.usage ?? name}`);
  return [
    `control.mjs: verify ${config.app}${driver.name ? ` (driver: ${driver.name})` : ""}. Every command prints JSON.`,
    "  start [--port N] [--run-id ID]   isolated run: prepare, launch if configured, wait for ready",
    "  doctor [--run ID]                read-only health of the run: process, ready, probes, driver checks",
    "  request METHOD PATH [--json B] [--header 'k: v'] [--label L]",
    '  run "<shell command>" [--label L]',
    ...driverLines,
    "  logs [--grep RE] [--tail N]      captured app output for this run",
    "  smoke [--feature a,b] [--keep] [--if-tailored]   start, doctor, run smoke journeys, write evidence, stop",
    "  stop [--run ID | --all]          stop only what this harness started; keeps evidence",
    "Evidence: .verify/evidence/<run-id>/ (transcript.jsonl, doctor.json, summary.md, app log)",
  ].join("\n");
}

async function main() {
  await init();
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  let result;
  if (command === "start") result = await start(flags);
  else if (command === "doctor") result = await doctor(flags);
  else if (command === "stop") result = await stop(flags);
  else if (command === "smoke") result = await smoke(flags);
  else if (command === "logs") result = logs(flags);
  else if (command === "request" || command === "run" || driver.commands?.[command]) result = await drive(command, positional, flags);
  else {
    console.log(help());
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
