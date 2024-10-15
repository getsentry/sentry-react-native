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
