var fs = require("fs");
require("dotenv").config({ path: "../.env" });
const new_file_path = process.env.new_file_path;
const original_file_path = process.env.original_file_path;
const { foundationArray, files } = require("../functions/foundation");
let count = 0;

async function copyFiles() {
  files.forEach((e) => {
    const fileArrayWithName = e.split("/");
    // if the array has more then 1 indexes, chose the last
    const nameOffile =
      fileArrayWithName[fileArrayWithName.length - 1] || fileArrayWithName[0];
    // console.log(nameOffile);

    const stats = fs.statSync(`${original_file_path}/${e}`);
    let modifiedDate = stats.mtime;
    modifiedDate = modifiedDate.toISOString().split("T");
    let formatedDate = modifiedDate[0];
    try {
      fs.copyFile(
        `${original_file_path}/${e}`,
        `${new_file_path}/${formatedDate}/${nameOffile}`,
        (err) => {
          if (err) {
            console.log(err);
            console.log(`${original_file_path}/${e}`);
          }
        }
      );
      count++;
    } catch (error) {
      console.log(error);
    }
  });
  console.log(`Copied ${count} files`);
}

module.exports = copyFiles;
