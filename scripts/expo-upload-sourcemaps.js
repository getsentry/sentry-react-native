#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const process = require('process');

const SENTRY_PROJECT = 'SENTRY_PROJECT';
// The sentry org is inferred from the auth token
const SENTRY_AUTH_TOKEN = 'SENTRY_AUTH_TOKEN';
const SENTRY_CLI_EXECUTABLE = 'SENTRY_CLI_EXECUTABLE';

function getEnvVar(varname) {
  return process.env[varname];
}

function getSentryPluginPropertiesFromExpoConfig() {
  try {
    const stdOutBuffer = execSync('npx expo config --json');
    const config = JSON.parse(stdOutBuffer.toString());
    const plugins = config.plugins;
    if (!plugins) {
      return null;
    }

    const sentryPlugin = plugins.find(plugin => {
      if (!Array.isArray(plugin) || plugin.length < 2) {
        return false;
      }
      const [pluginName] = plugin;
      return pluginName === '@sentry/react-native/expo';
    });

    if (!sentryPlugin) {
      return null;
    }
    const [, pluginConfig] = sentryPlugin;
    return pluginConfig;
  } catch (error) {
    console.error('Error fetching expo config:', error);
    return null;
  }
}

function readAndPrintJSONFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`The file "${filePath}" does not exist.`);
  }
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading or parsing JSON file:', err);
    throw err;
  }
}

function writeJSONFile(filePath, object) {
  // Convert the updated JavaScript object back to a JSON string
  const updatedJsonString = JSON.stringify(object, null, 2);
  fs.writeFileSync(filePath, updatedJsonString, 'utf8', writeErr => {
    if (writeErr) {
      console.error('Error writing to the file:', writeErr);
    } else {
      console.log('File updated successfully.');
    }
  });
}

function isAsset(filename) {
  return filename.endsWith('.map') || filename.endsWith('.js') || filename.endsWith('.hbc');
}

function getAssetPathsSync(directory) {
  const files = [];
  const items = fs.readdirSync(directory, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(directory, item.name);
    if (item.isDirectory()) {
      // eslint-disable-next-line no-unused-vars
      files.push(...getAssetPathsSync(fullPath));
    } else if (item.isFile() && isAsset(item.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function groupAssets(assetPaths) {
  const groups = {};
  for (const assetPath of assetPaths) {
    const parsedPath = path.parse(assetPath);
    const extname = parsedPath.ext;
    const assetGroupName = extname === '.map' ? path.join(parsedPath.dir, parsedPath.name) : path.format(parsedPath);
    if (!groups[assetGroupName]) {
      groups[assetGroupName] = [assetPath];
    } else {
      groups[assetGroupName].push(assetPath);
    }
  }
  return groups;
}

let sentryProject = getEnvVar(SENTRY_PROJECT);
let authToken = getEnvVar(SENTRY_AUTH_TOKEN);
const sentryCliBin = getEnvVar(SENTRY_CLI_EXECUTABLE) || require.resolve('@sentry/cli/bin/sentry-cli');

if (!sentryProject) {
  console.log(`🐕 Fetching ${SENTRY_PROJECT} from expo config...`);
  const pluginConfig = getSentryPluginPropertiesFromExpoConfig();
  if (!pluginConfig) {
    console.error("Could not fetch '@sentry/react-native' plugin properties from expo config.");
    process.exit(1);
  }
  if (!pluginConfig.project) {
    console.error(
      `Could not resolve sentry project, set it in the environment variable ${SENTRY_PROJECT} or in the '@sentry/react-native' plugin properties in your expo config.`,
    );
    process.exit(1);
  }
  sentryProject = pluginConfig.project;
  console.log(`${SENTRY_PROJECT} resolved to ${sentryProject} from expo config.`);
}

if (!authToken) {
  console.error(`${SENTRY_AUTH_TOKEN} environment variable must be set.`);
  process.exit(1);
}

const outputDir = process.argv[2];
if (!outputDir) {
  console.error('Provide the directory with your bundles and sourcemaps as the first argument.');
  console.error('Example: node node_modules/@sentry/react-native/scripts/expo-upload-sourcemaps dist');
  process.exit(1);
}

const files = getAssetPathsSync(outputDir);
const groupedAssets = groupAssets(files);

for (const [assetGroupName, assets] of Object.entries(groupedAssets)) {
  const sourceMapPath = assets.find(asset => asset.endsWith('.map'));
  if (sourceMapPath) {
    const sourceMap = readAndPrintJSONFile(sourceMapPath);
    if (sourceMap.debugId) {
      sourceMap.debug_id = sourceMap.debugId;
    }
    writeJSONFile(sourceMapPath, sourceMap);
  }
  console.log(`⬆️ Uploading ${assetGroupName} bundle and sourcemap...`);
  const isHermes = assets.find(asset => asset.endsWith('.hbc'));
  execSync(`${sentryCliBin} sourcemaps upload ${isHermes ? '--debug-id-reference' : ''} ${assets.join(' ')}`, {
    env: {
      ...process.env,
      [SENTRY_PROJECT]: sentryProject,
    },
    stdio: 'inherit',
  });
}

console.log('✅ Uploaded bundles and sourcemaps to Sentry successfully.');
