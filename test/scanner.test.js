const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { scanFiles } = require("../lib/scanner");

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nasimg-scanner-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test("finds media files at any depth with correctly joined paths", async () => {
  fs.writeFileSync(path.join(root, "a.jpg"), "x");
  fs.mkdirSync(path.join(root, "sub", "deep"), { recursive: true });
  fs.writeFileSync(path.join(root, "sub", "b.mp4"), "x");
  fs.writeFileSync(path.join(root, "sub", "deep", "c.heic"), "x");

  const files = await scanFiles(root);
  const paths = files.map((f) => f.sourcePath).sort();

  assert.deepStrictEqual(paths, [
    path.join(root, "a.jpg"),
    path.join(root, "sub", "b.mp4"),
    path.join(root, "sub", "deep", "c.heic"),
  ].sort());
  for (const f of files) {
    assert.ok(fs.existsSync(f.sourcePath), `built path must exist: ${f.sourcePath}`);
  }
});

test("matches extensions case-insensitively and reports them lowercased", async () => {
  fs.writeFileSync(path.join(root, "IMG.JPG"), "x");
  fs.writeFileSync(path.join(root, "clip.MoV"), "x");

  const files = await scanFiles(root);
  assert.deepStrictEqual(files.map((f) => f.ext).sort(), ["jpg", "mov"]);
});

test("ignores non-media and extensionless files", async () => {
  fs.writeFileSync(path.join(root, "notes.txt"), "x");
  fs.writeFileSync(path.join(root, "README"), "x");
  fs.writeFileSync(path.join(root, "archive.tar.gz"), "x");

  assert.deepStrictEqual(await scanFiles(root), []);
});

test("excludes a directory named like a media file but scans inside it", async () => {
  fs.mkdirSync(path.join(root, "trip.mov"));
  fs.writeFileSync(path.join(root, "trip.mov", "real.jpg"), "x");

  const files = await scanFiles(root);
  assert.strictEqual(files.length, 1);
  assert.strictEqual(files[0].sourcePath, path.join(root, "trip.mov", "real.jpg"));
});

test("excludes symlinks, including dangling ones", { skip: process.platform === "win32" }, async () => {
  fs.writeFileSync(path.join(root, "real.jpg"), "x");
  fs.symlinkSync(path.join(root, "real.jpg"), path.join(root, "link.jpg"));
  fs.symlinkSync(path.join(root, "gone.jpg"), path.join(root, "dangling.jpg"));

  const files = await scanFiles(root);
  assert.deepStrictEqual(files.map((f) => f.fileName), ["real.jpg"]);
});

test("returns an empty list for an empty directory", async () => {
  assert.deepStrictEqual(await scanFiles(root), []);
});

test("skips AppleDouble sidecars, hidden files and NAS system directories", async () => {
  fs.writeFileSync(path.join(root, "real.jpg"), "x");
  fs.writeFileSync(path.join(root, "._real.jpg"), "x"); // macOS resource fork
  fs.writeFileSync(path.join(root, ".hidden.jpg"), "x");
  fs.mkdirSync(path.join(root, "@eaDir", "real.jpg"), { recursive: true }); // Synology thumbs
  fs.writeFileSync(path.join(root, "@eaDir", "real.jpg", "SYNOPHOTO_THUMB_M.jpg"), "x");
  fs.mkdirSync(path.join(root, "#recycle"));
  fs.writeFileSync(path.join(root, "#recycle", "deleted.jpg"), "x");
  fs.mkdirSync(path.join(root, ".Trash-1000", "files"), { recursive: true });
  fs.writeFileSync(path.join(root, ".Trash-1000", "files", "gone.mp4"), "x");

  const files = await scanFiles(root);
  assert.deepStrictEqual(files.map((f) => f.fileName), ["real.jpg"]);
});

test("a dot in the source directory's own path does not trigger the hidden filter", async () => {
  const dotted = path.join(root, "photos.backup");
  fs.mkdirSync(path.join(dotted, "sub"), { recursive: true });
  fs.writeFileSync(path.join(dotted, "sub", "a.jpg"), "x");

  const files = await scanFiles(dotted);
  assert.deepStrictEqual(files.map((f) => f.fileName), ["a.jpg"]);
});
