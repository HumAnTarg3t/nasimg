const { ExifImage } = require("exif")
var fs = require('fs');
let files = fs.readdirSync('/home/niktsa/Pictures/', { recursive: true });
// console.log(files);
let jpgcounter = 0
let mp4counter = 0
let extensionArray= []


files.forEach(e => {
    //split the item name, i only need the extension
    let extension = e.split(".")
    //if array does not include the extension and is not a folder (checks if the item has a extension)
    if (!extensionArray.includes(extension[1]) && extension.length >1 ) {
        extensionArray.push(extension[1])
        console.log(extension);
    }







//     if (extension[1] == "jpg" || extension[1] == "jpeg") {
//         jpgcounter++;
//     }
//     if (extension[1] == "mp4") {
//         mp4counter++;
//     }
//     else{
//     console.log(extension);
// }
   
});
// let imagePath = '/home/niktsa/Pictures/20211023_123012.mp4'
console.log(jpgcounter);
console.log(mp4counter);
console.log(extensionArray);







// try {
//     new ExifImage({ image : imagePath }, function (error, exifData) {
//         if (error)
//             console.log('Error: '+error.message);
//         else
//             console.log(exifData); // Do something with your data!
//     });
// } catch (error) {
//     console.log('Error: ' + error.message);
// }