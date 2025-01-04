var fs = require("fs");
require("dotenv").config({ path: "../.env" });
const original_file_path = process.env.original_file_path;
const { foundationArray, files } = require("../functions/foundation");

/**
 * An array that stores the names of folders that will be created.
 *
 * @type {Array.string}
 */
let folderNameArray = [];

//get folder name into an arrary
async function getFolderNamesToArray() {
  files.forEach((e) => {
    try {
      // Get file stats synchronously
      const stats = fs.statSync(`${original_file_path}/${e}`);
      let modifiedDate = stats.mtime;
      modifiedDate = modifiedDate.toISOString().split("T");
      let formatedDate = modifiedDate[0];
      if (!folderNameArray.includes(formatedDate)) {
        folderNameArray.push(formatedDate);
      }
    } catch (error) {
      console.log(error);
    }
  });
  console.log(`${folderNameArray.length} unique folder names found`);
}

getFolderNamesToArray();

module.exports = folderNameArray;
