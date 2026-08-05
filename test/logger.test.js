const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createLogger, localDateStamp } = require("../lib/logger");

let tmpDir;
let lines;
let logger;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nasimg-logger-"));
  lines = { log: [], error: [] };
  logger = createLogger({
    logDir: tmpDir,
    consoleImpl: {
      log: (l) => lines.log.push(l),
      error: (l) => lines.error.push(l),
    },
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("writes a line with local timestamp, level and script name", () => {
  logger("info", "hello", "main.js");
  assert.strictEqual(lines.log.length, 1);
  assert.match(lines.log[0], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} info main\.js: hello$/);
});

test("error level goes to console.error", () => {
  logger("error", "boom", "main.js");
  assert.strictEqual(lines.error.length, 1);
  assert.strictEqual(lines.log.length, 0);
});

test("appends to a local-date log file in the given directory", () => {
  logger("info", "first", "a.js");
  logger("warn", "second", "b.js");
  const logFile = path.join(tmpDir, `${localDateStamp(new Date())}.log`);
  const content = fs.readFileSync(logFile, "utf8");
  const written = content.trimEnd().split("\n");
  assert.strictEqual(written.length, 2);
  assert.match(written[0], / info a\.js: first$/);
  assert.match(written[1], / warn b\.js: second$/);
});

test("flattens CR/LF so a crafted filename cannot forge log lines", () => {
  logger("warn", "evil.jpg\r\n2026-01-01 00:00:00 info fake.js: forged", "x.js");
  const logFile = path.join(tmpDir, `${localDateStamp(new Date())}.log`);
  const content = fs.readFileSync(logFile, "utf8");
  assert.strictEqual(content.trimEnd().split("\n").length, 1);
  assert.doesNotMatch(lines.log[0], /[\r\n]/);
});

test("strips Unicode line separators and C1 controls that log viewers honor", () => {
  const evil = [0x2028, 0x2029, 0x85, 0x9b].map((c) => `a${String.fromCharCode(c)}b`).join("-");
  logger("warn", evil, "x.js");
  for (const c of [0x2028, 0x2029, 0x85, 0x9b]) {
    assert.ok(!lines.log[0].includes(String.fromCharCode(c)), `U+${c.toString(16)} must be stripped`);
  }
  assert.match(lines.log[0], /a b-a b-a b-a b/);
});

test("serializes Error bodies with their stack", () => {
  logger("error", new Error("kaboom"), "x.js");
  assert.match(lines.error[0], /kaboom/);
  assert.match(lines.error[0], /at /);
});

test("serializes plain objects as JSON instead of [object Object]", () => {
  logger("info", { moved: 3, failed: 1 }, "x.js");
  assert.match(lines.log[0], /\{"moved":3,"failed":1\}/);
});

test("keeps logging to console when the log directory is unwritable", () => {
  const broken = createLogger({
    logDir: path.join(tmpDir, "file-not-dir"),
    consoleImpl: {
      log: (l) => lines.log.push(l),
      error: (l) => lines.error.push(l),
    },
  });
  fs.writeFileSync(path.join(tmpDir, "file-not-dir"), "occupied");
  broken("info", "still alive", "x.js");
  assert.strictEqual(lines.log.length, 1);
  assert.strictEqual(lines.error.length, 1);
  assert.match(lines.error[0], /failed to write log file/);
});
