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
 * - no same-named file                     → move under its own name
 * - same name, same size, same content      → quarantine (true duplicate; never delete)
 * - same name, same size, different content → move under IMG_0001-1.jpg, -2, …
 * - same name, different size               → likewise — this also unblocks files
 *   masked by a truncated copy from an interrupted earlier run
 *
 * Name and size alone used to mean "duplicate". Two unrelated photos sharing a
 * name and a byte count is uncommon but not rare — phone cameras reset their
 * counters, and JPEGs of the same scene cluster tightly in size — and the
 * consequence was a real photo filed under duplicates/ instead of its date.
 * The content check only runs once a collision is already suspected, so the
 * read costs nothing on the overwhelming majority of files.
 *
 * @param {object} input
 * @param {string} input.fileName
 * @param {number} input.sourceSize
 * @param {(name: string) => Promise<{size: number, claimed?: boolean} | null>} input.statDest
 *        size of the same-named destination file, or null if absent
 * @param {(name: string) => Promise<boolean>} [input.sameContent]
 *        true when the same-named destination file has identical bytes. Consulted
 *        only after the sizes match. Defaults to the historical size-only
 *        behaviour so callers that cannot hash keep working.
 * @returns {Promise<{action: "move", destFileName: string, renamed: boolean} | {action: "quarantine"}>}
 */
async function planAction({ fileName, sourceSize, statDest, sameContent = async () => true }) {
  // A claimed target is planned but not yet written in this run, so there is
  // nothing on disk to hash — size equality is all there is. Quarantining is
  // non-destructive either way, and the file stays in the source until moved.
  const isDuplicate = async (name, stat) => {
    if (stat.size !== sourceSize) return false;
    if (stat.claimed) return true;
    return sameContent(name);
  };

  const existing = await statDest(fileName);
  if (!existing) return { action: "move", destFileName: fileName, renamed: false };
  if (await isDuplicate(fileName, existing)) return { action: "quarantine" };

  for (let n = 1; n <= 999; n++) {
    const candidate = withSuffix(fileName, n);
    const stat = await statDest(candidate);
    if (!stat) return { action: "move", destFileName: candidate, renamed: true };
    if (await isDuplicate(candidate, stat)) return { action: "quarantine" };
  }
  throw new Error(`no available destination name for ${fileName} after 999 suffixes`);
}

module.exports = { isSettled, planAction, withSuffix };
