import { warnOnce } from '../../plugin/src/logger';
import { modifyExistingXcodeBuildScript } from '../../plugin/src/withSentryIOS';

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
