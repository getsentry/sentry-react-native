const replace = require("replace-in-file");
const fs = require("fs");

const patches = {
  "0.56.1": [
    {
      path: `react-native+0.56.1.patch`,
    },
    {
      type: "RNSentry.podspec",
    },
  ],
};

const main = () => {
  const version = process.argv[2];

  patch(version);
};

const patch = (version) => {
  const versionPatches = patches[version];

  if (!version || !versionPatches) {
    return console.log(`Version ${version} not supported.`);
  }

  fs.mkdirSync("./patches");

  versionPatches.forEach((patch) => {
    if (patch.type && patch.type === "RNSentry.podspec") {
      reactCorePatch();
    } else if (patch.path) {
      fs.copyFileSync(
        `${__dirname}/patches/${patch.path}`,
        `./patches/${patch.path}`
      );
    }
  });
};

const reactCorePatch = () => {
  const podspecPath = `./node_modules/@sentry/react-native/RNSentry.podspec`;

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

main();
