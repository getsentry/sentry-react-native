const replace = require("replace-in-file");
const util = require("util");

const patch = require("./patch");

const exec = util.promisify(require("child_process").exec);
const copyFile = util.promisify(require("fs").copyFile);
const rmdir = util.promisify(require("fs").rmdir);

const logStdOut = ({ stdout }) => console.log(stdout);

const main = async () => {
  const version = process.argv[2];

  await exec(`react-native init app --version ${version}`).then(logStdOut);

  await exec(`yarn add appium wd`).then(logStdOut);
  await exec(`yalc add @sentry/react-native`).then(logStdOut);

  await patch(version);

  await exec("npx patch-package", {
    cwd: `${__dirname}/app`,
  }).then(logStdOut);
  await copyFile(`${__dirname}/Podfile`, "./ios/Podfile");
  await exec("pod install", { cwd: `${__dirname}/app/ios` }).then(logStdOut);
  await copyFile(`${__dirname}/App.js`, "./App.js");
};

main();
