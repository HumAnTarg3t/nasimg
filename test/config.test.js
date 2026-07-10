const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { loadConfig, ConfigError } = require("../lib/config");

let tmpDir;
let source;
let dest;

function env(overrides = {}) {
  return { original_file_path: source, new_file_path: dest, ...overrides };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nasimg-config-"));
  source = path.join(tmpDir, "sorting");
  dest = path.join(tmpDir, "photos");
  fs.mkdirSync(source);
  fs.mkdirSync(dest);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("valid config resolves paths and defaults", () => {
  const config = loadConfig(env());
  assert.strictEqual(config.sourceDir, fs.realpathSync(source));
  assert.strictEqual(config.destDir, fs.realpathSync(dest));
  assert.strictEqual(config.dryRun, false);
  assert.strictEqual(config.minAgeMs, 10 * 60 * 1000);
  assert.strictEqual(config.concurrency, 2);
  assert.ok(config.timeZone.length > 0);
});

test("rejects missing or empty paths", () => {
  assert.throws(() => loadConfig({ new_file_path: dest }), ConfigError);
  assert.throws(() => loadConfig(env({ original_file_path: "  " })), ConfigError);
});

test("rejects relative paths", () => {
  assert.throws(() => loadConfig(env({ original_file_path: "relative/dir" })), /absolute/);
});

test("rejects a nonexistent directory without creating it", () => {
  const missing = path.join(tmpDir, "not-mounted");
  assert.throws(() => loadConfig(env({ new_file_path: missing })), /not reachable|does not exist/);
  assert.ok(!fs.existsSync(missing), "validation must never create the directory");
});

test("rejects a path that is a file", () => {
  const file = path.join(tmpDir, "a-file");
  fs.writeFileSync(file, "x");
  assert.throws(() => loadConfig(env({ original_file_path: file })), /not a directory/);
});

test("rejects source and destination resolving to the same directory", () => {
  assert.throws(() => loadConfig(env({ new_file_path: source })), /same directory/);
});

test("rejects destination nested inside source and vice versa", () => {
  const nested = path.join(source, "inner");
  fs.mkdirSync(nested);
  assert.throws(() => loadConfig(env({ new_file_path: nested })), /inside/);
  assert.throws(
    () => loadConfig(env({ original_file_path: nested, new_file_path: source })),
    /inside/
  );
});

test("parses DRY_RUN, MIN_AGE_MINUTES and CONCURRENCY", () => {
  const config = loadConfig(env({ DRY_RUN: "1", MIN_AGE_MINUTES: "5", CONCURRENCY: "4" }));
  assert.strictEqual(config.dryRun, true);
  assert.strictEqual(config.minAgeMs, 5 * 60 * 1000);
  assert.strictEqual(config.concurrency, 4);
  assert.strictEqual(loadConfig(env({ DRY_RUN: "true" })).dryRun, true);
  assert.strictEqual(loadConfig(env({ DRY_RUN: "TRUE" })).dryRun, true);
  assert.strictEqual(loadConfig(env({ DRY_RUN: "0" })).dryRun, false);
  assert.strictEqual(loadConfig(env({ DRY_RUN: "false" })).dryRun, false);
});

test("an unrecognized DRY_RUN value fails fast instead of silently running live", () => {
  assert.throws(() => loadConfig(env({ DRY_RUN: "yes" })), /DRY_RUN/);
  assert.throws(() => loadConfig(env({ DRY_RUN: "on" })), /DRY_RUN/);
});

test("overlap via symlinks is rejected", { skip: process.platform === "win32" }, () => {
  const linkToDest = path.join(tmpDir, "link-to-dest");
  fs.symlinkSync(dest, linkToDest, "dir");
  assert.throws(() => loadConfig(env({ original_file_path: linkToDest })), /same directory/);

  const nested = path.join(dest, "inner");
  fs.mkdirSync(nested);
  const linkToNested = path.join(tmpDir, "link-to-nested");
  fs.symlinkSync(nested, linkToNested, "dir");
  assert.throws(() => loadConfig(env({ original_file_path: linkToNested })), /inside/);
});

test("the same directory reached via different casing is rejected", { skip: process.platform !== "win32" }, () => {
  // NTFS is case-insensitive: SORTING and sorting are one directory, and the
  // dev+ino identity check must see through the string difference
  assert.throws(
    () => loadConfig(env({ new_file_path: source.toUpperCase() })),
    /same directory/
  );
});

test("rejects invalid numbers and timezones", () => {
  assert.throws(() => loadConfig(env({ MIN_AGE_MINUTES: "soon" })), /non-negative number/);
  assert.throws(() => loadConfig(env({ CONCURRENCY: "-1" })), /non-negative number/);
  assert.throws(() => loadConfig(env({ TZ_HOME: "Mars/Olympus" })), /IANA timezone/);
});

test("accepts a valid TZ_HOME", () => {
  assert.strictEqual(loadConfig(env({ TZ_HOME: "Europe/Oslo" })).timeZone, "Europe/Oslo");
});
