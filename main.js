require("dotenv").config();
const startCreateFolders = require("./functions/createFolders");
const startMoveFiles = require("./functions/moveFiles");

async function start() {
  await startCreateFolders();
  await startMoveFiles();
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
