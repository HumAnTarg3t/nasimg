var fs = require("fs/promises");
require("dotenv").config({ path: "../.env" });
const logger = require("../helpers/logger");
var path = require("path");
var scriptName = path.basename(__filename);
const new_file_path = process.env.new_file_path;
const { foundationArray } = require("./foundation");
let count = 0;

async function moveFiles() {
  for (const e of foundationArray) {
    const sourcePath = `${e.path}/${e.fileName}`;
    const stats = await fs.stat(sourcePath);
    let modifiedDate = stats.mtime;
    modifiedDate = modifiedDate.toISOString().split("T");
    let formatedDate = modifiedDate[0];

    try {
      // Ensure destination folder exists
      const destinationDir = `${new_file_path}/${formatedDate}`;
      await fs.mkdir(destinationDir, { recursive: true });

      const destinationPath = `${destinationDir}/${e.fileName}`;

      // Check if the file already exists
      try {
        await fs.access(destinationPath);
        logger("warn", `File already exists: ${destinationPath}`, scriptName);
        continue; // Skip to the next file
      } catch {
        // File doesn't exist; check if the move is across filesystems
        try {
          await fs.rename(sourcePath, destinationPath); // Try renaming
        } catch (renameError) {
          // If rename fails (likely cross-filesystem), fall back to copy and delete
          await fs.cp(sourcePath, destinationPath, {
            preserveTimestamps: true,
          });
          await fs.unlink(sourcePath); // Delete the original file
        }
        count++;
      }
    } catch (error) {
      logger("error", error, scriptName);
    }
  }
}

async function startMoveFiles() {
  await moveFiles();
  await logger("info", `Moved ${count} files`, scriptName);
}

module.exports = startMoveFiles;
