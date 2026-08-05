const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { run } = require("../main");

const OLD = new Date("2020-01-01T12:00:00Z");
const FIXTURES = path.join(__dirname, "fixtures");

let tmpDir;
let source;
let dest;
let exiftool;
let exiftoolAvailable = true;

function put(relPath, content, mtime = OLD) {
  const p = path.join(source, relPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (Buffer.isBuffer(content)) fs.writeFileSync(p, content);
  else fs.writeFileSync(p, content);
  fs.utimesSync(p, mtime, mtime);
  return p;
}

function config(overrides = {}) {
  return {
    sourceDir: source,
    destDir: dest,
    timeZone: "Europe/Oslo",
    dryRun: false,
    minAgeMs: 10 * 60 * 1000,
    concurrency: 2,
    ...overrides,
  };
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nasimg-integration-"));
  source = path.join(tmpDir, "sorting");
  dest = path.join(tmpDir, "photos");
  fs.mkdirSync(source);
  fs.mkdirSync(dest);

  try {
    ({ exiftool } = require("exiftool-vendored"));
    await exiftool.version();
  } catch {
    exiftoolAvailable = false;
  }
});

after(async () => {
  if (exiftool) await exiftool.end();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("end-to-end run sorts a mixed source tree, then a second run is idempotent", async (t) => {
  if (!exiftoolAvailable) {
    t.skip("exiftool could not start (perl missing?)");
    return;
  }

  const jpegFixture = fs.readFileSync(path.join(FIXTURES, "exif.jpg"));
  const mp4Fixture = fs.readFileSync(path.join(FIXTURES, "video.mp4"));

  // EXIF capture date 2023-04-05 (mtime says 2020 — EXIF must win)
  put("exif.jpg", jpegFixture);
  // identical copy elsewhere in the tree -> quarantined as a duplicate
  put(path.join("phone-backup", "exif.jpg"), jpegFixture);
  // QuickTime UTC 2024-06-01T22:30Z == 2024-06-02 00:30 in Europe/Oslo
  put(path.join("clips", "video.mp4"), mp4Fixture);
  // no readable metadata -> local mtime date (noon local, timezone-safe)
  const mtimeLocalNoon = new Date(2021, 2, 3, 12, 0, 0);
  put("plain.png", "not-a-real-png", mtimeLocalNoon);
  // same name, same mtime date, different content -> suffixed
  put(path.join("other", "plain.png"), "different-content-entirely", mtimeLocalNoon);
  // still uploading -> untouched
  put("fresh.jpg", "still-uploading", new Date());

  const quiet = () => {};
  const counts = await run(config(), { exiftool, log: quiet });

  assert.deepStrictEqual(counts, {
    moved: 3,
    renamed: 1,
    quarantined: 1,
    unsettled: 1,
    failed: 0,
  });

  assert.ok(fs.existsSync(path.join(dest, "2023-04-05", "exif.jpg")), "EXIF date wins over mtime");
  assert.ok(
    fs.existsSync(path.join(dest, "duplicates", "2023-04-05", "exif.jpg")),
    "identical copy quarantined"
  );
  assert.ok(
    fs.existsSync(path.join(dest, "2024-06-02", "video.mp4")),
    "UTC video date converted to Oslo local day"
  );
  const pngDir = fs.readdirSync(path.join(dest, "2021-03-03")).sort();
  assert.deepStrictEqual(pngDir, ["plain-1.png", "plain.png"], "same-name pair kept distinct");
  assert.ok(fs.existsSync(path.join(source, "fresh.jpg")), "fresh upload left in source");

  // second run: only the fresh file remains, nothing else may change
  const snapshot = fs.readdirSync(dest, { recursive: true }).map(String).sort();
  const counts2 = await run(config(), { exiftool, log: quiet });
  assert.deepStrictEqual(counts2, {
    moved: 0,
    renamed: 0,
    quarantined: 0,
    unsettled: 1,
    failed: 0,
  });
  assert.deepStrictEqual(
    fs.readdirSync(dest, { recursive: true }).map(String).sort(),
    snapshot,
    "second run must not touch the destination"
  );
});

test("dry run over a real tree plans without touching anything", async (t) => {
  if (!exiftoolAvailable) {
    t.skip("exiftool could not start (perl missing?)");
    return;
  }

  const dryDir = fs.mkdtempSync(path.join(tmpDir, "dry-"));
  const drySource = path.join(dryDir, "src");
  const dryDest = path.join(dryDir, "dst");
  fs.mkdirSync(drySource);
  fs.mkdirSync(dryDest);
  const file = path.join(drySource, "a.jpg");
  fs.writeFileSync(file, fs.readFileSync(path.join(FIXTURES, "exif.jpg")));
  fs.utimesSync(file, OLD, OLD);

  const logged = [];
  const counts = await run(
    { ...config(), sourceDir: drySource, destDir: dryDest, dryRun: true },
    { exiftool, log: (level, body) => logged.push(String(body)) }
  );

  assert.strictEqual(counts.moved, 1);
  assert.deepStrictEqual(fs.readdirSync(dryDest), [], "destination untouched in dry run");
  assert.ok(fs.existsSync(file), "source untouched in dry run");
  assert.ok(logged.some((l) => l.includes("DRY_RUN")), "planned action logged");
});
