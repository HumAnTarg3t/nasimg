const { test, describe } = require("node:test");
const assert = require("node:assert");

const { isSettled, planAction, withSuffix } = require("../lib/planner");

const MIN_AGE = 10 * 60 * 1000;
const NOW = 1_700_000_000_000;

function statsWithAge(ageMs) {
  return { mtimeMs: NOW - ageMs };
}

function destWith(files) {
  return async (name) => (name in files ? { size: files[name] } : null);
}

describe("isSettled", () => {
  test("fresh file is not settled", () => {
    assert.strictEqual(isSettled(statsWithAge(1000), NOW, MIN_AGE), false);
  });

  test("file exactly at the window boundary is settled", () => {
    assert.strictEqual(isSettled(statsWithAge(MIN_AGE), NOW, MIN_AGE), true);
  });

  test("old file is settled", () => {
    assert.strictEqual(isSettled(statsWithAge(MIN_AGE * 5), NOW, MIN_AGE), true);
  });

  test("future mtimes wait — a fast client clock must not defeat the settle window", () => {
    assert.strictEqual(isSettled(statsWithAge(-1000), NOW, MIN_AGE), false);
    // a phone clock 11 minutes fast during an active upload: NOT settled
    assert.strictEqual(isSettled(statsWithAge(-(MIN_AGE + 60 * 1000)), NOW, MIN_AGE), false);
    assert.strictEqual(isSettled(statsWithAge(-23 * 60 * 60 * 1000), NOW, MIN_AGE), false);
    // only a genuinely broken clock (>= 24h ahead) is treated as settled
    assert.strictEqual(isSettled(statsWithAge(-25 * 60 * 60 * 1000), NOW, MIN_AGE), true);
  });
});

describe("withSuffix", () => {
  test("inserts the suffix before the extension", () => {
    assert.strictEqual(withSuffix("IMG_0001.jpg", 1), "IMG_0001-1.jpg");
    assert.strictEqual(withSuffix("IMG_0001.jpg", 12), "IMG_0001-12.jpg");
  });

  test("handles multi-dot and extensionless names", () => {
    assert.strictEqual(withSuffix("trip.day1.mov", 1), "trip.day1-1.mov");
    assert.strictEqual(withSuffix("noext", 1), "noext-1");
  });
});

describe("planAction", () => {
  test("no collision moves under the original name", async () => {
    const plan = await planAction({ fileName: "a.jpg", sourceSize: 100, statDest: destWith({}) });
    assert.deepStrictEqual(plan, { action: "move", destFileName: "a.jpg", renamed: false });
  });

  test("same name and size quarantines (true duplicate)", async () => {
    const plan = await planAction({
      fileName: "a.jpg",
      sourceSize: 100,
      statDest: destWith({ "a.jpg": 100 }),
    });
    assert.deepStrictEqual(plan, { action: "quarantine" });
  });

  test("same name but different size moves under a -1 suffix", async () => {
    const plan = await planAction({
      fileName: "a.jpg",
      sourceSize: 100,
      statDest: destWith({ "a.jpg": 50 }),
    });
    assert.deepStrictEqual(plan, { action: "move", destFileName: "a-1.jpg", renamed: true });
  });

  test("walks the suffix chain until a free name", async () => {
    const plan = await planAction({
      fileName: "a.jpg",
      sourceSize: 100,
      statDest: destWith({ "a.jpg": 50, "a-1.jpg": 60, "a-2.jpg": 70 }),
    });
    assert.deepStrictEqual(plan, { action: "move", destFileName: "a-3.jpg", renamed: true });
  });

  test("a same-size file anywhere in the suffix chain quarantines", async () => {
    // an earlier run already archived this exact file as a-1.jpg
    const plan = await planAction({
      fileName: "a.jpg",
      sourceSize: 100,
      statDest: destWith({ "a.jpg": 50, "a-1.jpg": 100 }),
    });
    assert.deepStrictEqual(plan, { action: "quarantine" });
  });


  test("same name and size but different content moves under a -1 suffix", async () => {
    // Two unrelated photos can share a name and a byte count; quarantining the
    // second used to file a real photo under duplicates/ instead of its date.
    const plan = await planAction({
      fileName: "a.jpg",
      sourceSize: 100,
      statDest: destWith({ "a.jpg": 100 }),
      sameContent: async () => false,
    });
    assert.deepStrictEqual(plan, { action: "move", destFileName: "a-1.jpg", renamed: true });
  });

  test("same name, same size and same content still quarantines", async () => {
    const plan = await planAction({
      fileName: "a.jpg",
      sourceSize: 100,
      statDest: destWith({ "a.jpg": 100 }),
      sameContent: async () => true,
    });
    assert.deepStrictEqual(plan, { action: "quarantine" });
  });

  test("content is only compared once the sizes already match", async () => {
    const compared = [];
    await planAction({
      fileName: "a.jpg",
      sourceSize: 100,
      statDest: destWith({ "a.jpg": 50, "a-1.jpg": 100 }),
      sameContent: async (name) => {
        compared.push(name);
        return true;
      },
    });
    // a.jpg differs in size, so it is never hashed; only a-1.jpg is.
    assert.deepStrictEqual(compared, ["a-1.jpg"]);
  });

  test("an in-flight claim quarantines on size alone, with nothing to hash", async () => {
    let hashed = false;
    const plan = await planAction({
      fileName: "a.jpg",
      sourceSize: 100,
      statDest: async (name) => (name === "a.jpg" ? { size: 100, claimed: true } : null),
      sameContent: async () => {
        hashed = true;
        return false;
      },
    });
    assert.deepStrictEqual(plan, { action: "quarantine" });
    assert.equal(hashed, false, "a claimed target is not on disk yet, so it cannot be hashed");
  });

  test("defaults to the historical size-only behaviour when no comparator is given", async () => {
    const plan = await planAction({
      fileName: "a.jpg",
      sourceSize: 100,
      statDest: destWith({ "a.jpg": 100 }),
    });
    assert.deepStrictEqual(plan, { action: "quarantine" });
  });

  test("gives up after 999 suffixes instead of looping forever", async () => {
    await assert.rejects(
      planAction({ fileName: "a.jpg", sourceSize: 1, statDest: async () => ({ size: 2 }) }),
      /999/
    );
  });
});
