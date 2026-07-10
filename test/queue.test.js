const { test } = require("node:test");
const assert = require("node:assert");

const { runQueue } = require("../lib/queue");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("processes every item exactly once and keeps result order", async () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  const results = await runQueue(items, async (n) => n * 2, 3);
  assert.deepStrictEqual(results, items.map((n) => n * 2));
});

test("never exceeds the concurrency limit", async () => {
  let active = 0;
  let peak = 0;
  await runQueue(
    Array.from({ length: 12 }, (_, i) => i),
    async () => {
      active++;
      peak = Math.max(peak, active);
      await sleep(5);
      active--;
    },
    3
  );
  assert.ok(peak <= 3, `peak concurrency was ${peak}`);
  assert.ok(peak >= 2, "work should actually run concurrently");
});

test("handles concurrency larger than the item count and empty input", async () => {
  assert.deepStrictEqual(await runQueue([1], async (n) => n, 10), [1]);
  assert.deepStrictEqual(await runQueue([], async (n) => n, 4), []);
});
