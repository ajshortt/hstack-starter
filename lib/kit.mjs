import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_DIR = join(KIT_ROOT, "template", "files");
const KIT_DIR = ".pstack-kit";

export class KitError extends Error {}

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const posix = (p) => p.split(sep).join("/");

export function kitInfo() {
  const pkg = readJson(join(KIT_ROOT, "package.json"));
  const pstack = readJson(join(KIT_ROOT, "vendor", "pstack.lock.json"));
  return { version: pkg.version, pstackVersion: pstack.version };
}

export function render(text, vars, where) {
  return text.replace(/(?<!\$)\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in vars)) throw new KitError(`Unknown template variable {{${key}}} in ${where}.`);
    return String(vars[key]);
  });
}

function gitRoot(dir) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return dir;
  }
}

function guessName(target) {
  const pkg = join(target, "package.json");
  if (existsSync(pkg)) {
    const name = readJson(pkg).name;
    if (name) return name.replace(/^@[^/]+\//, "");
  }
  return null;
}

export function loadConfig(target, flags) {
  const file = join(target, KIT_DIR, "config.json");
  const existing = existsSync(file) ? readJson(file) : null;
  const projectName = flags.name ?? existing?.projectName ?? guessName(target);
  if (!projectName) throw new KitError("Cannot infer the project name. Pass --name <worker-name>.");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(projectName)) throw new KitError(`Project name "${projectName}" must be lowercase letters, digits and hyphens.`);
  const phase = Number(flags.phase ?? existing?.phase ?? 2);
  if (![0, 1, 2].includes(phase)) throw new KitError("--phase must be 0, 1 or 2.");
  if (existing && phase < existing.phase) throw new KitError(`Phase ${phase} is lower than the applied phase ${existing.phase}. The kit never removes files; lower it by hand if you mean to.`);
  return {
    file,
    isNew: !existing,
    config: {
      projectName,
      phase,
      owners: flags.owners ?? existing?.owners ?? "@your-org/your-team",
      nodeVersion: existing?.nodeVersion ?? "22",
      diffLimit: existing?.diffLimit ?? { lines: 400, exclude: [] },
    },
  };
}

export function templateVars(target, root, config) {
  const workingDirectory = posix(relative(root, target)) || ".";
  const nested = workingDirectory !== ".";
  const { pstackVersion } = kitInfo();
  return {
    projectName: config.projectName,
    verifySkill: `verify-${config.projectName}`,
    owners: config.owners,
    nodeVersion: config.nodeVersion,
    diffLimit: config.diffLimit.lines,
    pstackVersion,
    workingDirectory,
    workdirPrefix: nested ? `${workingDirectory}/` : "",
    pathsGlob: nested ? `${workingDirectory}/**` : "**",
    workflowFile: nested ? `worker-ci-${config.projectName}.yml` : "worker-ci.yml",
    installCommand: nested ? `cd ${workingDirectory} && npm ci` : "npm ci",
  };
}

function mergeMissing(base, extra) {
  const out = structuredClone(base);
  let added = false;
  for (const [key, value] of Object.entries(extra)) {
    if (!(key in out)) {
      out[key] = value;
      added = true;
    } else if (value && typeof value === "object" && !Array.isArray(value) && out[key] && typeof out[key] === "object") {
      const nested = mergeMissing(out[key], value);
      out[key] = nested.out;
      added ||= nested.added;
    }
  }
  return { out, added };
}

export function plan(target, flags = {}) {
  target = resolve(target);
  if (!existsSync(target)) throw new KitError(`Target ${target} does not exist.`);
  const root = gitRoot(target);
  const { config, file: configFile, isNew } = loadConfig(target, flags);
  const vars = templateVars(target, root, config);
  const lockFile = join(target, KIT_DIR, "lock.json");
  const lock = existsSync(lockFile) ? readJson(lockFile) : { files: {} };
  const manifest = readJson(join(KIT_ROOT, "template", "manifest.json"));
  const acceptLocal = new Set([flags["accept-local"] ?? []].flat());
  const takeKit = new Set([flags["take-kit"] ?? []].flat());

  const actions = [];
  const seen = new Set();
  for (const entry of manifest.files.filter((f) => f.phase <= config.phase)) {
    const src = join(TEMPLATE_DIR, entry.src);
    const destRel = render(entry.dest ?? entry.src, vars, "manifest");
    const base = entry.root === "git" ? root : target;
    const abs = join(base, destRel);
    const key = posix(relative(root, abs));
    seen.add(key);
    const content = render(readFileSync(src, "utf8"), vars, entry.src);
    const hash = sha256(content);
    const current = existsSync(abs) ? readFileSync(abs, "utf8") : null;
    const locked = lock.files[key];
    const action = { path: key, abs, mode: entry.mode, phase: entry.phase, content, hash, executable: content.startsWith("#!") };

    if (entry.mode === "lines") {
      const have = new Set((current ?? "").split("\n").map((l) => l.trim()));
      const missing = content.split("\n").filter((l) => l.trim() && !have.has(l.trim()));
      action.kind = missing.length ? (current === null ? "create" : "merge") : "unchanged";
      action.content = missing.length ? `${current ?? ""}${current && !current.endsWith("\n") ? "\n" : ""}${current ? "\n# Added by pstack-kit\n" : ""}${missing.join("\n")}\n` : current;
      action.detail = missing.length ? `adds ${missing.join(", ")}` : undefined;
    } else if (entry.mode === "json-merge") {
      if (current === null) action.kind = "create";
      else {
        let parsed;
        try {
          parsed = JSON.parse(current);
        } catch {
          action.kind = "conflict";
          action.detail = "existing file is not plain JSON (comments?); merge the kit keys by hand";
        }
        if (parsed) {
          const { out, added } = mergeMissing(parsed, JSON.parse(content));
          action.kind = added ? "merge" : "unchanged";
          action.content = `${JSON.stringify(out, null, 2)}\n`;
        }
      }
    } else if (entry.mode === "seed") {
      if (current !== null) action.kind = "seed-exists";
      else if (locked) action.kind = "deleted-locally";
      else action.kind = "create";
    } else if (current === null) {
      action.kind = locked && !takeKit.has(key) ? "deleted-locally" : "create";
    } else if (current === content) {
      action.kind = "unchanged";
    } else if (takeKit.has(key)) {
      action.kind = "update";
      action.detail = "--take-kit overwrote local edits";
    } else if (locked && sha256(current) === locked.hash) {
      action.kind = "update";
    } else if (locked && locked.hash === hash) {
      action.kind = "keep-local";
      action.detail = "edited locally; the kit's version has not changed since";
    } else if (acceptLocal.has(key)) {
      action.kind = "accept-local";
      action.detail = "local version kept; future kit changes will be flagged again";
    } else {
      action.kind = "conflict";
      action.detail = locked ? "edited locally and changed in the kit" : "file existed before the kit was applied";
    }
    actions.push(action);
  }
  for (const key of Object.keys(lock.files)) {
    if (!seen.has(key) && lock.files[key].mode === "managed") actions.push({ path: key, mode: "managed", kind: "orphan", detail: "no longer shipped by the kit; delete it if nothing uses it" });
  }
  return { target, root, config, configFile, isNew, lockFile, lock, vars, actions };
}

const PENDING = new Set(["create", "update", "merge", "conflict", "accept-local"]);
export const pendingActions = (result) => result.actions.filter((a) => PENDING.has(a.kind));

export function write(result) {
  const { target, root, config, configFile, lockFile, lock, actions } = result;
  const incomingDir = join(target, KIT_DIR, "incoming");
  const files = { ...lock.files };
  for (const a of actions) {
    if (["create", "update", "merge"].includes(a.kind)) {
      mkdirSync(dirname(a.abs), { recursive: true });
      writeFileSync(a.abs, a.content);
      if (a.executable) chmodSync(a.abs, 0o755);
    }
    if (a.kind === "conflict" && a.mode !== "json-merge") {
      const staged = join(incomingDir, a.path);
      mkdirSync(dirname(staged), { recursive: true });
      writeFileSync(staged, a.content);
      a.staged = posix(relative(root, staged));
    }
    if (a.mode === "managed" && ["create", "update", "unchanged", "accept-local"].includes(a.kind)) files[a.path] = { mode: "managed", hash: a.hash };
    if (a.mode === "seed" && a.kind === "create") files[a.path] = { mode: "seed" };
  }
  const changed = actions.some((a) => ["create", "update", "merge", "accept-local"].includes(a.kind));
  mkdirSync(dirname(configFile), { recursive: true });
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  const kit = kitInfo();
  const nextLock = { kit: kit.version, pstack: kit.pstackVersion, phase: config.phase, files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) };
  const prev = JSON.stringify({ ...lock, appliedAt: undefined });
  if (changed || prev !== JSON.stringify({ ...nextLock, appliedAt: undefined })) {
    writeFileSync(lockFile, `${JSON.stringify({ ...nextLock, appliedAt: new Date().toISOString().slice(0, 10) }, null, 2)}\n`);
  }
  return result;
}
