const path = require("path");

const logger = require("./lib/logger");
const { loadConfig, ConfigError } = require("./lib/config");
const { scanFiles } = require("./lib/scanner");
const { createResolver } = require("./lib/dateResolver");
const { createExecutor } = require("./lib/executor");

const scriptName = path.basename(__filename);

/**
 * One full pass: scan the source, date every file (EXIF/QuickTime, mtime
 * fallback), move each into its YYYY-MM-DD folder. Exported so the
 * integration test can drive it with its own config and exiftool.
 */
async function run(config, { exiftool, log = logger }) {
  const files = await scanFiles(config.sourceDir);
  log(
    "info",
    `found ${files.length} media files in ${config.sourceDir}${config.dryRun ? " (DRY_RUN)" : ""}`,
    scriptName
  );

  const executor = createExecutor({
    destDir: config.destDir,
    resolveDate: createResolver({ exiftool, timeZone: config.timeZone, logger: log }),
    logger: log,
    minAgeMs: config.minAgeMs,
    concurrency: config.concurrency,
    dryRun: config.dryRun,
  });

  const counts = await executor.execute(files);
  log(
    "info",
    `done: moved ${counts.moved}, renamed ${counts.renamed}, quarantined ${counts.quarantined}, ` +
      `unsettled ${counts.unsettled}, failed ${counts.failed}`,
    scriptName
  );
  return counts;
}

async function main() {
  // dotenv resolves relative paths against cwd; anchor to this file so the
  // systemd unit works regardless of WorkingDirectory
  require("dotenv").config({ path: path.join(__dirname, ".env") });

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      logger("error", `invalid configuration: ${err.message}`, scriptName);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const { exiftool } = require("exiftool-vendored");
  try {
    const counts = await run(config, { exiftool });
    // a run with failures must show as failed in systemd, not green forever
    if (counts.failed > 0) process.exitCode = 1;
  } finally {
    // without this the exiftool child process keeps the oneshot alive forever
    await exiftool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    logger("error", err, scriptName);
    process.exitCode = 1;
  });
}

module.exports = { run };
