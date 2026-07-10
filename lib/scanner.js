const fs = require("fs/promises");
const path = require("path");

const MEDIA_EXTENSIONS = new Set(["jpg", "jpeg", "png", "heic", "mp4", "mov"]);

// NAS/OS bookkeeping directories whose contents must never be sorted
const SYSTEM_DIRS = new Set(["@eadir", "#recycle", "#snapshot", "$recycle.bin", "system volume information"]);

// Hidden entries ("._IMG.jpg" AppleDouble sidecars, dot-dirs like
// .AppleDouble or .Trash-1000) and NAS system trees are bookkeeping, not media.
function isIgnored(srcDir, parentPath, name) {
  if (name.startsWith(".")) return true;
  const relative = path.relative(srcDir, parentPath);
  if (!relative) return false;
  return relative
    .split(path.sep)
    .some((segment) => segment.startsWith(".") || SYSTEM_DIRS.has(segment.toLowerCase()));
}

/**
 * Recursively finds media files under srcDir.
 *
 * Only real files pass the dirent.isFile() check — directories named like
 * media files (e.g. "trip.mov") and symlinks (including dangling ones, which
 * used to crash the run at stat time) are excluded, as are hidden files and
 * NAS system directories.
 *
 * @param {string} srcDir
 * @returns {Promise<Array<{sourcePath: string, fileName: string, ext: string}>>}
 */
async function scanFiles(srcDir) {
  const dirents = await fs.readdir(srcDir, { recursive: true, withFileTypes: true });
  const files = [];
  for (const dirent of dirents) {
    if (!dirent.isFile()) continue;
    const ext = path.extname(dirent.name).slice(1).toLowerCase();
    if (!MEDIA_EXTENSIONS.has(ext)) continue;
    // parentPath landed in Node 20.12; dirent.path is the pre-rename name
    const parentPath = dirent.parentPath ?? dirent.path;
    if (isIgnored(srcDir, parentPath, dirent.name)) continue;
    files.push({
      sourcePath: path.join(parentPath, dirent.name),
      fileName: dirent.name,
      ext,
    });
  }
  return files;
}

module.exports = { scanFiles, MEDIA_EXTENSIONS };
