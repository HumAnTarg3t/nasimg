const crypto = require("crypto");
const fs = require("fs");

/**
 * Streaming SHA-256 of a file, as a lowercase hex string.
 *
 * Only ever called to confirm a *suspected* duplicate — a destination file
 * that already matches on both name and byte size — so the read is paid on a
 * collision, never on every file. Streamed rather than read whole: the
 * destination is a CIFS mount and these are photos and videos.
 *
 * @param {string} filePath
 * @param {{ createReadStream?: typeof fs.createReadStream }} [deps] injected for tests
 * @returns {Promise<string>}
 */
function hashFile(filePath, { createReadStream = fs.createReadStream } = {}) {
  return new Promise((resolve, reject) => {
    const digest = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => digest.update(chunk));
    stream.on("end", () => resolve(digest.digest("hex")));
  });
}

module.exports = { hashFile };
