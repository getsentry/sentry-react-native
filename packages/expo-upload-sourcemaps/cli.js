#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const process = require('process');

const SENTRY_URL = 'SENTRY_URL';
const SENTRY_ORG = 'SENTRY_ORG';
const SENTRY_PROJECT = 'SENTRY_PROJECT';
const SENTRY_AUTH_TOKEN = 'SENTRY_AUTH_TOKEN';
const SENTRY_CLI_EXECUTABLE = 'SENTRY_CLI_EXECUTABLE';

function getEnvVar(varname) {
  return process.env[varname];
}

function getSentryPluginPropertiesFromExpoConfig() {
  try {
    const result = spawnSync('npx', ['expo', 'config', '--json'], { encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      throw result.error || new Error(`expo config exited with status ${result.status}`);
    }
    const config = JSON.parse(result.stdout);
    const plugins = config.plugins || [];
    const sentryPlugin = plugins.find(plugin => {
      if (!Array.isArray(plugin) || plugin.length < 2) {
        return false;
      }
      const [pluginName] = plugin;
      return pluginName === '@sentry/react-native/expo';
    });

    if (sentryPlugin) {
      const [, pluginConfig] = sentryPlugin;
      return pluginConfig;
    }

    // When withSentry is used programmatically in app.config.ts, the plugin
    // doesn't appear in the plugins array. Check config._internal where the
    // plugin stashes build-time properties as a fallback.
    if (config._internal?.sentryBuildProperties) {
      return config._internal.sentryBuildProperties;
    }

    return null;
  } catch (error) {
    console.error('Error fetching expo config:', error);
    return null;
  }
}

function getSentryPropertiesFromFile() {
  const candidates = [
    path.join(projectRoot, 'android', 'sentry.properties'),
    path.join(projectRoot, 'ios', 'sentry.properties'),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    try {
      const content = fs.readFileSync(candidate, 'utf8');
      const props = {};
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) {
          continue;
        }
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();
        if (key === 'defaults.org') {
          props.organization = value;
        } else if (key === 'defaults.project') {
          props.project = value;
        } else if (key === 'defaults.url') {
          props.url = value;
        }
      }
      if (props.organization || props.project) {
        console.log(`Found sentry properties in ${candidate}`);
        return props;
      }
    } catch (_e) {
      // continue to next candidate
    }
  }
  return null;
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
  const updatedJsonString = JSON.stringify(object, null, 2);
  fs.writeFileSync(filePath, updatedJsonString, 'utf8');
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

function loadDotenv(dotenvPath) {
  try {
    const dotenvFile = fs.readFileSync(dotenvPath, 'utf-8');
    // NOTE: Do not use the dotenv.config API directly to read the dotenv file! For some ungodly reason, it falls back to reading `${process.cwd()}/.env` which is absolutely not what we want.
    // dotenv is dependency of @expo/env, so we can just require it here
    const dotenvResult = require('dotenv').parse(dotenvFile);

    Object.assign(process.env, dotenvResult);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // noop if file does not exist
    } else {
      console.warn('⚠️ Failed to load environment variables using dotenv.');
      console.warn(error);
    }
  }
}

process.env.NODE_ENV = process.env.NODE_ENV || 'development'; // Ensures precedence .env.development > .env (the same as @expo/cli)
const projectRoot = '.'; // Assume script is run from the project root
try {
  require('@expo/env').load(projectRoot);
} catch (error) {
  console.warn('⚠️ Failed to load environment variables using @expo/env.');
  console.warn(error);
}

const sentryBuildPluginPath = path.join(projectRoot, '.env.sentry-build-plugin');
if (fs.existsSync(sentryBuildPluginPath)) {
  loadDotenv(sentryBuildPluginPath);
}

let sentryOrg = getEnvVar(SENTRY_ORG);
let sentryUrl = getEnvVar(SENTRY_URL);
let sentryProject = getEnvVar(SENTRY_PROJECT);
let authToken = getEnvVar(SENTRY_AUTH_TOKEN);
const sentryCliBin = getEnvVar(SENTRY_CLI_EXECUTABLE) || require.resolve('@sentry/cli/bin/sentry-cli');

if (!sentryOrg || !sentryProject || !sentryUrl) {
  console.log('🐕 Fetching from expo config...');
  let pluginConfig = getSentryPluginPropertiesFromExpoConfig();
  if (!pluginConfig) {
    console.log('Could not fetch from expo config, trying sentry.properties files...');
    pluginConfig = getSentryPropertiesFromFile();
  }
  if (!pluginConfig) {
    console.error(
      "Could not resolve Sentry configuration. Set SENTRY_ORG, SENTRY_PROJECT, and SENTRY_URL environment variables, " +
      "or ensure '@sentry/react-native/expo' is in your plugins array in app.json/app.config.ts."
    );
    process.exit(1);
  }

  if (!sentryOrg) {
    if (!pluginConfig.organization) {
      console.error(
        `Could not resolve sentry org, set it in the environment variable ${SENTRY_ORG} or in the '@sentry/react-native' plugin properties in your expo config.`,
      );
      process.exit(1);
    }

    sentryOrg = pluginConfig.organization;
    console.log(`${SENTRY_ORG} resolved to ${sentryOrg} from expo config.`);
  }

  if (!sentryProject) {
    if (!pluginConfig.project) {
      console.error(
        `Could not resolve sentry project, set it in the environment variable ${SENTRY_PROJECT} or in the '@sentry/react-native' plugin properties in your expo config.`,
      );
      process.exit(1);
    }

    sentryProject = pluginConfig.project;
    console.log(`${SENTRY_PROJECT} resolved to ${sentryProject} from expo config.`);
  }
  if (!sentryUrl) {
    if (pluginConfig.url) {
      sentryUrl = pluginConfig.url;
      console.log(`${SENTRY_URL} resolved to ${sentryUrl} from expo config.`);
    }
    else {
      sentryUrl = 'https://sentry.io/';
      console.log(
        `Since it wasn't specified in the Expo config or environment variable, ${SENTRY_URL} now points to ${sentryUrl}.`
      );
    }
  }
}

if (!authToken) {
  console.error(`${SENTRY_AUTH_TOKEN} environment variable must be set.`);
  process.exit(1);
}

const outputDir = process.argv[2];
if (!outputDir) {
  console.error('Provide the directory with your bundles and sourcemaps as the first argument.');
  console.error('Example: npx @sentry/expo-upload-sourcemaps dist');
  process.exit(1);
}

const files = getAssetPathsSync(outputDir);
const groupedAssets = groupAssets(files);

const totalAssets = Object.keys(groupedAssets).length;
let numAssetsUploaded = 0;
for (const [assetGroupName, assets] of Object.entries(groupedAssets)) {
  const sourceMapPath = assets.find(asset => asset.endsWith('.map'));
  if (sourceMapPath) {
    const sourceMap = readAndPrintJSONFile(sourceMapPath);
    if (sourceMap.debugId) {
      sourceMap.debug_id = sourceMap.debugId;
    }
    writeJSONFile(sourceMapPath, sourceMap);
    console.log(`⬆️ Uploading ${assetGroupName} bundle and sourcemap...`);
  } else {
    console.log(`❓ Sourcemap for ${assetGroupName} not found, skipping...`);
    continue;
  }

  const isHermes = assets.find(asset => asset.endsWith('.hbc'));

  // Build arguments array for spawnSync (no shell interpretation needed)
  const args = ['sourcemaps', 'upload'];
  if (isHermes) {
    args.push('--debug-id-reference');
  }
  args.push(...assets);

  const result = spawnSync(sentryCliBin, args, {
    env: {
      ...process.env,
      [SENTRY_PROJECT]: sentryProject,
      [SENTRY_ORG]: sentryOrg,
      [SENTRY_URL]: sentryUrl
    },
    stdio: 'inherit',
  });

  if (result.error) {
    console.error('Failed to upload sourcemaps:', result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    if (result.signal) {
      console.error(`sentry-cli was terminated by signal ${result.signal}`);
    } else {
      console.error(`sentry-cli exited with status ${result.status}`);
    }
    process.exit(result.status || 1);
  }
  numAssetsUploaded++;
}

if (numAssetsUploaded === totalAssets) {
  console.log('✅ Uploaded bundles and sourcemaps to Sentry successfully.');
} else {
  console.warn(
    `⚠️  Uploaded ${numAssetsUploaded} of ${totalAssets} bundles and sourcemaps. ${numAssetsUploaded === 0 ? 'Ensure you are running `expo export` with the `--source-maps` flag.' : ''
    }`,
  );
}
