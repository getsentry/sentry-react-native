import { Scope } from '@sentry/core';
import * as SentryCore from '@sentry/core';

import { turboModuleContextIntegration } from '../../src/js/integrations/turboModuleContext';
import * as turboModule from '../../src/js/turbomodule';
import * as wrapper from '../../src/js/wrapper';

describe('turboModuleContextIntegration', () => {
  let scope: Scope;

  beforeEach(() => {
    scope = new Scope();
    jest.spyOn(SentryCore, 'getCurrentScope').mockReturnValue(scope);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('wraps the live RNSentry TurboModule on setup', () => {
    const fakeModule = {
      addListener: jest.fn(),
      removeListeners: jest.fn(),
      crash: jest.fn(),
    };
    jest.spyOn(wrapper, 'getRNSentryModule').mockReturnValue(fakeModule as never);

    const wrapSpy = jest.spyOn(turboModule, 'wrapTurboModule');

    turboModuleContextIntegration().setupOnce!();

    expect(wrapSpy).toHaveBeenCalledWith('RNSentry', fakeModule, {
      skip: ['addListener', 'removeListeners'],
    });
  });

  it('wraps additional modules supplied via options', () => {
    jest.spyOn(wrapper, 'getRNSentryModule').mockReturnValue(undefined);

    const fakeOther = { run: jest.fn() };
    const wrapSpy = jest.spyOn(turboModule, 'wrapTurboModule');

    turboModuleContextIntegration({
      modules: [{ name: 'Other', module: fakeOther, skipMethods: ['ignored'] }],
    }).setupOnce!();

    expect(wrapSpy).toHaveBeenCalledWith('Other', fakeOther, { skip: ['ignored'] });
  });

  it('tolerates a missing RNSentry module', () => {
    jest.spyOn(wrapper, 'getRNSentryModule').mockReturnValue(undefined);

    expect(() => turboModuleContextIntegration().setupOnce!()).not.toThrow();
  });
});
