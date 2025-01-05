var fs = require("fs");
require("dotenv").config({ path: "../.env" });
// const original_file_path = process.env.original_file_path;
const logger = require("../helpers/logger");
var path = require("path");
var scriptName = path.basename(__filename);
const { foundationArray, files } = require("./foundation");

/**
 * An array that stores the names of folders that will be created.
 *
 * @type {Array.string}
 */
let folderNameArray = [];

//get folder name into an arrary
async function getFolderNamesToArray() {
  foundationArray.forEach((e) => {
    try {
      // Get file stats synchronously
      const stats = fs.statSync(`${e.path}/${e.fileName}`);
      let modifiedDate = stats.mtime;
      modifiedDate = modifiedDate.toISOString().split("T");
      let formatedDate = modifiedDate[0];
      if (!folderNameArray.includes(formatedDate)) {
        folderNameArray.push(formatedDate);
      }
    } catch (error) {
      // console.log(error);
      logger("error", error, scriptName);
    }
  });
  // console.log(`${folderNameArray.length} unique folder names found`);
  await logger(
    "info",
    `${folderNameArray.length} unique folder names found`,
    scriptName
  );
}

getFolderNamesToArray();
// console.log(folderNameArray);

module.exports = folderNameArray;
