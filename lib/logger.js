const fs = require("fs");
const path = require("path");

const DEFAULT_LOG_DIR = path.join(__dirname, "..", "logs");

/**
 * "YYYY-MM-DD HH:MM:SS" in the machine's local timezone.
 */
function formatLocalTimestamp(date) {
  return date.toLocaleString("sv-SE");
}

/**
 * "YYYY-MM-DD" in the machine's local timezone.
 */
function localDateStamp(date) {
  return date.toLocaleDateString("sv-SE");
}

function serialize(body) {
  if (body instanceof Error) return body.stack || String(body);
  if (typeof body === "object" && body !== null) return JSON.stringify(body);
  return String(body);
}

// NAS filenames end up in log messages; control characters — including C1
// controls (U+0080-U+009F) and the Unicode line separators U+2028/U+2029
// that many log viewers honor — would let a crafted filename forge extra
// log lines.
function sanitize(text) {
  return text.replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029]+/g, " ");
}

/**
 * Creates a logger. Injectable log directory and console for tests.
 *
 * @param {{logDir?: string, consoleImpl?: Console}} [options]
 * @returns {(level: string, body: unknown, scriptName: string) => void}
 */
function createLogger({ logDir = DEFAULT_LOG_DIR, consoleImpl = console } = {}) {
  return function logger(level, body, scriptName) {
    const now = new Date();
    const line = `${formatLocalTimestamp(now)} ${level} ${scriptName}: ${sanitize(serialize(body))}`;

    if (level === "error") {
      consoleImpl.error(line);
    } else {
      consoleImpl.log(line);
    }

    try {
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(path.join(logDir, `${localDateStamp(now)}.log`), `${line}\n`);
    } catch (err) {
      consoleImpl.error(`logger: failed to write log file: ${err.message}`);
    }
  };
}

module.exports = createLogger();
module.exports.createLogger = createLogger;
module.exports.localDateStamp = localDateStamp;
