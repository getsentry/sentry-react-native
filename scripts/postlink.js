const glob = require('glob');
const fs = require('fs');
const inquirer = require('inquirer');
const xcode = require('xcode');
const chalk = require('chalk');
const pbxFile = require('xcode/lib/pbxFile');
const path = require('path');
const PLATFORMS = ['android', 'ios'];
const OBJC_HEADER =
  '\
#if __has_include(<React/RNSentry.h>)\n\
#import <React/RNSentry.h> // This is used for versions of react >= 0.40\n\
#else\n\
#import "RNSentry.h" // This is used for versions of react < 0.40\n\
#endif';

let cachedDsn = null;
let cachedProps = {};
let patchedAny = false;
let didShowInfoHint = false;
let configurePlatform = {};

function getPlatformName(platform) {
  return (
    {
      android: 'Android',
      ios: 'iOS'
    }[platform] || platform
  );
}

function considerShowingInfoHint() {
  if (didShowInfoHint) {
    return;
  }

  let {green, dim} = chalk;
  function l(msg) {
    console.log(msg);
  }

  l('');
  l(green('You are about to configure Sentry for React Native'));
  l(dim('We will ask you a bunch of questions to configure Sentry for you.'));
  l(dim('If you chose not to configure an integration you can run link again'));
  l(dim('later to configure that platform.'));
  l('');
  l('You will need the DSN and an API key for the application to proceed.');
  l('The keys can be found the project settings and at sentry.io/api/');
  l('');
  didShowInfoHint = true;
}

function shouldConfigurePlatform(platform) {
  if (configurePlatform[platform] !== undefined) {
    return Promise.resolve(configurePlatform[platform]);
  }
  // if a sentry.properties file exists for the platform we want to configure
  // without asking the user.  This means that re-linking later will not
  // bring up a useless dialog.
  if (
    fs.existsSync(platform + '/sentry.properties') ||
    fs.existsSync(process.cwd() + platform + '/sentry.properties')
  ) {
    configurePlatform[platform] = true;
    let {dim} = chalk;
    console.log(dim(platform + '/sentry.properties already exists'));
    return Promise.resolve(true);
  }

  considerShowingInfoHint();
  return inquirer
    .prompt([
      {
        type: 'list',
        name: 'configure',
        message: `Do you want to configure Sentry for ${getPlatformName(platform)}?`,
        choices: [
          {
            name: 'Yes',
            value: true
          },
          {
            name: 'No (or later)',
            value: false
          }
        ]
      }
    ])
    .then(function(answers) {
      configurePlatform[platform] = answers.configure;
      return Promise.resolve(answers.configure);
    });
}

function getDsn(platform) {
  considerShowingInfoHint();
  return inquirer
    .prompt([
      {
        type: 'input',
        default: cachedDsn || process.env.SENTRY_DSN || 'YOUR_DSN_HERE',
        message: 'The DSN for ' + getPlatformName(platform),
        name: 'dsn',
        validate: function(value) {
          let m = value.match(
            /^(?:(\w+):)?\/\/(?:(\w+)(:\w+)?@)?([\w\.-]+)(?::(\d+))?(\/.*)$/
          );
          if (!m) {
            return 'invalid dsn format';
          }
          if (m[1] !== 'http' && m[1] !== 'https') {
            return 'unsupported protocol for dsn: ' + m[1];
          }
          if (!m[3]) {
            return 'missing secret in dsn';
          }
          return true;
        }
      }
    ])
    .then(function(answers) {
      cachedDsn = answers.dsn;
      return Promise.resolve(answers.dsn);
    });
}

function getDefaultUrl() {
  if (cachedDsn) {
    let match = cachedDsn.match(/^(https?).*?@(.*?)\//);
    if (match) {
      return match[1] + '://' + match[2] + '/';
    }
  }
  return 'https://sentry.io/';
}

function getProperties(platform) {
  return inquirer
    .prompt([
      {
        type: 'input',
        default: cachedProps['defaults/url'] || process.env.SENTRY_URL || getDefaultUrl(),
        message:
          'The Sentry Server URL for ' +
            getPlatformName(platform) +
            '. Only needed if you use self hosted Sentry, press enter to use default.',
        name: 'defaults/url'
      },
      {
        type: 'input',
        default: cachedProps['defaults/org'] || process.env.SENTRY_ORG || 'your-org-slug',
        message: 'The Organization for ' + getPlatformName(platform),
        name: 'defaults/org'
      },
      {
        type: 'input',
        default:
          cachedProps['defaults/project'] ||
            process.env.SENTRY_PROJECT ||
            'your-project-slug',
        message: 'The Project for ' + getPlatformName(platform),
        name: 'defaults/project'
      },
      {
        type: 'password',
        default:
          cachedProps['auth/token'] || process.env.SENTRY_AUTH_TOKEN || 'YOUR_AUTH_TOKEN',
        message: 'The Auth-Token for ' + getPlatformName(platform),
        name: 'auth/token'
      }
    ])
    .then(function(answers) {
      cachedProps = answers;
      return Promise.resolve(answers);
    });
}

function dumpProperties(props) {
  let rv = [];
  for (let key in props) {
    let value = props[key];
    key = key.replace(/\//g, '.');
    if (value === undefined || value === null) {
      rv.push('#' + key + '=');
    } else {
      rv.push(key + '=' + value);
    }
  }
  return rv.join('\n') + '\n';
}

function patchAppDelegate(contents) {
  // add the header if it's not there yet.
  if (!contents.match(/#import "RNSentry.h"/)) {
    contents = contents.replace(/(#import <React\/RCTRootView.h>)/, '$1\n' + OBJC_HEADER);
  }

  // add root view init.
  let rootViewMatch = contents.match(/RCTRootView\s*\*\s*([^\s=]+)\s*=\s*\[/);
  if (rootViewMatch) {
    let rootViewInit = '[RNSentry installWithRootView:' + rootViewMatch[1] + '];';
    if (contents.indexOf(rootViewInit) < 0) {
      contents = contents.replace(
        /^(\s*)RCTRootView\s*\*\s*[^\s=]+\s*=\s*\[([^]*?\s*\]\s*;\s*$)/m,
        function(match, indent) {
          return match.trimRight() + '\n' + indent + rootViewInit + '\n';
        }
      );
    }
  }

  return Promise.resolve(contents);
}

function patchAppJs(contents, filename) {
  // since the init call could live in other places too, we really only
  // want to do this if we managed to patch any of the other files as well.
  if (contents.match(/Sentry.config\(/) || !patchedAny) {
    return Promise.resolve(null);
  }

  // if we match react-native-sentry somewhere, we already patched the file
  // and no longer need to
  if (contents.match('react-native-sentry')) {
    Promise.resolve(contents);
  }

  return new Promise((resolve, reject) => {
    let promises = [];
    for (let platform of PLATFORMS) {
      promises.push(
        shouldConfigurePlatform(platform).then(shouldConfigure => {
          if (!shouldConfigure) {
            return Promise.resolve(null);
          }
          return getDsn(platform).then(dsn => {
            let platformDsn = {};
            platformDsn[platform] = dsn;
            return Promise.resolve(platformDsn);
          });
        })
      );
    }
    Promise.all(promises).then(dsns => {
      let config = {};
      dsns.forEach(value => {
        if (value) Object.assign(config, value);
      });
      if (Object.keys(config).length === 0) resolve(null);
      resolve(
        contents.replace(/^([^]*)(import\s+[^;]*?;$)/m, match => {
          return (
            match +
            "\n\nimport { Sentry } from 'react-native-sentry';\n\n" +
            `const sentryDsn = Platform.select(${JSON.stringify(config)});\n` +
            'Sentry.config(sentryDsn).install();\n'
          );
        })
      );
    });
  });
}

function patchIndexJs(contents, filename) {
  // since the init call could live in other places too, we really only
  // want to do this if we managed to patch any of the other files as well.
  if (contents.match(/Sentry.config\(/) || !patchedAny) {
    return Promise.resolve(null);
  }

  let platform = filename.match(/index\.([^.]+?)\.js/)[1];
  return shouldConfigurePlatform(platform).then(shouldConfigure => {
    if (!shouldConfigure) {
      return null;
    }
    // if we match react-native-sentry somewhere, we already patched the file
    // and no longer need to
    if (contents.match('react-native-sentry')) {
      Promise.resolve(contents);
    }
    return getDsn(platform).then(function(dsn) {
      return Promise.resolve(
        contents.replace(/^([^]*)(import\s+[^;]*?;$)/m, function(match) {
          return (
            match +
            "\n\nimport { Sentry } from 'react-native-sentry';\n\n" +
            'Sentry.config(' +
            JSON.stringify(dsn) +
            ').install();\n'
          );
        })
      );
    });
  });
}

function patchBuildGradle(contents) {
  let applyFrom = 'apply from: "../../node_modules/react-native-sentry/sentry.gradle"';
  if (contents.indexOf(applyFrom) >= 0) {
    return Promise.resolve(null);
  }

  return shouldConfigurePlatform('android').then(shouldConfigure => {
    if (!shouldConfigure) {
      return null;
    }

    return Promise.resolve(
      contents.replace(
        /^apply from: "..\/..\/node_modules\/react-native\/react.gradle"/m,
        function(match) {
          return match + '\n' + applyFrom;
        }
      )
    );
  });
}

function patchExistingXcodeBuildScripts(buildScripts) {
  for (let script of buildScripts) {
    if (
      !script.shellScript.match(/(packager|scripts)\/react-native-xcode\.sh\b/) ||
      script.shellScript.match(/sentry-cli\s+react-native[\s-]xcode/)
    ) {
      continue;
    }
    let code = JSON.parse(script.shellScript);
    code =
      'export SENTRY_PROPERTIES=sentry.properties\n' +
      code.replace(/^.*?\/(packager|scripts)\/react-native-xcode\.sh\s*/m, function(
        match
      ) {
        return (
          '../node_modules/sentry-cli-binary/bin/sentry-cli react-native xcode ' + match
        );
      });
    script.shellScript = JSON.stringify(code);
  }
}

function addNewXcodeBuildPhaseForSymbols(buildScripts, proj) {
  for (let script of buildScripts) {
    if (script.shellScript.match(/sentry-cli\s+upload-dsym/)) {
      return;
    }
  }

  proj.addBuildPhase(
    [],
    'PBXShellScriptBuildPhase',
    'Upload Debug Symbols to Sentry',
    null,
    {
      shellPath: '/bin/sh',
      shellScript:
        'export SENTRY_PROPERTIES=sentry.properties\\n' +
          '../node_modules/sentry-cli-binary/bin/sentry-cli upload-dsym'
    }
  );
}

function addZLibToXcode(proj) {
  proj.addPbxGroup([], 'Frameworks', 'Application');
  proj.addFramework('libz.tbd', {
    link: true,
    target: proj.getFirstTarget().uuid
  });
}

function patchXcodeProj(contents, filename) {
  let proj = xcode.project(filename);
  return new Promise(function(resolve, reject) {
    proj.parse(function(err) {
      if (err) {
        reject(err);
        return;
      }

      let buildScripts = [];
      for (let key in proj.hash.project.objects.PBXShellScriptBuildPhase || {}) {
        let val = proj.hash.project.objects.PBXShellScriptBuildPhase[key];
        if (val.isa) {
          buildScripts.push(val);
        }
      }

      patchExistingXcodeBuildScripts(buildScripts);
      addNewXcodeBuildPhaseForSymbols(buildScripts, proj);
      addZLibToXcode(proj);

      // we always modify the xcode file in memory but we only want to save it
      // in case the user wants configuration for ios.  This is why we check
      // here first if changes are made before we might prompt the platform
      // continue prompt.
      let newContents = proj.writeSync();
      if (newContents === contents) {
        resolve(null);
      } else {
        return shouldConfigurePlatform('ios').then(shouldConfigure => {
          resolve(shouldConfigure ? newContents : null);
        });
      }
    });
  });
}

function patchMatchingFile(pattern, func) {
  let matches = glob.sync(pattern, {
    ignore: ['node_modules/**', 'ios/Pods/**', '**/Pods/**']
  });
  let rv = Promise.resolve();
  matches.forEach(function(match) {
    let contents = fs.readFileSync(match, {
      encoding: 'utf-8'
    });
    rv = rv.then(() => func(contents, match)).then(function(newContents) {
      if (newContents !== null && contents !== undefined && contents != newContents) {
        patchedAny = true;
        fs.writeFileSync(match, newContents);
      }
    });
  });
  return rv;
}

function addSentryInit() {
  let rv = Promise.resolve();
  // rm 0.49 introduced an App.js for both platforms
  rv = rv.then(() => patchMatchingFile('App.js', patchAppJs));
  for (let platform of PLATFORMS) {
    rv = rv.then(() => patchMatchingFile(`index.${platform}.js`, patchIndexJs));
  }
  return rv;
}

function resolveSentryCliBinaryPath(props) {
  return new Promise(function(resolve, reject) {
    try {
      const cliPath = require.resolve('sentry-cli-binary/bin/sentry-cli');
      props['cli/executable'] = path.relative(process.cwd(), cliPath);
    } catch (e) {
      // we do nothing and leave everyting as it is
    }
    resolve(props);
  });
}

function addSentryProperties() {
  let rv = Promise.resolve();

  for (let platform of PLATFORMS) {
    // This will create the ios/android folder before trying to write
    // sentry.properties in it which would fail otherwise
    if (!fs.existsSync(platform)) {
      fs.mkdirSync(platform);
    }
    let fn = platform + '/sentry.properties';
    if (fs.existsSync(fn)) {
      continue;
    }

    rv = rv.then(() =>
      shouldConfigurePlatform(platform).then(shouldConfigure => {
        if (!shouldConfigure) {
          return null;
        }
        return getProperties(platform).then(resolveSentryCliBinaryPath).then(props => {
          fs.writeFileSync(fn, dumpProperties(props));
        });
      })
    );
  }

  return rv;
}

Promise.resolve()
  /* these steps patch the build files without user interactions */
  .then(() => patchMatchingFile('**/app/build.gradle', patchBuildGradle))
  .then(() => patchMatchingFile('ios/*.xcodeproj/project.pbxproj', patchXcodeProj))
  .then(() => patchMatchingFile('**/AppDelegate.m', patchAppDelegate))
  /* if any of the previous steps did something, this will patch
     the index.PLATFORM.js files with the necessary initialization code */
  .then(() => addSentryInit())
  /* writes sentry.properties files with the API key and other settings */
  .then(() => addSentryProperties())
  .catch(function(e) {
    console.log('Could not link react-native-sentry: ' + e);
    return Promise.resolve();
  });
