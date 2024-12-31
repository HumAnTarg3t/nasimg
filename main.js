require("dotenv").config();
const startCreateFolders = require("./functions/createFolders");
const copyFiles = require("./functions/copyFiles");
const moveFiles = require("./functions/moveFiles");

async function start() {
  // await getFolderNamesToArray();
  await startCreateFolders();
  // await copyFiles();
  await moveFiles();
}
start();
