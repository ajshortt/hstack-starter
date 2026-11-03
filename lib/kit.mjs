import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORE_DIR = join(KIT_ROOT, "core");
const ADAPTERS_DIR = join(KIT_ROOT, "adapters");
const KIT_DIR = ".hstack-kit";
const AGENT_FRAGMENTS = ["summary", "map", "commands", "rules", "autonomy"];

export class KitError extends Error {}

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
// Projects applied before the rename keep their state in .pstack-kit/ until the next apply writes .hstack-kit/.
const readKitJson = (target, name) => [KIT_DIR, ".pstack-kit"].map((dir) => join(target, dir, name)).filter((f) => existsSync(f)).map(readJson)[0] ?? null;
const posix = (p) => p.split(sep).join("/");

export function kitInfo() {
  const pkg = readJson(join(KIT_ROOT, "package.json"));
  const pstack = readJson(join(KIT_ROOT, "vendor", "pstack.lock.json"));
  return { version: pkg.version, pstackVersion: pstack.version };
}

export function render(text, vars, where) {
  return text.replace(/(?<!\$)\{\{(!?)(\w+)\}\}/g, (_, escaped, key) => {
    if (escaped) return `{{${key}}}`;
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

export const slugify = (name) =>
  name
    .replace(/^@[^/]+\//, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

function nameFromToml(file) {
  if (!existsSync(file)) return null;
  let section = "";
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const header = line.match(/^\s*\[([^\]]+)\]/);
    if (header) section = header[1].trim();
    const name = line.match(/^\s*name\s*=\s*["']([^"']+)["']/);
    if (name && ["project", "package", "tool.poetry"].includes(section)) return name[1];
  }
  return null;
}

export function guessName(target) {
  const pkg = join(target, "package.json");
  const candidates = [existsSync(pkg) ? readJson(pkg).name : null, nameFromToml(join(target, "pyproject.toml")), nameFromToml(join(target, "Cargo.toml")), basename(resolve(target))];
  for (const candidate of candidates) {
    const slug = candidate ? slugify(candidate) : "";
    if (slug) return slug;
  }
  return null;
}

export function availableAdapters() {
  if (!existsSync(ADAPTERS_DIR)) return [];
  return readdirSync(ADAPTERS_DIR)
    .filter((name) => existsSync(join(ADAPTERS_DIR, name, "adapter.json")))
    .sort();
}

export function loadAdapter(name) {
  const file = join(ADAPTERS_DIR, name, "adapter.json");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || !existsSync(file)) {
    const known = availableAdapters();
    throw new KitError(`Unknown adapter "${name}". Available: ${known.length ? known.join(", ") : "none"} (or "none" for core only).`);
  }
  return { ...readJson(file), name, dir: join(ADAPTERS_DIR, name) };
}

const parseAdapterFlag = (value) =>
  [value]
    .flat()
    .filter((v) => typeof v === "string")
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);

function resolveAdapters(flags, existing) {
  const given = "adapter" in flags ? parseAdapterFlag(flags.adapter) : null;
  if (given !== null && given.length === 0) throw new KitError('--adapter needs a value: an adapter name, a comma-separated list, or "none".');
  const none = given?.includes("none");
  if (none && given.length > 1) throw new KitError('--adapter none cannot be combined with other adapters.');
  const requested = none ? [] : given;
  for (const name of requested ?? []) loadAdapter(name);

  if (existing && !Array.isArray(existing.adapters)) {
    if (requested === null) {
      throw new KitError(
        "This project was adopted with pstack-kit 0.1, which always installed the Cloudflare Workers files. Since 0.2 the kit is a stack-agnostic core plus optional adapters. " +
          'Re-run with --adapter workers to keep the Workers rules, verification driver and checks, or --adapter none for core only (the kit never deletes files; remove the Workers ones by hand if you choose none).',
      );
    }
    return requested;
  }
  const current = existing?.adapters ?? [];
  if (requested === null) return current;
  const dropped = current.filter((a) => !requested.includes(a));
  if (dropped.length) {
    throw new KitError(`Adapter ${dropped.join(", ")} is already applied and the kit never removes one. Pass it again (--adapter ${[...new Set([...current, ...requested])].join(",")}), or remove its files and its entry in .hstack-kit/config.json by hand.`);
  }
  return [...new Set([...current, ...requested])];
}

export function loadConfig(target, flags) {
  const file = join(target, KIT_DIR, "config.json");
  const existing = readKitJson(target, "config.json");
  const projectName = flags.name ?? existing?.projectName ?? guessName(target);
  if (!projectName) throw new KitError("Cannot infer the project name. Pass --name <project-name>.");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(projectName)) throw new KitError(`Project name "${projectName}" must be lowercase letters, digits and hyphens. Pass --name <project-name>.`);
  const phase = Number(flags.phase ?? existing?.phase ?? 2);
  if (![0, 1, 2].includes(phase)) throw new KitError("--phase must be 0, 1 or 2.");
  if (existing && phase < existing.phase) throw new KitError(`Phase ${phase} is lower than the applied phase ${existing.phase}. The kit never removes files; lower it by hand if you mean to.`);
  const adapters = resolveAdapters(flags, existing);
  for (const name of adapters) loadAdapter(name);
  return {
    file,
    isNew: !existing,
    config: {
      projectName,
      phase,
      adapters,
      owners: flags.owners ?? existing?.owners ?? "@your-org/your-team",
      nodeVersion: existing?.nodeVersion ?? "22",
      diffLimit: existing?.diffLimit ?? { lines: 400, exclude: [] },
    },
  };
}

function sources(config) {
  const core = { name: "core", dir: CORE_DIR, ...readJson(join(CORE_DIR, "manifest.json")) };
  return [core, ...config.adapters.map(loadAdapter)];
}

function agentFragments(layers, vars) {
  const read = (layer, key) => (layer.agents?.[key] ? render(readFileSync(join(layer.dir, layer.agents[key]), "utf8"), vars, `${layer.name}/${layer.agents[key]}`).trim() : null);
  const out = {};
  for (const key of AGENT_FRAGMENTS) {
    const fromAdapters = layers.slice(1).map((l) => read(l, key)).filter(Boolean);
    out[key] = fromAdapters.length ? fromAdapters : [read(layers[0], key)].filter(Boolean);
  }
  return {
    agentsSummary: out.summary.join("\n\n"),
    agentsMap: out.map.map((f) => `\n${f}`).join(""),
    agentsCommands: out.commands.map((f) => `\n${f}\n`).join(""),
    agentsRules: out.rules.map((f) => `\n${f}`).join(""),
    agentsAutonomy: out.autonomy.join(""),
  };
}

export function templateVars(target, root, config, layers = sources(config)) {
  const workingDirectory = posix(relative(root, target)) || ".";
  const nested = workingDirectory !== ".";
  const { pstackVersion } = kitInfo();
  const vars = {
    projectName: config.projectName,
    verifySkill: `verify-${config.projectName}`,
    owners: config.owners,
    nodeVersion: config.nodeVersion,
    diffLimit: config.diffLimit.lines,
    pstackVersion,
    adapters: config.adapters.length ? config.adapters.join(", ") : "none",
    workingDirectory,
    workdirPrefix: nested ? `${workingDirectory}/` : "",
    pathsGlob: nested ? `${workingDirectory}/**` : "**",
    workflowFile: nested ? `hstack-kit-${config.projectName}.yml` : "hstack-kit.yml",
    installCommand: nested ? `cd ${workingDirectory} && node scripts/kit/checks.mjs setup` : "node scripts/kit/checks.mjs setup",
  };
  return { ...vars, ...agentFragments(layers, vars) };
}

function resolveEntries(layers, vars, target, root, phase) {
  const byKey = new Map();
  for (const layer of layers) {
    for (const entry of layer.files.filter((f) => f.phase <= phase)) {
      const destRel = render(entry.dest ?? entry.src, vars, `${layer.name} manifest`);
      const abs = join(entry.root === "git" ? root : target, destRel);
      const key = posix(relative(root, abs));
      const content = render(readFileSync(join(layer.dir, "files", entry.src), "utf8"), vars, `${layer.name}/${entry.src}`);
      const prev = byKey.get(key);
      if (prev && prev.mode === "lines" && entry.mode === "lines") {
        prev.content = `${prev.content.replace(/\n*$/, "\n")}${content}`;
        prev.from.push(layer.name);
        continue;
      }
      if (prev) byKey.delete(key);
      byKey.set(key, { ...entry, key, abs, content, phase: Math.min(entry.phase, prev?.phase ?? entry.phase), from: [layer.name] });
    }
  }
  return [...byKey.values()];
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
  const layers = sources(config);
  const vars = templateVars(target, root, config, layers);
  const lockFile = join(target, KIT_DIR, "lock.json");
  const lock = readKitJson(target, "lock.json") ?? { files: {} };
  const acceptLocal = new Set([flags["accept-local"] ?? []].flat());
  const takeKit = new Set([flags["take-kit"] ?? []].flat());
  const warnings = layers
    .slice(1)
    .flatMap((a) => (a.requires ?? []).filter((p) => !existsSync(join(target, p))).map((p) => `adapter ${a.name} expects ${p}, which does not exist yet; its checks and driver will fail until it does.`));

  const actions = [];
  const seen = new Set();
  for (const entry of resolveEntries(layers, vars, target, root, config.phase)) {
    const { key, abs, content } = entry;
    seen.add(key);
    const hash = sha256(content);
    const current = existsSync(abs) ? readFileSync(abs, "utf8") : null;
    const locked = lock.files[key];
    const action = { path: key, abs, mode: entry.mode, phase: entry.phase, from: entry.from.join("+"), content, hash, executable: content.startsWith("#!") };

    if (entry.mode === "lines") {
      const have = new Set((current ?? "").split("\n").map((l) => l.trim()));
      const missing = content.split("\n").filter((l) => l.trim() && !have.has(l.trim()));
      action.kind = missing.length ? (current === null ? "create" : "merge") : "unchanged";
      action.content = missing.length ? `${current ?? ""}${current && !current.endsWith("\n") ? "\n" : ""}${current ? "\n# Added by hstack-kit\n" : ""}${missing.join("\n")}\n` : current;
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
    if (seen.has(key) || lock.files[key].mode !== "managed") continue;
    if (existsSync(join(root, key))) actions.push({ path: key, mode: "managed", kind: "orphan", detail: "no longer shipped by the kit; delete it if nothing uses it" });
    else actions.push({ path: key, mode: "managed", kind: "forget", detail: "orphan deleted; dropped from the lock" });
  }
  return { target, root, config, configFile, isNew, lockFile, lock, vars, actions, warnings };
}

const PENDING = new Set(["create", "update", "merge", "conflict", "accept-local", "forget"]);
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
    if (a.kind === "forget") delete files[a.path];
  }
  const changed = actions.some((a) => ["create", "update", "merge", "accept-local"].includes(a.kind));
  mkdirSync(dirname(configFile), { recursive: true });
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  const kit = kitInfo();
  const nextLock = { kit: kit.version, pstack: kit.pstackVersion, phase: config.phase, adapters: config.adapters, files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) };
  const prev = JSON.stringify({ ...lock, appliedAt: undefined });
  if (changed || prev !== JSON.stringify({ ...nextLock, appliedAt: undefined })) {
    writeFileSync(lockFile, `${JSON.stringify({ ...nextLock, appliedAt: new Date().toISOString().slice(0, 10) }, null, 2)}\n`);
  }
  return result;
}
