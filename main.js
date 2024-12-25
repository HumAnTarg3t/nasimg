var fs = require('fs');
require('dotenv').config()
const path = require('path');
const original_file_path = process.env.original_file_path
const new_file_path = process.env.new_file_path
let files = fs.readdirSync(original_file_path, { recursive: true });
let folderNameArray = []

function isFile(pathItem) {
    return !!path.extname(pathItem);
}


//get folder name into an arrary
async function getFolderNamesToArray() {
    files.forEach(e =>{
        try {
            // Get file stats synchronously
            const stats = fs.statSync(`${original_file_path}/${e}`);
            let modifiedDate = stats.mtime;
            modifiedDate = modifiedDate.toISOString().split('T')
            let formatedDate = modifiedDate[0]
            if (!folderNameArray.includes(formatedDate)) {
                folderNameArray.push(formatedDate)
            }
        } catch (error) {
            console.log(error);
            }
        })
        console.log(`${folderNameArray.length} folders will be created`);
        
}

async function createFolders() {
    //create folders
    folderNameArray.forEach(e =>{
        try {
            fs.mkdir(`${new_file_path}/${e}`,(e)=>{
                //If the folder does not exist
                if (e == null) {
                    // console.log('Mappe opprettet');
                }
            });             
        } 
        catch (error) {
            console.log(error);
        }
    })
    
}
// console.log(`${folderCreationCount} folder/s created`);
async function moveFiles() {
    files.forEach(e =>{
    try {
        //if its a file, move
        if (isFile(e)) {
            const fileArrayWithName = e.split('/') 
            // if the array has more then 1 indexes, chose the last
            const nameOffile = fileArrayWithName[fileArrayWithName.length -1] || fileArrayWithName[0]  
            // console.log(nameOffile);

            const stats = fs.statSync(`${original_file_path}/${e}`);
            let modifiedDate = stats.mtime;
            modifiedDate = modifiedDate.toISOString().split('T')
            let formatedDate = modifiedDate[0]



            // console.log(`${original_file_path}/${e}`);
            fs.rename(`${original_file_path}/${e}`,`${new_file_path}/${formatedDate}/${nameOffile}`, (err) => {
                if (err) throw err;
                // console.log(`Renamed ${original_file_path}/${e}: ${original_file_path}/${formatedDate}/${nameOffile}`);
              });
            
        }else{
                //not an image!!
            // console.log(e);
            
        }
    } catch (error) {
     console.log(error);
    }
    })
}    
    
    async function start() {
        await getFolderNamesToArray()
        await createFolders()
        await moveFiles()
    }
    start()