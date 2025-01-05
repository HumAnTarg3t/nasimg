var fs = require("fs");
require("dotenv").config({ path: "../.env" });
const new_file_path = process.env.new_file_path;
const logger = require("../helpers/logger");
var path = require("path");
var scriptName = path.basename(__filename);
const { foundationArray, files } = require("../functions/foundation");
const isFile = require("./isFile");
let count = 0;

async function moveFiles() {
  foundationArray.forEach((e) => {
    try {
      //if its a file, move
      if (isFile(`${e.path}/${e.fileName}`)) {
        const stats = fs.statSync(`${e.path}/${e.fileName}`);
        let modifiedDate = stats.mtime;
        modifiedDate = modifiedDate.toISOString().split("T");
        let formatedDate = modifiedDate[0];

        // console.log(`${original_file_path}/${e}`);
        fs.rename(
          `${e.path}/${e.fileName}`,
          `${new_file_path}/${formatedDate}/${e.fileName}`,
          (err) => {
            if (err) {
              logger("error", err, scriptName);
            }
            // console.log(`Renamed ${original_file_path}/${e}: ${original_file_path}/${formatedDate}/${nameOffile}`);
          }
        );
        count++;
      } else {
        //not an image!!
        // console.log(e);
      }
    } catch (error) {
      // console.log(error);
      logger("error", error, scriptName);
    }
  });
  // console.log(`Moved ${count} files`);
  logger("info", `Moved ${count} files`, scriptName);
}

module.exports = moveFiles;
