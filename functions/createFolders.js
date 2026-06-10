var fs = require("fs");
require("dotenv").config({ path: "../.env" });
const new_file_path = process.env.new_file_path;
const folderNameArray = require("./getFolderNamesToArray");
const logger = require("../helpers/logger");
var path = require("path");
var scriptName = path.basename(__filename);
let createdfolderCount = 0;
let existingFoldersCount = 0;

async function createFolders() {
  folderNameArray.forEach((e) => {
    try {
      fs.mkdirSync(`${new_file_path}/${e}`);
      createdfolderCount++;
    } catch (error) {
      if (error.code === "EEXIST") {
        existingFoldersCount++;
      } else {
        logger("error", `Error creating folder ${e}:`, error, scriptName);
      }
    }
  });
}

async function startCreateFolders() {
  await createFolders();
  await logger("info", `${createdfolderCount} folders created.`, scriptName);
  await logger(
    "info",
    `${existingFoldersCount} folders exist already.`,
    scriptName
  );
}

module.exports = startCreateFolders;
