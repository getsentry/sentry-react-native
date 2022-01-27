const replace = require("replace-in-file");
const util = require("util");
const rimraf = require("rimraf");

const patch = require("./patch");

const exec = util.promisify(require("child_process").exec);
const copyFile = util.promisify(require("fs").copyFile);
const mkdir = util.promisify(require("fs").mkdir);

const logStdOut = ({ stdout }) => console.log(stdout);

const main = async () => {
  const version = process.argv[2];

  console.log(`Starting with version ${version}.`);

  await exec(`react-native init app --version=react-native@${version}`).then(
    logStdOut
  );

  const appCwd = `${__dirname}/app`;

  await exec(`yalc add @sentry/react-native`, { cwd: appCwd }).then(logStdOut);
  await exec(`yarn add dotenv jasmine jest regenerator-runtime appium wd`, {
    cwd: appCwd,
  }).then(logStdOut);

  rimraf(`${appCwd}/.yalc`, () => {
    console.log("removed .yalc");
  });

  await patch(version);

  await exec("npx patch-package", {
    cwd: appCwd,
  }).then(logStdOut);

  console.log(`--Patching step done--`);

  await copyFile(`${__dirname}/Podfile`, `${__dirname}/app/ios/Podfile`);
  await exec("pod install", { cwd: `${__dirname}/app/ios` }).then(logStdOut);

  console.log(`--Pod install complete--`);

  await copyFile(`${__dirname}/App.js`, `${__dirname}/app/App.js`);

  await mkdir(`${__dirname}/app/tests`);
  await copyFile(
    `${__dirname}/e2e.test.js`,
    `${__dirname}/app/tests/e2e.test.js`
  );
  await copyFile(
    `${__dirname}/jest.config.js`,
    `${__dirname}/app/jest.config.js`
  );

  console.log(`--Prepare e2e app complete--`);

  // await patch(version);

  // await exec("npx patch-package", {
  //   cwd: appCwd,
  // }).then(logStdOut);

  // console.log(`--Patched second time for good measure--`);
};

main();
