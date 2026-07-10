const fs = require("fs");
const path = require("path");

class ConfigError extends Error {}

function requireDirectory(env, name) {
  const value = (env[name] || "").trim();
  if (!value) {
    throw new ConfigError(`${name} is not set — check .env`);
  }
  if (!path.isAbsolute(value)) {
    throw new ConfigError(`${name} must be an absolute path, got "${value}"`);
  }

  // stat, never create: an unmounted CIFS share must abort the run instead of
  // letting mkdir() silently materialize the tree on the local disk.
  let stats;
  try {
    stats = fs.statSync(value);
  } catch {
    throw new ConfigError(`${name} "${value}" does not exist or is not reachable (share not mounted?)`);
  }
  if (!stats.isDirectory()) {
    throw new ConfigError(`${name} "${value}" is not a directory`);
  }
  return fs.realpathSync(value);
}

// dev:ino identity — catches the same directory reached via different
// casing (CIFS is usually case-insensitive) or separators, which string
// comparison of realpaths misses. null when the filesystem reports no inode.
function fileId(p) {
  const stats = fs.statSync(p, { bigint: true });
  return stats.ino === 0n ? null : `${stats.dev}:${stats.ino}`;
}

function isAncestor(ancestorPath, ancestorId, childPath) {
  if (childPath.startsWith(ancestorPath + path.sep)) return true;
  if (ancestorId === null) return false;
  let previous = childPath;
  let current = path.dirname(childPath);
  while (current !== previous) {
    if (fileId(current) === ancestorId) return true;
    previous = current;
    current = path.dirname(current);
  }
  return false;
}

function parseBooleanFlag(env, name) {
  const raw = (env[name] ?? "").trim().toLowerCase();
  if (raw === "" || raw === "0" || raw === "false") return false;
  if (raw === "1" || raw === "true") return true;
  // the flag guards destructive runs — an unrecognized value must not fail open
  throw new ConfigError(`${name} must be 1/true or 0/false, got "${env[name]}"`);
}

function positiveNumber(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new ConfigError(`${name} must be a non-negative number, got "${raw}"`);
  }
  return value;
}

function resolveTimeZone(env) {
  const zone = (env.TZ_HOME || "").trim();
  if (!zone) return Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
  } catch {
    throw new ConfigError(`TZ_HOME "${zone}" is not a valid IANA timezone (e.g. "Europe/Oslo")`);
  }
  return zone;
}

/**
 * Validates and resolves all configuration. Throws ConfigError with a clear
 * message on any violation — the caller logs it and exits non-zero.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
function loadConfig(env = process.env) {
  const sourceDir = requireDirectory(env, "original_file_path");
  const destDir = requireDirectory(env, "new_file_path");

  const sourceId = fileId(sourceDir);
  const destId = fileId(destDir);
  if (sourceDir === destDir || (sourceId !== null && sourceId === destId)) {
    throw new ConfigError(`original_file_path and new_file_path resolve to the same directory "${sourceDir}"`);
  }
  if (isAncestor(sourceDir, sourceId, destDir)) {
    throw new ConfigError(`new_file_path "${destDir}" is inside original_file_path "${sourceDir}" — the sorter would re-ingest its own output`);
  }
  if (isAncestor(destDir, destId, sourceDir)) {
    throw new ConfigError(`original_file_path "${sourceDir}" is inside new_file_path "${destDir}"`);
  }

  return {
    sourceDir,
    destDir,
    timeZone: resolveTimeZone(env),
    dryRun: parseBooleanFlag(env, "DRY_RUN"),
    minAgeMs: positiveNumber(env, "MIN_AGE_MINUTES", 10) * 60 * 1000,
    concurrency: Math.max(1, Math.floor(positiveNumber(env, "CONCURRENCY", 2))),
  };
}

module.exports = { loadConfig, ConfigError };
