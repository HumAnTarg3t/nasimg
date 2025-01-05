var fs = require("fs");
const logpath = `./logs/`;
async function logger(code,body,runningScript) {
  const content = `${new Date().toISOString().slice(11, 19)} ${code} ${runningScript}: ${body}\r\n`;

  //check if folder exists
  try {  
    if (!fs.existsSync(logpath)) {
      fs.mkdirSync(logpath);
    }
    //create file/or append if exists
    fs.appendFile(
      `${logpath}${new Date().toISOString().slice(0, 10)}.log`,
      content,
      function (err) {
        if (err) throw err;
      }
    );
  } catch (err) {
    console.error(err);
  }
}

module.exports = logger;
