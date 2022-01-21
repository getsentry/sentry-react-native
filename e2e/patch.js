const replace = require("replace-in-file");
const fs = require("fs");
const { execSync } = require("child_process");

const patches = {
  "0.56.1": [
    {
      patchPath: `react-native+0.56.1.patch`,
    },
    {
      type: "RNSentry.podspec",
    },
    {
      script: "node_modules/react-native/scripts/ios-install-third-party.sh",
    },
  ],
};

const patch = async (version) => {
  const versionPatches = patches[version];

  if (!version || !versionPatches) {
    return console.log(`Version ${version} not supported.`);
  }

  fs.mkdirSync(`${__dirname}/app/patches`);

  versionPatches.forEach((patch) => {
    if (patch.type && patch.type === "RNSentry.podspec") {
      reactCorePatch();
    } else if (patch.patchPath) {
      fs.copyFileSync(
        `${__dirname}/patches/${patch.patchPath}`,
        `${__dirname}/app/patches/${patch.patchPath}`
      );
    } else if (patch.script) {
      execSync(patch.script, { cwd: `${__dirname}/app` });
    }
  });
};

const reactCorePatch = () => {
  const podspecPath = `${__dirname}/app/node_modules/@sentry/react-native/RNSentry.podspec`;

  replace({
    files: [podspecPath],
    from: /React-Core/g,
    to: "React/Core",
  })
    .then((changedFiles) => {
      console.log("Modified files:", JSON.stringify(changedFiles));
    })
    .catch((error) => {
      console.error("Error occurred:", error);
    });
};

module.exports = patch;
