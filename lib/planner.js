const path = require("path");

// An uploader whose clock is merely minutes ahead writes "future" mtimes for
// the whole upload; only a clock broken by more than this is treated as
// settled rather than skipped forever.
const FAR_FUTURE_MS = 24 * 60 * 60 * 1000;

/**
 * A file is "settled" once its mtime is at least minAgeMs old — files newer
 * than that (including moderately-future mtimes from a fast client clock)
 * may still be mid-upload over SMB and must not be touched; the next run
 * picks them up.
 */
function isSettled(stats, now, minAgeMs) {
  const age = now - stats.mtimeMs;
  return age >= minAgeMs || age <= -FAR_FUTURE_MS;
}

function withSuffix(fileName, n) {
  const ext = path.extname(fileName);
  return `${fileName.slice(0, fileName.length - ext.length)}-${n}${ext}`;
}

/**
 * Decides where a source file should land, given what already exists at the
 * destination. Filesystem access is injected so the logic stays unit-testable.
 *
 * - no same-named file        → move under its own name
 * - same name and same size   → quarantine (true duplicate; never delete)
 * - same name, different size → move under IMG_0001-1.jpg, -2, … — this also
 *   unblocks files masked by a truncated copy from an interrupted earlier run
 *
 * @param {object} input
 * @param {string} input.fileName
 * @param {number} input.sourceSize
 * @param {(name: string) => Promise<{size: number} | null>} input.statDest
 *        size of the same-named destination file, or null if absent
 * @returns {Promise<{action: "move", destFileName: string, renamed: boolean} | {action: "quarantine"}>}
 */
async function planAction({ fileName, sourceSize, statDest }) {
  const existing = await statDest(fileName);
  if (!existing) return { action: "move", destFileName: fileName, renamed: false };
  if (existing.size === sourceSize) return { action: "quarantine" };

  for (let n = 1; n <= 999; n++) {
    const candidate = withSuffix(fileName, n);
    const stat = await statDest(candidate);
    if (!stat) return { action: "move", destFileName: candidate, renamed: true };
    if (stat.size === sourceSize) return { action: "quarantine" };
  }
  throw new Error(`no available destination name for ${fileName} after 999 suffixes`);
}

module.exports = { isSettled, planAction, withSuffix };
