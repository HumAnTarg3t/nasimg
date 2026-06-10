var fs = require("fs");
const logpath = `./logs/`;

async function logger(code, body, runningScript) {
  const content = `${new Date().toISOString().slice(11, 19)} ${code} ${runningScript}: ${body}\r\n`;
  console.log(content);

  try {
    if (!fs.existsSync(logpath)) {
      fs.mkdirSync(logpath);
    }
    fs.appendFileSync(
      `${logpath}${new Date().toISOString().slice(0, 10)}.log`,
      content
    );
  } catch (err) {
    console.error(err);
  }
}

module.exports = logger;
