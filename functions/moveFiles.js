var fs = require("fs");
require("dotenv").config({ path: "../.env" });
const new_file_path = process.env.new_file_path;
const original_file_path = process.env.original_file_path;
let files = require("../functions/foundation");
const isFile = require("./isFile");
let count = 0;

async function moveFiles() {
  files.forEach((e) => {
    try {
      //if its a file, move
      if (isFile(e)) {
        const fileArrayWithName = e.split("/");
        // if the array has more then 1 indexes, chose the last
        const nameOffile =
          fileArrayWithName[fileArrayWithName.length - 1] ||
          fileArrayWithName[0];
        // console.log(nameOffile);

        const stats = fs.statSync(`${original_file_path}/${e}`);
        let modifiedDate = stats.mtime;
        modifiedDate = modifiedDate.toISOString().split("T");
        let formatedDate = modifiedDate[0];

        // console.log(`${original_file_path}/${e}`);
        fs.rename(
          `${original_file_path}/${e}`,
          `${new_file_path}/${formatedDate}/${nameOffile}`,
          (err) => {
            if (err) throw err;
            // console.log(`Renamed ${original_file_path}/${e}: ${original_file_path}/${formatedDate}/${nameOffile}`);
          }
        );
        count++;
      } else {
        //not an image!!
        // console.log(e);
      }
    } catch (error) {
      console.log(error);
    }
  });
  console.log(`Moved ${count} files`);
}

module.exports = moveFiles;
