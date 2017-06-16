let glob = require('glob');
let fs = require('fs');
let xcode = require('xcode');

function unpatchAppDelegate(contents) {
  return Promise.resolve(
    contents
      .replace(/^#if __has_include\(<React\/RNSentry.h>\)[^]*?\#endif\r?\n/m, '')
      .replace(/^#import\s+(?:<React\/RNSentry.h>|"RNSentry.h")\s*?\r?\n/m, '')
      .replace(/(\r?\n|^)\s*\[RNSentry\s+installWithRootView:.*?\];\s*?\r?\n/m, '')
  );
}

function unpatchBuildGradle(contents) {
  return Promise.resolve(
    contents.replace(
      /^\s*apply from: ["']..\/..\/node_modules\/react-native-sentry\/sentry.gradle["'];?\s*?\r?\n/m,
      ''
    )
  );
}

function unpatchXcodeBuildScripts(proj) {
  let scripts = proj.hash.project.objects.PBXShellScriptBuildPhase || {};
  let firstTarget = proj.getFirstTarget().uuid;
  let nativeTargets = proj.hash.project.objects.PBXNativeTarget;

  // scripts to patch partially.  Run this first so that we don't
  // accidentally delete some scripts later entirely that we only want to
  // rewrite.
  for (let key of Object.keys(scripts)) {
    let script = scripts[key];

    // ignore comments
    if (typeof script === 'string') {
      continue;
    }

    // ignore scripts that do not invoke the react-native-xcode command.
    if (!script.shellScript.match(/sentry-cli\s+react-native[\s-]xcode\b/)) {
      continue;
    }

    script.shellScript = JSON.stringify(
      JSON.parse(script.shellScript)
        // "legacy" location for this.  This is what happens if users followed
        // the old documentation for where to add the bundle command
        .replace(
          /^..\/node_modules\/react-native-sentry\/bin\/bundle-frameworks\s*?\r\n?/m,
          ''
        )
        // legacy location for dsym upload
        .replace(
          /^..\/node_modules\/sentry-cli-binary\/bin\/sentry-cli upload-dsym\s*?\r?\n/m,
          ''
        )
        // remove sentry properties export
        .replace(/^export SENTRY_PROPERTIES=sentry.properties\r?\n/m, '')
        // unwrap react-native-xcode.sh command.  In case someone replaced it
        // entirely with the sentry-cli command we need to put the original
        // version back in.
        .replace(
          /^(?:..\/node_modules\/sentry-cli-binary\/bin\/)?sentry-cli\s+react-native[\s-]xcode(\s+.*?)$/m,
          function(match, m1) {
            let rv = m1.trim();
            if (rv === '') {
              return '../node_modules/react-native/packager/react-native-xcode.sh';
            } else {
              return rv;
            }
          }
        )
    );
  }

  // scripts to kill entirely.
  for (let key of Object.keys(scripts)) {
    let script = scripts[key];

    // ignore comments and keys that got deleted
    if (typeof script === 'string' || script === undefined) {
      continue;
    }

    if (
      script.shellScript.match(/react-native-sentry\/bin\/bundle-frameworks\b/) ||
      script.shellScript.match(/sentry-cli-binary\/bin\/sentry-cli\s+upload-dsym\b/)
    ) {
      delete scripts[key];
      delete scripts[key + '_comment'];
      let phases = nativeTargets[firstTarget].buildPhases;
      if (phases) {
        for (let i = 0; i < phases.length; i++) {
          if (phases[i].value === key) {
            phases.splice(i, 1);
            break;
          }
        }
      }
      continue;
    }
  }
}

function unpatchXcodeProj(contents, filename) {
  let proj = xcode.project(filename);
  return new Promise(function(resolve, reject) {
    proj.parse(function(err) {
      if (err) {
        reject(err);
        return;
      }

      unpatchXcodeBuildScripts(proj);
      resolve(proj.writeSync());
    });
  });
}

function patchMatchingFile(pattern, func) {
  let matches = glob.sync(pattern, {
    ignore: 'node_modules/**'
  });
  let rv = Promise.resolve();
  matches.forEach(function(match) {
    let contents = fs.readFileSync(match, {
      encoding: 'utf-8'
    });
    rv = rv.then(() => func(contents, match)).then(function(newContents) {
      if (contents != newContents) {
        fs.writeFileSync(match, newContents);
      }
    });
  });
  return rv;
}

Promise.resolve()
  .then(() => patchMatchingFile('**/*.xcodeproj/project.pbxproj', unpatchXcodeProj))
  .then(() => patchMatchingFile('**/AppDelegate.m', unpatchAppDelegate))
  .then(() => patchMatchingFile('**/app/build.gradle', unpatchBuildGradle))
  .catch(function(e) {
    console.log('Could not unlink react-native-sentry: ' + e);
    return Promise.resolve();
  });
