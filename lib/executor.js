const path = require("path");
const defaultFs = require("fs/promises");

const { isSettled, planAction, withSuffix } = require("./planner");
const { runQueue } = require("./queue");

const QUARANTINE_DIR = "duplicates";
const TMP_SUFFIX = ".nasimg-tmp";

/**
 * @param {object} deps
 * @param {string} deps.destDir
 * @param {(file: object, stats: object) => Promise<{folder: string, source: string}>} deps.resolveDate
 * @param {(level: string, body: unknown, scriptName: string) => void} deps.logger
 * @param {number} deps.minAgeMs
 * @param {number} [deps.concurrency]
 * @param {boolean} [deps.dryRun]
 * @param {typeof defaultFs} [deps.fsImpl] injectable for tests (e.g. forcing EXDEV)
 * @param {() => number} [deps.now]
 */
function createExecutor({
  destDir,
  resolveDate,
  logger,
  minAgeMs,
  concurrency = 2,
  dryRun = false,
  fsImpl = defaultFs,
  now = () => Date.now(),
  scriptName = "executor.js",
}) {
  // Destination paths claimed by files already planned in this run — two
  // same-named files planned concurrently must not target the same path
  // (rename would silently overwrite the first one). Maps target -> size so
  // an identical file still planned in-flight is recognized as a duplicate.
  // Keys are case-folded: CIFS destinations are typically case-insensitive,
  // so IMG.jpg and img.jpg would collide on disk even though string keys
  // would not. On a case-sensitive destination this only costs a spare
  // -1 suffix in the rare same-name-different-case race.
  const claimed = new Map();
  const claimKey = (target) => target.toLowerCase();

  // Planning is a handful of stats; serializing it closes the
  // check-then-claim race between queue lanes while the actual copying
  // stays parallel.
  let planLock = Promise.resolve();
  function withPlanLock(fn) {
    const run = planLock.then(fn);
    planLock = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  // null means "verified absent". Anything but ENOENT (a transient CIFS
  // error, say) must NOT look like absence — planning a plain move against a
  // file that actually exists would overwrite it. Failing the file is safe:
  // it is retried next run.
  async function statOrNull(p) {
    try {
      return await fsImpl.stat(p);
    } catch (err) {
      if (err.code === "ENOENT" || err.code === "ENOTDIR") return null;
      throw err;
    }
  }

  async function statDestIn(dir, name) {
    const target = path.join(dir, name);
    if (claimed.has(claimKey(target))) return { size: claimed.get(claimKey(target)) };
    return statOrNull(target);
  }

  // Belt-and-braces before every placement rename: the destination was free
  // at plan time, but an external writer may have created it during a slow
  // copy — and rename() replaces silently.
  async function assertVacant(destPath) {
    if (await statOrNull(destPath)) {
      const err = new Error(`destination appeared during the move, not overwriting: ${destPath}`);
      err.code = "EEXIST";
      throw err;
    }
  }

  async function freeNameIn(dir, fileName) {
    if (!(await statDestIn(dir, fileName))) return fileName;
    for (let n = 1; n <= 999; n++) {
      const candidate = withSuffix(fileName, n);
      if (!(await statDestIn(dir, candidate))) return candidate;
    }
    throw new Error(`no available name for ${fileName} in ${dir} after 999 suffixes`);
  }

  /**
   * rename, or — the normal case between two CIFS mounts — copy to a temp
   * name, verify size against a fresh source stat, rename into place, and
   * only then unlink the source. A crash before the final rename leaves the
   * source intact (at worst plus a harmless *.nasimg-tmp leftover); a
   * failure of the final unlink leaves the file at its destination AND in
   * the source, where the next run quarantines it as a duplicate.
   */
  async function safeMove(sourcePath, destPath) {
    await assertVacant(destPath);
    try {
      await fsImpl.rename(sourcePath, destPath);
      return;
    } catch {
      // cross-device (EXDEV) or transient — fall through to copy-verify-unlink
    }
    const tmpPath = destPath + TMP_SUFFIX;
    try {
      await fsImpl.cp(sourcePath, tmpPath, { preserveTimestamps: true });
      const [srcStat, tmpStat] = await Promise.all([fsImpl.stat(sourcePath), fsImpl.stat(tmpPath)]);
      if (srcStat.size !== tmpStat.size) {
        throw new Error(
          `size mismatch after copying ${sourcePath} (source ${srcStat.size} B, copy ${tmpStat.size} B) — source kept`
        );
      }
      await assertVacant(destPath);
      await fsImpl.rename(tmpPath, destPath);
    } catch (err) {
      try {
        await fsImpl.rm(tmpPath, { force: true });
      } catch {
        // leftover *.nasimg-tmp is harmless and gets overwritten next run
      }
      throw err;
    }
    await fsImpl.unlink(sourcePath);
  }

  async function processFile(file) {
    let decision;
    try {
      const stats = await fsImpl.stat(file.sourcePath);

      if (!isSettled(stats, now(), minAgeMs)) {
        logger("info", `still settling, leaving for a later run: ${file.sourcePath}`, scriptName);
        return "unsettled";
      }

      const { folder, source } = await resolveDate(file, stats);
      const dateDir = path.join(destDir, folder);
      const quarantineDir = path.join(destDir, QUARANTINE_DIR, folder);

      decision = await withPlanLock(async () => {
        const plan = await planAction({
          fileName: file.fileName,
          sourceSize: stats.size,
          statDest: (name) => statDestIn(dateDir, name),
        });
        if (plan.action === "quarantine") {
          const target = path.join(quarantineDir, await freeNameIn(quarantineDir, file.fileName));
          claimed.set(claimKey(target), stats.size);
          return { outcome: "quarantined", targetDir: quarantineDir, target };
        }
        const target = path.join(dateDir, plan.destFileName);
        claimed.set(claimKey(target), stats.size);
        return { outcome: plan.renamed ? "renamed" : "moved", targetDir: dateDir, target };
      });

      const label =
        decision.outcome === "quarantined" ? "duplicate quarantined" : `moved (${source} date)`;
      if (dryRun) {
        logger("info", `DRY_RUN: would have ${label}: ${file.sourcePath} -> ${decision.target}`, scriptName);
        return decision.outcome;
      }

      await fsImpl.mkdir(decision.targetDir, { recursive: true });
      await safeMove(file.sourcePath, decision.target);
      logger("info", `${label}: ${file.sourcePath} -> ${decision.target}`, scriptName);
      return decision.outcome;
    } catch (err) {
      // release the claim so a later same-named sibling is not quarantined
      // against a file that never landed
      if (decision) claimed.delete(claimKey(decision.target));
      logger("error", err, scriptName);
      return "failed";
    }
  }

  /**
   * @param {Array<{sourcePath: string, fileName: string, ext: string}>} files
   * @returns {Promise<{moved: number, renamed: number, quarantined: number, unsettled: number, failed: number}>}
   */
  async function execute(files) {
    const counts = { moved: 0, renamed: 0, quarantined: 0, unsettled: 0, failed: 0 };
    await runQueue(
      files,
      async (file) => {
        counts[await processFile(file)]++;
      },
      concurrency
    );
    return counts;
  }

  return { execute };
}

module.exports = { createExecutor, QUARANTINE_DIR, TMP_SUFFIX };
