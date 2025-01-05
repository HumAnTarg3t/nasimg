var fs = require("fs");
require("dotenv").config({ path: "../.env" });
const logger = require("../helpers/logger");
var path = require("path");
var scriptName = path.basename(__filename);
const new_file_path = process.env.new_file_path;
const { foundationArray, files } = require("./foundation");
let count = 0;

async function copyFiles() {
  foundationArray.forEach((e) => {
    const stats = fs.statSync(`${e.path}/${e.fileName}`);
    let modifiedDate = stats.mtime;
    modifiedDate = modifiedDate.toISOString().split("T");
    let formatedDate = modifiedDate[0];
    try {
      fs.copyFile(
        `${e.path}/${e.fileName}`,
        `${new_file_path}/${formatedDate}/${e.fileName}`,
        (err) => {
          if (err) {
            // console.log(err);
            // console.log(`${e.filePath}/${e.fileName}`);
            logger("error", err, scriptName);
            logger("error", `${e.filePath}/${e.fileName}`, scriptName);
          }
        }
      );
      count++;
    } catch (error) {
      // console.log(error);
      logger("error", error, scriptName);
    }
  });
  // console.log(`Copied ${count} files`);
  await logger("info", `Copied ${count} files`, scriptName);
}

module.exports = copyFiles;
