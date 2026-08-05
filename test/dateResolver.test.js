const { test, describe } = require("node:test");
const assert = require("node:assert");
const path = require("path");

const { createResolver, formatLocalDate } = require("../lib/dateResolver");

const noopLogger = () => {};
const warnings = [];
const captureLogger = (level, body) => warnings.push(`${level}: ${body}`);

function stubExiftool(tags) {
  return { read: async () => tags };
}

const MTIME = new Date(2026, 0, 20, 12, 0, 0); // local noon, unambiguous
const stats = { mtime: MTIME };

describe("images", () => {
  test("takes EXIF wall-clock date verbatim, never timezone-shifted", async () => {
    const resolve = createResolver({
      // 00:30 local wall-clock — a UTC conversion in any western zone would shift the day
      exiftool: stubExiftool({ DateTimeOriginal: { year: 2023, month: 4, day: 5, hour: 0, minute: 30 } }),
      timeZone: "America/Los_Angeles",
      logger: noopLogger,
    });
    const result = await resolve({ sourcePath: "a.jpg", ext: "jpg" }, stats);
    assert.deepStrictEqual(result, { folder: "2023-04-05", source: "exif" });
  });

  test("falls back to CreateDate when DateTimeOriginal is missing", async () => {
    const resolve = createResolver({
      exiftool: stubExiftool({ CreateDate: { year: 2022, month: 12, day: 31 } }),
      timeZone: "Europe/Oslo",
      logger: noopLogger,
    });
    const result = await resolve({ sourcePath: "a.png", ext: "png" }, stats);
    assert.deepStrictEqual(result, { folder: "2022-12-31", source: "exif" });
  });

  test("parses string-typed date tags", async () => {
    const resolve = createResolver({
      exiftool: stubExiftool({ DateTimeOriginal: "2021:06:07 08:09:10" }),
      timeZone: "Europe/Oslo",
      logger: noopLogger,
    });
    const result = await resolve({ sourcePath: "a.jpg", ext: "jpg" }, stats);
    assert.deepStrictEqual(result, { folder: "2021-06-07", source: "exif" });
  });
});

describe("videos", () => {
  test("converts UTC QuickTime date to the household timezone (near-midnight case)", async () => {
    const resolve = createResolver({
      // 22:30 UTC on June 1 is 00:30 on June 2 in Europe/Oslo (UTC+2 in summer)
      exiftool: stubExiftool({ CreateDate: { toDate: () => new Date("2024-06-01T22:30:00Z") } }),
      timeZone: "Europe/Oslo",
      logger: noopLogger,
    });
    const result = await resolve({ sourcePath: "v.mp4", ext: "mp4" }, stats);
    assert.deepStrictEqual(result, { folder: "2024-06-02", source: "video" });
  });

  test("prefers Keys CreationDate over CreateDate", async () => {
    const resolve = createResolver({
      exiftool: stubExiftool({
        CreationDate: { toDate: () => new Date("2024-01-01T12:00:00Z") },
        CreateDate: { toDate: () => new Date("2020-01-01T12:00:00Z") },
      }),
      timeZone: "Europe/Oslo",
      logger: noopLogger,
    });
    const result = await resolve({ sourcePath: "v.mov", ext: "mov" }, stats);
    assert.deepStrictEqual(result, { folder: "2024-01-01", source: "video" });
  });

  test("an invalid video date falls back to mtime", async () => {
    const resolve = createResolver({
      exiftool: stubExiftool({ CreateDate: { toDate: () => new Date(NaN) } }),
      timeZone: "Europe/Oslo",
      logger: noopLogger,
    });
    const result = await resolve({ sourcePath: "v.mp4", ext: "mp4" }, stats);
    assert.deepStrictEqual(result, { folder: formatLocalDate(MTIME), source: "mtime" });
  });
});

describe("garbage metadata", () => {
  test("zeroed and impossible date strings fall back to mtime instead of creating junk folders", async () => {
    for (const bad of ["0000:00:00 00:00:00", "2023:13:45 10:00:00", "2023:00:12 10:00:00"]) {
      const resolve = createResolver({
        exiftool: stubExiftool({ DateTimeOriginal: bad }),
        timeZone: "Europe/Oslo",
        logger: noopLogger,
      });
      const result = await resolve({ sourcePath: "a.jpg", ext: "jpg" }, stats);
      assert.deepStrictEqual(result, { folder: formatLocalDate(MTIME), source: "mtime" }, `for "${bad}"`);
    }
  });

  test("a video CreationDate with a real capture-location zone keeps its wall-clock date", async () => {
    // filmed 21:00 in New York == 02:00 next day UTC; must file under the
    // New York date, not the TZ_HOME-converted one
    const resolve = createResolver({
      exiftool: stubExiftool({
        CreationDate: {
          year: 2024, month: 3, day: 10,
          zone: "UTC-4", inferredZone: false,
          toDate: () => new Date("2024-03-11T02:00:00Z"),
        },
      }),
      timeZone: "Europe/Oslo",
      logger: noopLogger,
    });
    const result = await resolve({ sourcePath: "v.mov", ext: "mov" }, stats);
    assert.deepStrictEqual(result, { folder: "2024-03-10", source: "video" });
  });
});

describe("fallbacks", () => {
  test("no usable tags falls back to LOCAL mtime date", async () => {
    const resolve = createResolver({
      exiftool: stubExiftool({}),
      timeZone: "Europe/Oslo",
      logger: noopLogger,
    });
    const result = await resolve({ sourcePath: "a.jpg", ext: "jpg" }, stats);
    assert.deepStrictEqual(result, { folder: "2026-01-20", source: "mtime" });
  });

  test("a metadata read error logs a warning and falls back to mtime", async () => {
    warnings.length = 0;
    const resolve = createResolver({
      exiftool: { read: async () => { throw new Error("corrupt file"); } },
      timeZone: "Europe/Oslo",
      logger: captureLogger,
    });
    const result = await resolve({ sourcePath: "bad.jpg", ext: "jpg" }, stats);
    assert.deepStrictEqual(result, { folder: formatLocalDate(MTIME), source: "mtime" });
    assert.strictEqual(warnings.length, 1);
    assert.match(warnings[0], /warn: metadata read failed/);
  });
});

describe("integration with real exiftool and committed fixtures", () => {
  test("reads real capture dates from fixture files", async (t) => {
    let exiftool;
    try {
      ({ exiftool } = require("exiftool-vendored"));
      await exiftool.version();
    } catch {
      t.skip("exiftool could not start (perl missing?)");
      return;
    }
    try {
      const resolve = createResolver({ exiftool, timeZone: "Europe/Oslo", logger: noopLogger });

      const jpg = await resolve(
        { sourcePath: path.join(__dirname, "fixtures", "exif.jpg"), ext: "jpg" },
        stats
      );
      assert.deepStrictEqual(jpg, { folder: "2023-04-05", source: "exif" });

      // fixture mvhd creation_time is 2024-06-01T22:30:00Z == 2024-06-02 in Oslo
      const mp4 = await resolve(
        { sourcePath: path.join(__dirname, "fixtures", "video.mp4"), ext: "mp4" },
        stats
      );
      assert.deepStrictEqual(mp4, { folder: "2024-06-02", source: "video" });
    } finally {
      await exiftool.end();
    }
  });
});
