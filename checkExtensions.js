var fs = require('fs');
require('dotenv').config()
let files = fs.readdirSync(process.env.file_path, { recursive: true });
let extensionArray= []

/**
 * An object to store the count of files for each extension.
 * 
 * Keys are file extensions (e.g., 'txt', 'mp4'), and values are the counts of files with that extension.
 * 
 * @type {Object<string, number>}
 */
let extensionCounters = {}; // Object to store counters for each extension

function checkExtensions() {
    files.forEach(e => {
        // Split the item name to get the extension
        let extension = e.split(".");
        
        // Check if the extension is not already in the array and the item has an extension
        if (!extensionArray.includes(extension[1]) && extension.length > 1) {
            extensionArray.push(extension[1]);
            extensionCounters[extension[1]] = 0; // Initialize counter for the extension
        }
        
        // Increment the counter for the extension
        if (extensionCounters[extension[1]] !== undefined) {
            extensionCounters[extension[1]]++;
        }
    });
    
}
checkExtensions()

module.exports = extensionCounters;