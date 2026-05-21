import { warnOnce } from '../../plugin/src/logger';
import {
  addDisableAutoUploadToExistingScript,
  addSentryWithBundledScriptsToBundleShellScript,
  modifyExistingXcodeBuildScript,
  removeDisableAutoUploadFromExistingScript,
} from '../../plugin/src/withSentryIOS';

jest.mock('../../plugin/src/logger');

const buildScriptWithoutSentry = {
  shellScript: JSON.stringify(`"
export NODE_BINARY=node
../node_modules/react-native/scripts/react-native-xcode.sh
"`),
};

const buildScriptWithSentry = {
  shellScript: JSON.stringify(`"
export NODE_BINARY=node
/bin/sh \`"$NODE_BINARY" --print "require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode.sh'"\` ../node_modules/react-native/scripts/react-native-xcode.sh
"`),
};

const monorepoBuildScriptWithoutSentry = {
  shellScript: JSON.stringify(`"
export NODE_BINARY=node
\`node --print "require.resolve('react-native/package.json').slice(0, -13) + '/scripts/react-native-xcode.sh'"\`
"`),
};

const monorepoBuildScriptWithSentry = {
  shellScript: JSON.stringify(`"
export NODE_BINARY=node
/bin/sh \`"$NODE_BINARY" --print "require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode.sh'"\` \`node --print "require.resolve('react-native/package.json').slice(0, -13) + '/scripts/react-native-xcode.sh'"\`
"`),
};

const buildScriptWeDontExpect = {
  shellScript: `
  `,
};

describe('Configures iOS native project correctly', () => {
  let consoleWarnMock: jest.SpyInstance<void, [message?: any, ...optionalParams: any[]], any>;

  beforeEach(() => {
    consoleWarnMock = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnMock.mockRestore();
  });

  it("Doesn't modify build script if Sentry's already configured", () => {
    const script = Object.assign({}, buildScriptWithSentry);
    modifyExistingXcodeBuildScript(script);
    expect(JSON.parse(script.shellScript)).toStrictEqual(JSON.parse(buildScriptWithSentry.shellScript));
  });

  it("Add Sentry configuration to 'Bundle React Native Code' build script", () => {
    const script = Object.assign({}, buildScriptWithoutSentry);
    modifyExistingXcodeBuildScript(script);
    expect(JSON.parse(script.shellScript)).toStrictEqual(JSON.parse(buildScriptWithSentry.shellScript));
  });

  it("Monorepo: doesn't modify build script if Sentry's already configured", () => {
    const script = Object.assign({}, monorepoBuildScriptWithSentry);
    modifyExistingXcodeBuildScript(script);
    expect(JSON.parse(script.shellScript)).toStrictEqual(JSON.parse(monorepoBuildScriptWithSentry.shellScript));
  });

  it("Monorepo: add Sentry configuration to 'Bundle React Native Code' build script", () => {
    const script = Object.assign({}, monorepoBuildScriptWithoutSentry);
    modifyExistingXcodeBuildScript(script);
    expect(JSON.parse(script.shellScript)).toStrictEqual(JSON.parse(monorepoBuildScriptWithSentry.shellScript));
  });

  it("Warns to file a bug report if build script isn't what we expect to find", () => {
    modifyExistingXcodeBuildScript(buildScriptWeDontExpect);
    expect(warnOnce).toHaveBeenCalled();
  });
});

describe('disableAutoUpload option for Bundle React Native code phase', () => {
  let consoleWarnMock: jest.SpyInstance<void, [message?: any, ...optionalParams: any[]], any>;

  beforeEach(() => {
    consoleWarnMock = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnMock.mockRestore();
  });

  it('Prepends export on its own line when disableAutoUpload is true', () => {
    const script = Object.assign({}, buildScriptWithoutSentry);
    modifyExistingXcodeBuildScript(script, true);
    const parsed = JSON.parse(script.shellScript);
    expect(parsed).toContain('export SENTRY_DISABLE_AUTO_UPLOAD=true');
    expect(parsed).toContain('sentry-xcode.sh');
    expect(parsed).toMatch(/^"/);
    expect(parsed).toMatch(/"$/);
  });

  it('Does not prepend export when disableAutoUpload is false', () => {
    const script = Object.assign({}, buildScriptWithoutSentry);
    modifyExistingXcodeBuildScript(script, false);
    const parsed = JSON.parse(script.shellScript);
    expect(parsed).not.toContain('SENTRY_DISABLE_AUTO_UPLOAD');
  });

  it('Injects export into already-configured bundle script on re-prebuild', () => {
    const script = Object.assign({}, buildScriptWithSentry);
    modifyExistingXcodeBuildScript(script, true);
    const parsed = JSON.parse(script.shellScript);
    expect(parsed).toMatch(/^"\nexport SENTRY_DISABLE_AUTO_UPLOAD=true\n/);
    expect(parsed).toContain('sentry-xcode.sh');
  });

  it('Does not duplicate export if already present in bundle script', () => {
    const scriptWithExport = {
      shellScript: JSON.stringify(`"
export SENTRY_DISABLE_AUTO_UPLOAD=true
export NODE_BINARY=node
/bin/sh \`"$NODE_BINARY" --print "require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode.sh'"\` ../node_modules/react-native/scripts/react-native-xcode.sh
"`),
    };
    const before = scriptWithExport.shellScript;
    modifyExistingXcodeBuildScript(scriptWithExport, true);
    expect(scriptWithExport.shellScript).toBe(before);
  });

  it('Does not modify already-configured script when disableAutoUpload is false', () => {
    const script = Object.assign({}, buildScriptWithSentry);
    const before = script.shellScript;
    modifyExistingXcodeBuildScript(script, false);
    expect(script.shellScript).toBe(before);
  });

  it('addSentryWithBundledScriptsToBundleShellScript uses real newline, not literal backslash-n', () => {
    const input = `"
export NODE_BINARY=node
../node_modules/react-native/scripts/react-native-xcode.sh
"`;
    const result = addSentryWithBundledScriptsToBundleShellScript(input, true);
    expect(result).toContain('export SENTRY_DISABLE_AUTO_UPLOAD=true\n/bin/sh');
    expect(result).not.toContain('true\\n');
  });

  it('Produces a valid shell script after JSON round-trip', () => {
    const script = Object.assign({}, buildScriptWithoutSentry);
    modifyExistingXcodeBuildScript(script, true);
    const parsed = JSON.parse(script.shellScript);
    const lines = parsed.split('\n');
    expect(lines).toContainEqual('export SENTRY_DISABLE_AUTO_UPLOAD=true');
  });

  it('Fresh-prebuild and re-prebuild both place export inside delimiters', () => {
    const freshScript = Object.assign({}, buildScriptWithoutSentry);
    modifyExistingXcodeBuildScript(freshScript, true);
    const freshParsed = JSON.parse(freshScript.shellScript);

    const rePrebuildScript = Object.assign({}, buildScriptWithSentry);
    modifyExistingXcodeBuildScript(rePrebuildScript, true);
    const rePrebuildParsed = JSON.parse(rePrebuildScript.shellScript);

    for (const parsed of [freshParsed, rePrebuildParsed]) {
      expect(parsed).toMatch(/^"/);
      expect(parsed).toMatch(/"$/);
      expect(parsed).toContain('export SENTRY_DISABLE_AUTO_UPLOAD=true');
      expect(parsed).toContain('sentry-xcode.sh');
    }
  });
});

describe('addDisableAutoUploadToExistingScript', () => {
  const debugFilesShellScript =
    "/bin/sh `${NODE_BINARY:-node} --print \"require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode-debug-files.sh'\"`";

  it('injects export into JSON-encoded shellScript', () => {
    const script = { shellScript: JSON.stringify(debugFilesShellScript) };
    addDisableAutoUploadToExistingScript(script);
    const parsed = JSON.parse(script.shellScript);
    expect(parsed).toMatch(/^export SENTRY_DISABLE_AUTO_UPLOAD=true\n/);
    expect(parsed).toContain('sentry-xcode-debug-files.sh');
  });

  it('injects export into non-JSON-encoded shellScript via fallback', () => {
    const script = { shellScript: debugFilesShellScript };
    addDisableAutoUploadToExistingScript(script);
    expect(script.shellScript).toMatch(/^export SENTRY_DISABLE_AUTO_UPLOAD=true\n/);
    expect(script.shellScript).toContain('sentry-xcode-debug-files.sh');
  });

  it('does not duplicate export if already present in JSON-encoded script', () => {
    const script = {
      shellScript: JSON.stringify(`export SENTRY_DISABLE_AUTO_UPLOAD=true\n${debugFilesShellScript}`),
    };
    const before = script.shellScript;
    addDisableAutoUploadToExistingScript(script);
    expect(script.shellScript).toBe(before);
  });

  it('does not duplicate export if already present in raw script', () => {
    const script = {
      shellScript: `export SENTRY_DISABLE_AUTO_UPLOAD=true\n${debugFilesShellScript}`,
    };
    const before = script.shellScript;
    addDisableAutoUploadToExistingScript(script);
    expect(script.shellScript).toBe(before);
  });

  it('works on the bundle phase script format (JSON-encoded with inner quotes)', () => {
    const script = Object.assign({}, buildScriptWithSentry);
    addDisableAutoUploadToExistingScript(script);
    const parsed = JSON.parse(script.shellScript);
    expect(parsed).toMatch(/^"\nexport SENTRY_DISABLE_AUTO_UPLOAD=true\n/);
    expect(parsed).toContain('sentry-xcode.sh');
  });
});

describe('removeDisableAutoUploadFromExistingScript', () => {
  const debugFilesShellScript =
    "/bin/sh `${NODE_BINARY:-node} --print \"require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode-debug-files.sh'\"`";

  it('removes export from JSON-encoded shellScript', () => {
    const script = {
      shellScript: JSON.stringify(`export SENTRY_DISABLE_AUTO_UPLOAD=true\n${debugFilesShellScript}`),
    };
    removeDisableAutoUploadFromExistingScript(script);
    const parsed = JSON.parse(script.shellScript);
    expect(parsed).not.toContain('SENTRY_DISABLE_AUTO_UPLOAD');
    expect(parsed).toContain('sentry-xcode-debug-files.sh');
  });

  it('removes export from non-JSON-encoded shellScript', () => {
    const script = {
      shellScript: `export SENTRY_DISABLE_AUTO_UPLOAD=true\n${debugFilesShellScript}`,
    };
    removeDisableAutoUploadFromExistingScript(script);
    expect(script.shellScript).not.toContain('SENTRY_DISABLE_AUTO_UPLOAD');
    expect(script.shellScript).toContain('sentry-xcode-debug-files.sh');
  });

  it('removes export from bundle phase script (JSON-encoded with inner quotes)', () => {
    const script = Object.assign({}, buildScriptWithSentry);
    addDisableAutoUploadToExistingScript(script);
    expect(script.shellScript).toContain('SENTRY_DISABLE_AUTO_UPLOAD');
    removeDisableAutoUploadFromExistingScript(script);
    const parsed = JSON.parse(script.shellScript);
    expect(parsed).not.toContain('SENTRY_DISABLE_AUTO_UPLOAD');
    expect(parsed).toContain('sentry-xcode.sh');
  });

  it('no-ops when export is not present', () => {
    const script = { shellScript: JSON.stringify(debugFilesShellScript) };
    const before = script.shellScript;
    removeDisableAutoUploadFromExistingScript(script);
    expect(script.shellScript).toBe(before);
  });
});

describe('disableAutoUpload toggle: re-prebuild with false removes prior injection', () => {
  let consoleWarnMock: jest.SpyInstance<void, [message?: any, ...optionalParams: any[]], any>;

  beforeEach(() => {
    consoleWarnMock = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnMock.mockRestore();
  });

  it('removes export from bundle script when toggling disableAutoUpload back to false', () => {
    const script = Object.assign({}, buildScriptWithSentry);
    modifyExistingXcodeBuildScript(script, true);
    expect(JSON.parse(script.shellScript)).toContain('SENTRY_DISABLE_AUTO_UPLOAD');

    modifyExistingXcodeBuildScript(script, false);
    expect(JSON.parse(script.shellScript)).not.toContain('SENTRY_DISABLE_AUTO_UPLOAD');
    expect(JSON.parse(script.shellScript)).toContain('sentry-xcode.sh');
  });
});

describe('Upload Debug Symbols to Sentry build phase', () => {
  let mockXcodeProject: any;
  let addBuildPhaseSpy: jest.Mock;
  const expectedShellScript =
    "/bin/sh `${NODE_BINARY:-node} --print \"require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode-debug-files.sh'\"`";

  const getOptions = () => {
    const callArgs = addBuildPhaseSpy.mock.calls[0];
    return callArgs[4];
  };

  beforeEach(() => {
    addBuildPhaseSpy = jest.fn();
    mockXcodeProject = {
      pbxItemByComment: jest.fn().mockReturnValue(null),
      addBuildPhase: addBuildPhaseSpy,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates Upload Debug Symbols build phase with correct shell script', () => {
    mockXcodeProject.addBuildPhase([], 'PBXShellScriptBuildPhase', 'Upload Debug Symbols to Sentry', null, {
      shellPath: '/bin/sh',
      shellScript: expectedShellScript,
    });

    expect(addBuildPhaseSpy).toHaveBeenCalledWith(
      [],
      'PBXShellScriptBuildPhase',
      'Upload Debug Symbols to Sentry',
      null,
      {
        shellPath: '/bin/sh',
        shellScript: expectedShellScript,
      },
    );
  });

  it('does not include inputPaths to avoid circular dependency', () => {
    // We don't use inputPaths because they cause circular dependency errors in Xcode 15+
    // (see issue #5641). Instead, the bash script waits for dSYM files to be generated.
    mockXcodeProject.addBuildPhase([], 'PBXShellScriptBuildPhase', 'Upload Debug Symbols to Sentry', null, {
      shellPath: '/bin/sh',
      shellScript: expectedShellScript,
    });

    const options = getOptions();

    expect(options.inputPaths).toBeUndefined();
  });

  it('skips creating build phase if it already exists', () => {
    mockXcodeProject.pbxItemByComment = jest.fn().mockReturnValue({
      shellScript: 'existing',
    });

    expect(addBuildPhaseSpy).not.toHaveBeenCalled();
  });

  describe('Race condition handling', () => {
    it('documents why we do not use inputPaths', () => {
      // This test documents the decision NOT to use inputPaths.
      //
      // ISSUE #5288: Race condition where upload script runs before dSYM generation completes
      // ISSUE #5641: inputPaths cause circular dependency errors in Xcode 15+
      //
      // We attempted to fix #5288 by adding inputPaths to declare dependency on dSYM files:
      //   inputPaths: [
      //     '"$(DWARF_DSYM_FOLDER_PATH)/$(DWARF_DSYM_FILE_NAME)/Contents/Resources/DWARF/$(PRODUCT_NAME)"',
      //     '"$(DWARF_DSYM_FOLDER_PATH)/$(DWARF_DSYM_FILE_NAME)"',
      //   ]
      //
      // However, this caused Xcode 15+ to fail with:
      //   "Cycle inside X; building could produce unreliable results"
      //
      // The cycle occurs because:
      // 1. The target produces the dSYM as an output during linking
      // 2. The "Upload Debug Symbols" build phase (part of the same target) declares the dSYM as an input
      // 3. Xcode detects: target depends on its own output = CYCLE
      //
      // SOLUTION: Instead of using inputPaths, the bash script (sentry-xcode-debug-files.sh)
      // now waits for dSYM files to exist before uploading. This avoids the circular dependency
      // while still handling the race condition.
      //
      // See:
      // - https://github.com/getsentry/sentry-react-native/issues/5288
      // - https://github.com/getsentry/sentry-react-native/issues/5641
      // - https://developer.apple.com/forums/thread/730974

      mockXcodeProject.addBuildPhase([], 'PBXShellScriptBuildPhase', 'Upload Debug Symbols to Sentry', null, {
        shellPath: '/bin/sh',
        shellScript: expectedShellScript,
      });

      const options = getOptions();

      // Verify that inputPaths are NOT used
      expect(options.inputPaths).toBeUndefined();
      expect(options.shellPath).toBe('/bin/sh');
      expect(options.shellScript).toBe(expectedShellScript);
    });
  });
});
