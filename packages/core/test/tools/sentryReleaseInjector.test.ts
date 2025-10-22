import type { MixedOutput, Module, ReadOnlyGraph } from 'metro';
import { unstableReleaseConstantsPlugin } from '../../src/js/tools/sentryReleaseInjector';

const mockedExpoConfigRequire = jest.fn();

jest.mock('@expo/config', () => ({
  getConfig: mockedExpoConfigRequire,
}));

describe('Sentry Release Injector', () => {
  beforeEach(() => {
    mockedExpoConfigRequire.mockReturnValue({
      exp: {
        name: 'TestApp',
        version: '1.0.0',
      },
    });
  });

  test('unstableReleaseConstantsPlugin returns premodules if not web', () => {
    const projectRoot = '/some/project/root';
    const graph = {
      transformOptions: { platform: 'ios' },
    } as unknown as ReadOnlyGraph<MixedOutput>;
    const premodules = [{ path: 'someModule.js' }] as Module[];

    const plugin = unstableReleaseConstantsPlugin(projectRoot);
    const result = plugin({ graph, premodules: [...premodules] });

    expect(result).toEqual(premodules);
  });

  test('unstableReleaseConstantsPlugin returns premodules with Sentry release constants if web', () => {
    const projectRoot = '/some/project/root';
    const graph = {
      transformOptions: { platform: 'web' },
    } as unknown as ReadOnlyGraph<MixedOutput>;
    const premodules = [{ path: 'someModule.js' }] as Module[];

    const plugin = unstableReleaseConstantsPlugin(projectRoot);
    const result = plugin({ graph, premodules });

    expect(result.length).toBe(premodules.length + 1);
    expect(result[0]?.path).toBe('__sentryReleaseConstants__');
    expect(result[0]?.getSource().toString()).toEqual(
      'var SENTRY_RELEASE;SENTRY_RELEASE={name: "TestApp", version: "1.0.0"};',
    );
  });
});
