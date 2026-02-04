import { warnOnce } from '../../plugin/src/utils';
import { modifyExistingXcodeBuildScript } from '../../plugin/src/withSentryIOS';

jest.mock('../../plugin/src/utils');

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
    const expectedShellScript = '/bin/sh `${NODE_BINARY:-node} --print "require(\'path\').dirname(require.resolve(\'@sentry/react-native/package.json\')) + \'/scripts/sentry-xcode-debug-files.sh\'"`';

    mockXcodeProject.addBuildPhase(
      [],
      'PBXShellScriptBuildPhase',
      'Upload Debug Symbols to Sentry',
      null,
      {
        shellPath: '/bin/sh',
        shellScript: expectedShellScript,
      }
    );

    expect(addBuildPhaseSpy).toHaveBeenCalledWith(
      [],
      'PBXShellScriptBuildPhase',
      'Upload Debug Symbols to Sentry',
      null,
      {
        shellPath: '/bin/sh',
        shellScript: expectedShellScript,
      }
    );
  });

  it('does not include inputPaths in current implementation', () => {
    const expectedShellScript = '/bin/sh `${NODE_BINARY:-node} --print "require(\'path\').dirname(require.resolve(\'@sentry/react-native/package.json\')) + \'/scripts/sentry-xcode-debug-files.sh\'"`';

    mockXcodeProject.addBuildPhase(
      [],
      'PBXShellScriptBuildPhase',
      'Upload Debug Symbols to Sentry',
      null,
      {
        shellPath: '/bin/sh',
        shellScript: expectedShellScript,
      }
    );

    const callArgs = addBuildPhaseSpy.mock.calls[0];
    const options = callArgs[4];

    expect(options.inputPaths).toBeUndefined();
  });

  it('skips creating build phase if it already exists', () => {
    mockXcodeProject.pbxItemByComment = jest.fn().mockReturnValue({
      shellScript: 'existing',
    });

    expect(addBuildPhaseSpy).not.toHaveBeenCalled();
  });
});
