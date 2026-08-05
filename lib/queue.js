/**
 * Runs worker(item, index) over all items with at most `concurrency` workers
 * active at once. Results are returned in item order. Worker rejections
 * propagate — callers that must survive per-item failures catch inside the
 * worker.
 *
 * @template T, R
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} worker
 * @param {number} concurrency
 * @returns {Promise<R[]>}
 */
async function runQueue(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;

  async function lane() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }

  const laneCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: laneCount }, lane));
  return results;
}

module.exports = { runQueue };
