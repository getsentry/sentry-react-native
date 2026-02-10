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

  it('does not include inputPaths in options before fix', () => {
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

  it('includes inputPaths with escaped quotes to avoid pbxproj serialization issues', () => {
    mockXcodeProject.addBuildPhase([], 'PBXShellScriptBuildPhase', 'Upload Debug Symbols to Sentry', null, {
      shellPath: '/bin/sh',
      shellScript: expectedShellScript,
      inputPaths: [
        '"$(DWARF_DSYM_FOLDER_PATH)/$(DWARF_DSYM_FILE_NAME)/Contents/Resources/DWARF/$(PRODUCT_NAME)"',
        '"$(DWARF_DSYM_FOLDER_PATH)/$(DWARF_DSYM_FILE_NAME)"',
      ],
    });

    const options = getOptions();

    expect(options.inputPaths).toBeDefined();
    expect(options.inputPaths).toHaveLength(2);
  });

  it('inputPaths values are wrapped in escaped quotes', () => {
    mockXcodeProject.addBuildPhase([], 'PBXShellScriptBuildPhase', 'Upload Debug Symbols to Sentry', null, {
      shellPath: '/bin/sh',
      shellScript: expectedShellScript,
      inputPaths: [
        '"$(DWARF_DSYM_FOLDER_PATH)/$(DWARF_DSYM_FILE_NAME)/Contents/Resources/DWARF/$(PRODUCT_NAME)"',
        '"$(DWARF_DSYM_FOLDER_PATH)/$(DWARF_DSYM_FILE_NAME)"',
      ],
    });

    const options = getOptions();

    // Verify paths are wrapped in quotes to prevent pbxproj corruption
    expect(options.inputPaths[0]).toMatch(/^".*"$/);
    expect(options.inputPaths[1]).toMatch(/^".*"$/);
    expect(options.inputPaths[0]).toBe(
      '"$(DWARF_DSYM_FOLDER_PATH)/$(DWARF_DSYM_FILE_NAME)/Contents/Resources/DWARF/$(PRODUCT_NAME)"',
    );
    expect(options.inputPaths[1]).toBe('"$(DWARF_DSYM_FOLDER_PATH)/$(DWARF_DSYM_FILE_NAME)"');
  });
});
