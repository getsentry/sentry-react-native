#!/usr/bin/env node

const fs = require('fs');
const { argv } = require('process');

const parseArgs = require('minimist');
const { debug } = require('@sentry/core');
debug.enable();

const args = parseArgs(argv.slice(2));
if (!args['pod-file']) {
  throw new Error('Missing --pod-file');
}

if (!args['engine']) {
  throw new Error('Missing --engine');
}

// RN version is optional but recommended for Sentry fix
const providedRNVersion = args['rn-version'];

const enableHermes = args['engine'] === 'hermes' ? true : args['engine'] === 'jsc' ? false : null;
if (enableHermes === null) {
  throw new Error('Invalid engine');
}

// Optional iOS version argument, defaults to '15.1' due to Cocoa SDK V9 and RN 0.81.0 requirement
const iosVersion = args['ios-version'] || '15.1';

debug.log('Patching Podfile', args['pod-file']);
let content = fs.readFileSync(args['pod-file'], 'utf8');

const isHermesEnabled = content.includes(':hermes_enabled => true,');
const shouldPatch = enableHermes !== isHermesEnabled;
if (shouldPatch) {
  content = content.replace(
    /:hermes_enabled.*/,
    enableHermes ? ':hermes_enabled => true,' : ':hermes_enabled => false,',
  );
  if (enableHermes) {
    debug.log('Patching Podfile for Hermes');
  } else {
    debug.log('Patching Podfile for JSC');
  }
}

// Patch iOS version
const platformPattern = /platform :ios, (min_ios_version_supported|['"][0-9.]+['"])/;
const currentMatch = content.match(platformPattern);

if (currentMatch) {
  const currentValue = currentMatch[1];
  const shouldPatchVersion = currentValue === 'min_ios_version_supported' ||
                             currentValue !== `'${iosVersion}'`;

  if (shouldPatchVersion) {
    content = content.replace(
      platformPattern,
      `platform :ios, '${iosVersion}'`
    );
    debug.log(`Patching iOS version to ${iosVersion} (was: ${currentValue})`);
  } else {
    debug.log(`iOS version already set to ${iosVersion}`);
  }
} else {
  debug.log('Warning: Could not find platform :ios line to patch');
}

// Add post_install hook to fix Sentry module map resolution for RN < 0.80
// This is needed for Sentry Cocoa SDK 9.x which uses _SentryPrivate module
const rnVersionMatch = providedRNVersion;
const needsSentryFix = rnVersionMatch && parseFloat(rnVersionMatch) < 0.80;
const hasPostInstall = content.includes('post_install do |installer|');
const hasSentryFix = content.includes('_SentryPrivate module resolution');

if (needsSentryFix && !hasSentryFix && rnVersionMatch) {
  debug.log(`RN version: ${rnVersionMatch}, applying Sentry module map fix`);

  const sentryFixCode = `    # Fix for Sentry Cocoa SDK 9.x _SentryPrivate module resolution in RN < 0.80
    # The _SentryPrivate module is used internally by Sentry SDK 9.x and needs proper module map resolution
    Pod::UI.puts "Applying Sentry module map fix for RN < 0.80"
    installer.pods_project.targets.each do |target|
      if target.name == 'Sentry' || target.name.start_with?('Sentry')
        Pod::UI.puts "Found Sentry target: #{target.name}"
        target.build_configurations.each do |config|
          # Enable modules and ensure proper module map resolution
          config.build_settings['CLANG_ENABLE_MODULES'] = 'YES'
          config.build_settings['DEFINES_MODULE'] = 'YES'
          config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
          Pod::UI.puts "Applied module map fix to #{target.name} (#{config.name})"
        end
      end
    end`;

  if (hasPostInstall) {
    // Append to existing post_install hook
    // Find the post_install block and insert before its closing 'end'
    const postInstallPattern = /(post_install do \|installer\|[\s\S]*?)(\n\s*end)/;
    if (postInstallPattern.test(content)) {
      content = content.replace(
        postInstallPattern,
        (match, postInstallContent, endBlock) => {
          // Check if sentry fix is already there
          if (postInstallContent.includes('_SentryPrivate')) {
            return match;
          }
          // Add sentry fix before the end, maintaining proper indentation
          const indent = endBlock.match(/^(\s*)/)?.[1] || '  ';
          return postInstallContent + '\n' + indent + sentryFixCode + endBlock;
        }
      );
      debug.log('Added Sentry module map fix to existing post_install hook');
    }
  } else {
    // Add new post_install hook before the target's closing 'end'
    // Find the target block and insert post_install before its closing 'end'
    const targetPattern = /(target\s+['"][^'"]+['"]\s+do[\s\S]*?)(\n\s*end\s*$)/m;
    if (targetPattern.test(content)) {
      content = content.replace(
        targetPattern,
        (match, targetContent, endBlock) => {
          // Check if already has post_install (shouldn't happen, but be safe)
          if (targetContent.includes('post_install')) {
            return match;
          }
          // Add post_install hook before the target's end
          const indent = endBlock.match(/^(\s*)/)?.[1] || '';
          const sentryFixHook = `\n${indent}  post_install do |installer|\n${indent}${sentryFixCode}\n${indent}  end`;
          return targetContent + sentryFixHook + endBlock;
        }
      );
      debug.log('Added new post_install hook to fix Sentry module map resolution');
    } else {
      // Fallback: append at the end before final 'end'
      const sentryFixHook = `\n  post_install do |installer|\n${sentryFixCode}\n  end\n`;
      content = content.replace(/(\n\s*end\s*$)/, sentryFixHook + '$1');
      debug.log('Added new post_install hook (fallback method)');
    }
  }
} else if (rnVersionMatch && !needsSentryFix) {
  debug.log(`RN version ${rnVersionMatch} >= 0.80, skipping Sentry fix`);
} else if (!rnVersionMatch) {
  debug.log('RN version not provided, skipping Sentry fix check');
}

// Write the file if any changes were made
if (shouldPatch || currentMatch || (needsSentryFix && !hasSentryFix)) {
  fs.writeFileSync(args['pod-file'], content);
  debug.log('Podfile patched successfully!');
} else {
  debug.log('Podfile is already patched!');
}
