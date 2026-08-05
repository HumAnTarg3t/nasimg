const VIDEO_EXTENSIONS = new Set(["mp4", "mov"]);

function pad(n) {
  return String(n).padStart(2, "0");
}

/**
 * "YYYY-MM-DD" of a Date in the machine's local timezone — replaces the old
 * toISOString().split("T")[0], which used the UTC date and mis-filed
 * near-midnight media.
 */
function formatLocalDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * "YYYY-MM-DD" of an instant in a specific IANA timezone (en-CA formats as ISO).
 */
function dateInZone(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Corrupt cameras write dates like "0000:00:00 00:00:00" — an impossible
// date must fall through to the mtime fallback, not become a folder name.
function validDateParts(year, month, day) {
  return year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function firstDateMatch(value) {
  const m = String(value).match(/^(\d{4})[:-](\d{2})[:-](\d{2})/);
  if (!m) return null;
  return validDateParts(Number(m[1]), Number(m[2]), Number(m[3])) ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function wallClockFolder(tag) {
  if (typeof tag.year !== "number" || typeof tag.month !== "number" || typeof tag.day !== "number") {
    return null;
  }
  return validDateParts(tag.year, tag.month, tag.day)
    ? `${tag.year}-${pad(tag.month)}-${pad(tag.day)}`
    : null;
}

// EXIF DateTimeOriginal is the wall-clock time at the place of capture, with
// no offset in most files — take Y/M/D verbatim and never timezone-convert.
function imageFolder(tag) {
  if (!tag) return null;
  return wallClockFolder(tag) ?? firstDateMatch(tag);
}

// QuickTime dates are UTC per spec (exiftool-vendored marks them so), so the
// instant must be converted to the household timezone or a 23:30 video lands
// in tomorrow's folder. Exception: a tag whose zone was parsed from the file
// itself (iPhone Keys:CreationDate carries the capture-location offset)
// already shows the humanly-correct wall-clock date — use it verbatim, so a
// video shot abroad files next to the photos of the same moment.
function videoFolder(tag, timeZone) {
  if (!tag) return null;
  if (tag.zone && tag.inferredZone === false) {
    const wallClock = wallClockFolder(tag);
    if (wallClock) return wallClock;
  }
  if (typeof tag.toDate === "function") {
    const instant = tag.toDate();
    if (!Number.isNaN(instant.getTime())) return dateInZone(instant, timeZone);
    return null;
  }
  return firstDateMatch(tag);
}

/**
 * @param {object} deps
 * @param {{read(file: string): Promise<object>}} deps.exiftool
 * @param {string} deps.timeZone IANA zone used to date videos (QuickTime dates are UTC)
 * @param {(level: string, body: unknown, scriptName: string) => void} deps.logger
 * @returns {(file: {sourcePath: string, ext: string}, stats: {mtime: Date}) => Promise<{folder: string, source: "exif"|"video"|"mtime"}>}
 */
function createResolver({ exiftool, timeZone, logger, scriptName = "dateResolver.js" }) {
  return async function resolveDate(file, stats) {
    try {
      const tags = await exiftool.read(file.sourcePath);
      if (VIDEO_EXTENSIONS.has(file.ext)) {
        // CreationDate (Keys, iPhone) carries a real UTC offset; CreateDate is plain UTC
        const folder = videoFolder(tags.CreationDate ?? tags.CreateDate, timeZone);
        if (folder) return { folder, source: "video" };
      } else {
        const folder = imageFolder(tags.DateTimeOriginal ?? tags.CreateDate);
        if (folder) return { folder, source: "exif" };
      }
    } catch (err) {
      logger("warn", `metadata read failed for ${file.sourcePath}: ${err.message} — using mtime`, scriptName);
    }
    return { folder: formatLocalDate(stats.mtime), source: "mtime" };
  };
}

module.exports = { createResolver, formatLocalDate, dateInZone };
