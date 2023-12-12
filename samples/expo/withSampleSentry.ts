import fs from 'fs';
import type { ConfigPlugin, XcodeProject } from 'expo/config-plugins';
import { withAppBuildGradle, withDangerousMod, withXcodeProject } from 'expo/config-plugins';

const SENTRY_GRADLE_LOCAL_OVERWRITE = `../../../../sentry.gradle`;

const withLocalSentry: ConfigPlugin = originalConfig => {
  let config = originalConfig;
  config = withAppBuildGradle(config, overwriteSentryGradlePath);
  config = withAppBuildGradle(config, addLocalSentryScriptsPaths);
  config = withXcodeProject(config, overwriteSentryXcodePath);
  config = withDangerousMod(config, ['ios', appendSentryScriptsPathsToXcodeEnvLocal]);
  return config;
};

const overwriteSentryXcodePath: Parameters<typeof withXcodeProject>[1] = config => {
  const xcodeProject: XcodeProject = config.modResults;

  const bundleReactNativePhase = xcodeProject.pbxItemByComment(
    'Bundle React Native code and images',
    'PBXShellScriptBuildPhase',
  );
  if (!bundleReactNativePhase) {
    throw new Error('Could not find `Bundle React Native code and images` build phase to patch xcode-sentry.sh!');
  }

  const includesSentry = bundleReactNativePhase.shellScript.includes('sentry-xcode.sh');

  let code = JSON.parse(bundleReactNativePhase.shellScript);
  if (includesSentry) {
    console.log('Overwriting sentry-xcode.sh path...');
    code = code.replace(
      `\`"$NODE_BINARY" --print "require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode.sh'"\``,
      '../../../scripts/sentry-xcode.sh',
    );
  } else {
    console.log('Adding sentry-xcode.sh path...');
    code = code.replace(
      /^.*?(packager|scripts)\/react-native-xcode\.sh\s*(\\'\\\\")?/m,
      (match: string) => `/bin/sh ../../../scripts/sentry-xcode.sh ${match}`,
    );
  }

  bundleReactNativePhase.shellScript = JSON.stringify(code);
  return config;
};

const appendSentryScriptsPathsToXcodeEnvLocal: Parameters<typeof withDangerousMod>[1][1] = config => {
  const xcodeEnvLocalPath = `${config.modRequest.projectRoot}/ios/.xcode.env.local`;
  const xcodeEnvLocalExists = fs.existsSync(xcodeEnvLocalPath);
  const xcodeEnvLocalContents = (xcodeEnvLocalExists && fs.readFileSync(xcodeEnvLocalPath, 'utf8')) || '';
  const newSentryScriptsPaths = `${xcodeEnvLocalContents}

export EXTRA_COMPILER_ARGS="-w"

export SENTRY_RN_PACKAGE_PATH="../../.."
export SENTRY_CLI_EXECUTABLE="../../../node_modules/@sentry/cli/bin/sentry-cli"
export SENTRY_CLI_EXTRA_ARGS="--force-foreground"
export SENTRY_CLI_DEBUG_FILES_UPLOAD_EXTRA_ARGS=""
export SENTRY_CLI_RN_XCODE_EXTRA_ARGS=""
export MODULES_PATHS="$PWD/../node_modules,$PWD/../../.."
export SENTRY_COLLECT_MODULES="../../scripts/collect-modules.sh"
`;

  console.log('Adding Sentry Scripts Paths to .xcode.env.local...');
  fs.writeFileSync(xcodeEnvLocalPath, newSentryScriptsPaths, 'utf8');
  return config;
};

const overwriteSentryGradlePath: Parameters<typeof withAppBuildGradle>[1] = config => {
  if (config.modResults.language !== 'groovy') {
    throw new Error("Can't overwrite sentry.gradle path because the `app/build.gradle` is not groovy!");
  }

  const appGradleContentsOriginal = config.modResults.contents;
  const includesSentry = appGradleContentsOriginal.includes('sentry.gradle');
  const includesOverwrittenSentry = appGradleContentsOriginal.includes(SENTRY_GRADLE_LOCAL_OVERWRITE);

  if (includesOverwrittenSentry) {
    console.log('sentry.gradle path is already overwritten!');
    return config;
  }

  const newSentryGradlePath = `apply from: "${SENTRY_GRADLE_LOCAL_OVERWRITE}";`;
  let newAppGradleContents = appGradleContentsOriginal;
  if (includesSentry) {
    console.log('Overwriting existing sentry.gradle path...');
    newAppGradleContents = appGradleContentsOriginal.replace(
      /^.*sentry.gradle.*$/gm,
      newSentryGradlePath,
    );
  } else {
    console.log('Adding sentry.gradle local overwrite path...');
    newAppGradleContents = appGradleContentsOriginal.replace(
      /^android {/m,
      match => `${newSentryGradlePath}\n\n${match}`);
  }

  if (newAppGradleContents === appGradleContentsOriginal) {
    throw new Error('Failed to overwrite sentry.gradle path!');
  }

  config.modResults.contents = newAppGradleContents;
  return config;
};

const addLocalSentryScriptsPaths: Parameters<typeof withAppBuildGradle>[1] = config => {
  if (config.modResults.language !== 'groovy') {
    throw new Error("Can't add local sentry scripts paths because the `app/build.gradle` is not groovy!");
  }

  const appGradleContentsOriginal = config.modResults.contents;
  const includesSentry = appGradleContentsOriginal.includes('sentry.gradle');
  const includesSentryOptions = appGradleContentsOriginal.includes('project.ext.sentryCli');

  if (includesSentryOptions) {
    throw new Error("Can't overwrite Sentry Options are already defined in app/build.gradle!");
  }

  const newSentryOptions = `project.ext.sentryCli = [
  collectModulesScript: "../../../../dist/js/tools/collectModules.js",
  modulesPaths: [
    "node_modules",
    "../../..",
  ],
  skipCollectModules: false,
  copyDebugIdScript: "../../../../scripts/copy-debugid.js",
  hasSourceMapDebugIdScript: "../../../../scripts/has-sourcemap-debugid.js",
]`;

  let newAppGradleContents = appGradleContentsOriginal;

  if (includesSentry) {
    console.log('Adding Sentry Options before sentry.gradle...');
    newAppGradleContents = appGradleContentsOriginal.replace(
      /^.*sentry.gradle.*$/gm,
      match => `${newSentryOptions}\n\n${match}`);
  } else {
    console.log('Adding Sentry Options before android {...');
    newAppGradleContents = appGradleContentsOriginal.replace(
      /^android {/m,
      match => `${newSentryOptions}\n\n${match}`);
  }

  if (newAppGradleContents === appGradleContentsOriginal) {
    throw new Error('Failed to add Sentry Options!');
  }

  config.modResults.contents = newAppGradleContents;
  return config;
}

export default withLocalSentry;
