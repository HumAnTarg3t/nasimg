const isFile = require("./isFile");
const { foundationArray, files } = require("../functions/foundation");
let extensionArray = [];

/**
 * An object to store the count of files for each extension.
 *
 * Keys are file extensions (e.g., 'txt', 'mp4'), and values are the counts of files with that extension.
 *
 * @type {Object<string, number>}
 */
let extensionCounters = {}; // Object to store counters for each extension

function checkExtensions() {
  files.forEach((e) => {
    // Split the item name to get the extension
    let extension = e.split(".");
    let lastElemInArray = extension[extension.length - 1];

    if (isFile(e)) {
      // Check if the extension is not already in the array and the item has an extension
      if (!extensionArray.includes(lastElemInArray) && extension.length > 1) {
        extensionArray.push(lastElemInArray);
        extensionCounters[lastElemInArray] = 0; // Initialize counter for the extension
      }

      // Increment the counter for the extension
      if (extensionCounters[lastElemInArray] !== undefined) {
        extensionCounters[lastElemInArray]++;
      }
    }
  });
}
checkExtensions();

let entries = Object.entries(extensionCounters);
let sorted = entries.sort((a, b) => b[1] - a[1]);
//   console.log(sorted);

module.exports = sorted;
