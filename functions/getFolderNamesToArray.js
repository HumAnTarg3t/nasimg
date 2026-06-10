var fs = require("fs");
require("dotenv").config({ path: "../.env" });
const logger = require("../helpers/logger");
var path = require("path");
var scriptName = path.basename(__filename);
const { foundationArray } = require("./foundation");

/**
 * An array that stores the names of folders that will be created.
 *
 * @type {Array.string}
 */
let folderNameArray = [];

async function getFolderNamesToArray() {
  foundationArray.forEach((e) => {
    try {
      const stats = fs.statSync(`${e.path}/${e.fileName}`);
      let modifiedDate = stats.mtime;
      modifiedDate = modifiedDate.toISOString().split("T");
      let formatedDate = modifiedDate[0];
      if (!folderNameArray.includes(formatedDate)) {
        folderNameArray.push(formatedDate);
      }
    } catch (error) {
      logger("error", error, scriptName);
    }
  });
  await logger(
    "info",
    `${folderNameArray.length} unique folder names found`,
    scriptName
  );
}

getFolderNamesToArray();

module.exports = folderNameArray;
