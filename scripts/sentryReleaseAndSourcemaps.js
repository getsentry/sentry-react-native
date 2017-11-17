#!/usr/bin/env node
'use strict';

const spawnAsync = require('@expo/spawn-async');
const path = require('path');
const rimraf = require('rimraf');
const mkdirp = require('mkdirp');
const fs = require('fs');
const assert = require('assert');
const plist = require('plist');

let version = null;
let dist = null;

let program = require('commander');

generateAndUploadSourceMaps();

async function generateAndUploadSourceMaps() {
  const tmpdir = path.resolve(process.cwd(), '.tmp', 'sentry');

  try {
    program
      .description('Generate and upload sentry sourcemaps.')
      .option('-i, --ios', 'Bundle and upload for ios')
      .option('-a, --android', 'Bundle and upload for android')
      .option('-w, --windows', 'Bundle and upload for windows')
      .option('-x, --appversion <v>', 'Version')
      .option('-d, --dist <d>', 'Distribution')
      .option(
        '-p, --plist <p>',
        'App plist file, from the built xcarchive. The version and dist will be taken from that'
      )
      .parse(process.argv);

    let platforms = {};
    if (program.ios) {
      platforms['ios'] = {
        bundle: 'main.jsbundle',
        map: 'main.jsbundle.map'
      };
    }
    if (program.android) {
      platforms['android'] = {
        bundle: 'index.android.bundle',
        map: 'index.android.bundle.map'
      };
    }
    if (program.windows) {
      platforms['windows'] = {
        bundle: 'index.windows.bundle',
        map: 'index.windows.bundle.map'
      };
    }

    if (Object.keys(platforms).length === 0) {
      throw new Error('At least one platforms must be specified');
    }

    let version = null;
    let dist = null;
    let infoplist = null;
    if (program.plist) {
      const plistContents = fs.readFileSync(program.plist, {encoding: 'utf8'});
      infoplist = plist.parse(plistContents);
    }
    if (program.appversion) {
      version = program.appversion;
    } else if (infoplist) {
      version = `${infoplist.ApplicationProperties.CFBundleIdentifier}-${
        infoplist.ApplicationProperties.CFBundleShortVersionString
      }`;
    }
    if (!version) {
      throw new Error('No version available');
    }
    if (program.dist) {
      dist = program.dist;
    } else if (infoplist) {
      dist = infoplist.ApplicationProperties.CFBundleVersion;
    }
    if (!dist) {
      throw new Error('No dist available');
    }
    console.log('Version and dist', version, dist);

    rimraf.sync(tmpdir);
    mkdirp.sync(tmpdir);

    // Generate bundles
    let output;
    for (let platform in platforms) {
      const indexPath = path.resolve(process.cwd(), `index.${platform}.js`);
      console.log(`Bundling ${platform}`, indexPath);
      try {
        fs.accessSync(indexPath);
      } catch (e) {
        // Using this as a way to determine that the given platform is not supported
        continue;
      }

      const bundleOut = path.resolve(tmpdir, platforms[platform].bundle);
      const sourceMapOut = path.resolve(tmpdir, platforms[platform].map);
      console.log(`Bundling index.${platform}.js`, bundleOut, sourceMapOut);
      await spawnAsync('watchman', ['watch-del-all']);
      const bundleOutput = await spawnAsync('react-native', [
        'bundle',
        '--platform',
        platform,
        '--entry-file',
        `index.${platform}.js`,
        '--bundle-output',
        bundleOut,
        '--sourcemap-output',
        sourceMapOut,
        '--dev',
        'false',
        '--reset-cache'
      ]);
      output = bundleOutput.stdout.toString();
      console.log(output);
    }
    const propertiesFile = path.resolve(process.cwd(), 'ios', 'sentry.properties');
    const childProcessEnv = Object.assign({}, process.env, {
      SENTRY_PROPERTIES: propertiesFile
    });

    console.log(`Sentry cli binary`, sentryCliBinaryPath, version, propertiesFile);

    let createReleaseResult = await spawnAsync(
      'sentry-cli',
      ['releases', 'new', version],
      {
        cwd: tmpdir,
        env: childProcessEnv
      }
    );

    output = createReleaseResult.stdout.toString();
    console.log(output);

    let uploadResult = await spawnAsync(
      'sentry-cli',
      [
        'releases',
        'files',
        version,
        'upload-sourcemaps',
        '.',
        '--rewrite',
        '--dist',
        dist
      ],
      {
        cwd: tmpdir,
        env: childProcessEnv
      }
    );

    output = uploadResult.stdout.toString();
    console.log(output);

    // TODO code push, dsym
  } catch (e) {
    console.log(messageForError(e));
    console.log(
      `Verify that your Sentry configuration in app.json is correct and refer to https://docs.expo.io/versions/latest/guides/using-sentry.html`
    );
  } finally {
    rimraf.sync(tmpdir);
  }
}

function messageForError(e) {
  if (!e.stderr) {
    if (e.message) {
      return e.message;
    }
    return `Error uploading sourcemaps to Sentry`;
  }

  let message = e.stderr.replace(/^\s+|\s+$/g, '');
  if (message.indexOf('error: ') === 0) {
    message = message.replace('error: ', '');
  }

  return `Error uploading sourcemaps to Sentry: ${message}`;
}
