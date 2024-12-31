const path = require("path");

function isFile(pathItem) {
  return !!path.extname(pathItem);
}

module.exports = isFile;
