var fs = require("fs");
require("dotenv").config({ path: "../.env" });
const logger = require("../helpers/logger");
var path = require("path");
var scriptName = path.basename(__filename);
const isFile = require("./isFile");
const original_file_path = process.env.original_file_path;
const extension = ["jpg", "jpeg", "png", "mp4", "heic", "mov"];

/**
 * An array with objects. Stores filename and filepath.
 *
 * Allowed files: const extension = ["jpg", "jpeg", "png", "mp4"];
 *
 *
 * @type {Array{Object<string, string>}}
 *
 * [{path: '//qwe/zxc/', fileName: 'picture.jpg'}]
 */
let foundationArray = [];

/**
 * An array that stores the filenames of all type of files.
 *
 * @type {Array.string}
 */
let files = fs.readdirSync(original_file_path, { recursive: true });

files.forEach((e) => {
  //velg kun filer
  if (isFile(e)) {
    const eSPlit = e.split("/");
    //Hvis filen har mappenavn i fileName

    const fileName = eSPlit[eSPlit.length - 1];
    const extenionCheck = extension.includes(
      fileName.toLowerCase().split(".")[1]
    );
    if (eSPlit.length > 1 && extenionCheck) {
      eSPlit.pop();
      let folderName = 1;
      eSPlit.forEach((e) => {
        folderName += e + "/";
      });

      let obj = {
        path: `${original_file_path}/${folderName.substring(1)}`,
        fileName: `${fileName}`,
      };
      foundationArray.push(obj);
    } else {
      if (extension.includes(e.toLowerCase().split(".")[1])) {
        let obj = { path: `${original_file_path}/`, fileName: `${e}` };
        foundationArray.push(obj);
      }
    }
  }
});
logger(
  "info",
  `found ${files.length} items. Filenames of all type of files.`,
  scriptName
);
logger(
  "info",
  `found ${foundationArray.length} objects. Filename and filepath.`,
  scriptName
);
// console.log(foundationArray);
exports.files = files;
exports.foundationArray = foundationArray;
