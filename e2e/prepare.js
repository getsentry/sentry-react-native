const replace = require("replace-in-file");
const util = require("util");

const exec = util.promisify(require("child_process").exec);
const copyFile = util.promisify(require("fs").copyFile);

const logStdOut = ({ stdout }) => console.log(stdout);

const main = async () => {
  await exec("npx patch-package", {
    cwd: `${__dirname}/app`,
  }).then(logStdOut);
  await copyFile(`${__dirname}/Podfile`, "./ios/Podfile");
  await exec("pod install", { cwd: `${__dirname}/app/ios` }).then(logStdOut);
  await copyFile(`${__dirname}/App.js`, "./App.js");
};

main();
