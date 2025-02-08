require("dotenv").config();
const startCreateFolders = require("./functions/createFolders");
// const copyFiles = require("./functions/copyFiles");
const startCopyFiles = require("./functions/copyFiles");
const startMoveFiles = require("./functions/moveFiles");

async function start() {
  // await getFolderNamesToArray();
  await startCreateFolders();
  // await copyFiles();
  // await startCopyFiles()
  await startMoveFiles();
}
start();
