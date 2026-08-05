const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const { createExecutor } = require("../lib/executor");

const noopLogger = () => {};
const OLD = new Date("2020-01-01T12:00:00Z");
const MIN_AGE = 10 * 60 * 1000;

let tmpDir;
let source;
let dest;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nasimg-executor-"));
  source = path.join(tmpDir, "source");
  dest = path.join(tmpDir, "dest");
  fs.mkdirSync(source);
  fs.mkdirSync(dest);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function addSourceFile(name, content = "data", mtime = OLD) {
  const p = path.join(source, name);
  fs.writeFileSync(p, content);
  fs.utimesSync(p, mtime, mtime);
  return { sourcePath: p, fileName: name, ext: path.extname(name).slice(1).toLowerCase() };
}

function makeExecutor(overrides = {}) {
  return createExecutor({
    destDir: dest,
    resolveDate: async () => ({ folder: "2020-01-01", source: "exif" }),
    logger: noopLogger,
    minAgeMs: MIN_AGE,
    concurrency: 2,
    ...overrides,
  });
}

function listDest() {
  return fs.readdirSync(dest, { recursive: true }).map(String).sort();
}

describe("basic moves", () => {
  test("moves a file into its date folder", async () => {
    const file = addSourceFile("a.jpg");
    const counts = await makeExecutor().execute([file]);

    assert.deepStrictEqual(counts, { moved: 1, renamed: 0, quarantined: 0, unsettled: 0, failed: 0 });
    assert.ok(fs.existsSync(path.join(dest, "2020-01-01", "a.jpg")));
    assert.ok(!fs.existsSync(file.sourcePath));
  });

  test("leaves a freshly-modified file for a later run", async () => {
    const file = addSourceFile("fresh.jpg", "data", new Date());
    const counts = await makeExecutor().execute([file]);

    assert.deepStrictEqual(counts, { moved: 0, renamed: 0, quarantined: 0, unsettled: 1, failed: 0 });
    assert.ok(fs.existsSync(file.sourcePath));
  });

  test("a vanished file is counted failed without stopping the others", async () => {
    const ghost = { sourcePath: path.join(source, "gone.jpg"), fileName: "gone.jpg", ext: "jpg" };
    const real = addSourceFile("real.jpg");
    const counts = await makeExecutor().execute([ghost, real]);

    assert.deepStrictEqual(counts, { moved: 1, renamed: 0, quarantined: 0, unsettled: 0, failed: 1 });
    assert.ok(fs.existsSync(path.join(dest, "2020-01-01", "real.jpg")));
  });
});

describe("collisions", () => {
  test("same name and size is quarantined, never deleted", async () => {
    fs.mkdirSync(path.join(dest, "2020-01-01"));
    fs.writeFileSync(path.join(dest, "2020-01-01", "a.jpg"), "data");
    const file = addSourceFile("a.jpg", "data");
    const counts = await makeExecutor().execute([file]);

    assert.deepStrictEqual(counts, { moved: 0, renamed: 0, quarantined: 1, unsettled: 0, failed: 0 });
    assert.ok(fs.existsSync(path.join(dest, "duplicates", "2020-01-01", "a.jpg")));
    assert.ok(!fs.existsSync(file.sourcePath));
    assert.strictEqual(fs.readFileSync(path.join(dest, "2020-01-01", "a.jpg"), "utf8"), "data");
  });

  test("same name but different content moves under a suffix", async () => {
    fs.mkdirSync(path.join(dest, "2020-01-01"));
    fs.writeFileSync(path.join(dest, "2020-01-01", "a.jpg"), "different-length-content");
    const file = addSourceFile("a.jpg", "data");
    const counts = await makeExecutor().execute([file]);

    assert.deepStrictEqual(counts, { moved: 0, renamed: 1, quarantined: 0, unsettled: 0, failed: 0 });
    assert.strictEqual(fs.readFileSync(path.join(dest, "2020-01-01", "a-1.jpg"), "utf8"), "data");
  });

  test("two same-named files in one run land under distinct names", async () => {
    fs.mkdirSync(path.join(source, "cam1"));
    fs.mkdirSync(path.join(source, "cam2"));
    const f1 = path.join(source, "cam1", "IMG.jpg");
    const f2 = path.join(source, "cam2", "IMG.jpg");
    fs.writeFileSync(f1, "photo-one");
    fs.writeFileSync(f2, "photo-two-longer");
    fs.utimesSync(f1, OLD, OLD);
    fs.utimesSync(f2, OLD, OLD);

    const counts = await makeExecutor().execute([
      { sourcePath: f1, fileName: "IMG.jpg", ext: "jpg" },
      { sourcePath: f2, fileName: "IMG.jpg", ext: "jpg" },
    ]);

    assert.strictEqual(counts.moved + counts.renamed, 2);
    const landed = fs.readdirSync(path.join(dest, "2020-01-01")).sort();
    assert.deepStrictEqual(landed, ["IMG-1.jpg", "IMG.jpg"]);
  });
});

describe("cross-filesystem fallback (forced EXDEV)", () => {
  function exdevFs(overrides = {}) {
    return {
      ...fsp,
      rename: async (from, to) => {
        if (from.includes("source")) {
          const err = new Error("EXDEV: cross-device link not permitted");
          err.code = "EXDEV";
          throw err;
        }
        return fsp.rename(from, to);
      },
      ...overrides,
    };
  }

  test("falls back to copy-verify-unlink and the file arrives intact", async () => {
    const file = addSourceFile("a.jpg", "the-content");
    const counts = await makeExecutor({ fsImpl: exdevFs() }).execute([file]);

    assert.deepStrictEqual(counts, { moved: 1, renamed: 0, quarantined: 0, unsettled: 0, failed: 0 });
    assert.strictEqual(fs.readFileSync(path.join(dest, "2020-01-01", "a.jpg"), "utf8"), "the-content");
    assert.ok(!fs.existsSync(file.sourcePath), "source removed after verified copy");
  });

  test("a truncated copy is detected: source kept, temp cleaned, nothing sorted", async () => {
    const file = addSourceFile("a.jpg", "full-content-here");
    const fsImpl = exdevFs({
      cp: async (from, to) => fsp.writeFile(to, "trunc"),
    });
    const counts = await makeExecutor({ fsImpl }).execute([file]);

    assert.deepStrictEqual(counts, { moved: 0, renamed: 0, quarantined: 0, unsettled: 0, failed: 1 });
    assert.ok(fs.existsSync(file.sourcePath), "source must never be deleted on mismatch");
    // the (empty) date folder may exist, but no file may masquerade as sorted
    const destFiles = listDest().filter((e) => fs.statSync(path.join(dest, e)).isFile());
    assert.deepStrictEqual(destFiles, [], "no truncated file may masquerade as sorted");
  });
});

describe("review-confirmed failure modes", () => {
  test("a transient stat error at plan time fails the file instead of overwriting the library", async () => {
    // reproduces the reviewed CIFS-EIO clobber: dest photo exists, dest stat
    // hiccups, file must be counted failed — never planned as a plain move
    fs.mkdirSync(path.join(dest, "2020-01-01"));
    const precious = path.join(dest, "2020-01-01", "IMG.jpg");
    fs.writeFileSync(precious, "ORIGINAL-LIBRARY-PHOTO");
    const file = addSourceFile("IMG.jpg", "different-new-content");

    const fsImpl = {
      ...fsp,
      stat: async (p) => {
        if (p === precious) {
          const err = new Error("EIO: i/o error");
          err.code = "EIO";
          throw err;
        }
        return fsp.stat(p);
      },
    };
    const counts = await makeExecutor({ fsImpl }).execute([file]);

    assert.deepStrictEqual(counts, { moved: 0, renamed: 0, quarantined: 0, unsettled: 0, failed: 1 });
    assert.strictEqual(fs.readFileSync(precious, "utf8"), "ORIGINAL-LIBRARY-PHOTO");
    assert.ok(fs.existsSync(file.sourcePath), "source retried next run");
  });

  test("a destination file appearing during the move is never overwritten", async () => {
    const file = addSourceFile("a.jpg", "mine");
    const target = path.join(dest, "2020-01-01", "a.jpg");
    const fsImpl = {
      ...fsp,
      rename: async (from, to) => {
        if (from === file.sourcePath) {
          // external writer sneaks the file in after planning, then rename runs
          fs.writeFileSync(target, "external-writer-content");
          const err = new Error("EXDEV");
          err.code = "EXDEV";
          throw err;
        }
        return fsp.rename(from, to);
      },
    };
    const counts = await makeExecutor({ fsImpl }).execute([file]);

    assert.strictEqual(counts.failed, 1);
    assert.strictEqual(fs.readFileSync(target, "utf8"), "external-writer-content");
    assert.ok(fs.existsSync(file.sourcePath), "source kept");
  });

  test("unlink failing after a verified copy: file is at dest, source kept, counted failed", async () => {
    const file = addSourceFile("a.jpg", "content");
    const fsImpl = {
      ...fsp,
      rename: async (from, to) => {
        if (from === file.sourcePath) {
          const err = new Error("EXDEV");
          err.code = "EXDEV";
          throw err;
        }
        return fsp.rename(from, to);
      },
      unlink: async () => {
        const err = new Error("EACCES: share went read-only");
        err.code = "EACCES";
        throw err;
      },
    };
    const counts = await makeExecutor({ fsImpl }).execute([file]);

    assert.strictEqual(counts.failed, 1);
    assert.strictEqual(fs.readFileSync(path.join(dest, "2020-01-01", "a.jpg"), "utf8"), "content");
    assert.ok(fs.existsSync(file.sourcePath), "source remains; next run quarantines it as a duplicate");
  });

  test("same name differing only in case cannot collide on a case-insensitive destination", async () => {
    fs.mkdirSync(path.join(source, "cam1"));
    fs.mkdirSync(path.join(source, "cam2"));
    const f1 = path.join(source, "cam1", "IMG.jpg");
    const f2 = path.join(source, "cam2", "img.jpg");
    fs.writeFileSync(f1, "photo-one");
    fs.writeFileSync(f2, "photo-two-longer");
    fs.utimesSync(f1, OLD, OLD);
    fs.utimesSync(f2, OLD, OLD);

    const counts = await makeExecutor({ concurrency: 2 }).execute([
      { sourcePath: f1, fileName: "IMG.jpg", ext: "jpg" },
      { sourcePath: f2, fileName: "img.jpg", ext: "jpg" },
    ]);

    assert.strictEqual(counts.moved + counts.renamed, 2);
    const landed = fs.readdirSync(path.join(dest, "2020-01-01"));
    assert.strictEqual(landed.length, 2, `both files must land distinctly, got: ${landed}`);
    const contents = landed.map((n) => fs.readFileSync(path.join(dest, "2020-01-01", n), "utf8")).sort();
    assert.deepStrictEqual(contents, ["photo-one", "photo-two-longer"]);
  });

  test("a failed move releases its claim so a same-named sibling is not falsely quarantined", async () => {
    fs.mkdirSync(path.join(source, "cam1"));
    fs.mkdirSync(path.join(source, "cam2"));
    const doomed = path.join(source, "cam1", "IMG.jpg");
    const healthy = path.join(source, "cam2", "IMG.jpg");
    fs.writeFileSync(doomed, "same-size!");
    fs.writeFileSync(healthy, "same-size?");
    fs.utimesSync(doomed, OLD, OLD);
    fs.utimesSync(healthy, OLD, OLD);

    const fsImpl = {
      ...fsp,
      rename: async (from, to) => {
        if (from === doomed) {
          const err = new Error("EXDEV");
          err.code = "EXDEV";
          throw err;
        }
        return fsp.rename(from, to);
      },
      cp: async (from, to) => {
        if (from === doomed) {
          const err = new Error("EIO: transient CIFS error");
          err.code = "EIO";
          throw err;
        }
        return fsp.cp(from, to);
      },
    };
    // serial so the doomed file fails completely before the sibling plans
    const counts = await makeExecutor({ fsImpl, concurrency: 1 }).execute([
      { sourcePath: doomed, fileName: "IMG.jpg", ext: "jpg" },
      { sourcePath: healthy, fileName: "IMG.jpg", ext: "jpg" },
    ]);

    assert.deepStrictEqual(counts, { moved: 1, renamed: 0, quarantined: 0, unsettled: 0, failed: 1 });
    assert.strictEqual(fs.readFileSync(path.join(dest, "2020-01-01", "IMG.jpg"), "utf8"), "same-size?");
    assert.ok(!fs.existsSync(path.join(dest, "duplicates")), "nothing may be quarantined against a ghost");
  });
});

describe("dry run", () => {
  test("logs planned actions but touches nothing", async () => {
    fs.mkdirSync(path.join(dest, "2020-01-01"));
    fs.writeFileSync(path.join(dest, "2020-01-01", "dup.jpg"), "data");
    const files = [addSourceFile("a.jpg"), addSourceFile("dup.jpg", "data")];
    const before = listDest();

    const logged = [];
    const counts = await makeExecutor({
      dryRun: true,
      logger: (level, body) => logged.push(`${level} ${body}`),
    }).execute(files);

    assert.deepStrictEqual(counts, { moved: 1, renamed: 0, quarantined: 1, unsettled: 0, failed: 0 });
    assert.deepStrictEqual(listDest(), before, "destination untouched");
    assert.ok(files.every((f) => fs.existsSync(f.sourcePath)), "sources untouched");
    assert.strictEqual(logged.filter((l) => l.includes("DRY_RUN")).length, 2);
  });
});

describe("throughput", () => {
  test("20 files through concurrency 3 all arrive exactly once", async () => {
    const files = Array.from({ length: 20 }, (_, i) => addSourceFile(`f${i}.jpg`, `content-${i}`));
    const counts = await makeExecutor({ concurrency: 3 }).execute(files);

    assert.deepStrictEqual(counts, { moved: 20, renamed: 0, quarantined: 0, unsettled: 0, failed: 0 });
    assert.strictEqual(fs.readdirSync(path.join(dest, "2020-01-01")).length, 20);
    assert.strictEqual(fs.readdirSync(source).length, 0);
  });
});
