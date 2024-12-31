var fs = require("fs");
require("dotenv").config({ path: "../.env" });
const original_file_path = process.env.original_file_path;

/**
 * An array that stores the filenames.
 *
 * @type {Array.string}
 */
let files = fs.readdirSync(original_file_path, { recursive: true });

// console.log(typeof(files));
// console.log(files);

module.exports = files;
