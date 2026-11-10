import type * as TimeToDisplayNative from '../../src/js/tracing/timetodisplaynative';

import { getRNSentryOnDrawReporter } from '../../src/js/tracing/timetodisplaynative';
import * as Environment from '../../src/js/utils/environment';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';

describe('timetodisplaynative', () => {
  beforeEach(() => {
    jest.spyOn(Environment, 'isExpoGo').mockReturnValue(false);
  });

  test('getRNSentryOnDrawReporter returns Noop in Expo Go', () => {
    jest.spyOn(Environment, 'isExpoGo').mockReturnValue(true);
    const drawReported = getRNSentryOnDrawReporter();

    expect(drawReported.name).toBe('RNSentryOnDrawReporterNoop');
  });

  describe('getRNSentryOnDrawReporter with a mocked native registry', () => {
    const mockInteropComponent = jest.fn();
    const mockStaticComponent = jest.fn();
    const mockRequireNativeComponent = jest.fn(() => mockInteropComponent);
    const mockNativeComponentRegistryGet = jest.fn(() => mockStaticComponent);

    const loadModule = (isRegistered: boolean): typeof TimeToDisplayNative => {
      jest.doMock('../../src/js/utils/environment', () => ({ isExpoGo: () => false }));
      jest.doMock('react-native/Libraries/NativeComponent/NativeComponentRegistry', () => ({
        get: mockNativeComponentRegistryGet,
      }));
      jest.doMock('react-native', () => ({
        Platform: { OS: 'ios', constants: {} },
        UIManager: { hasViewManagerConfig: () => isRegistered },
        View: jest.fn(),
        requireNativeComponent: mockRequireNativeComponent,
      }));

      return require('../../src/js/tracing/timetodisplaynative');
    };

    beforeEach(() => {
      jest.resetModules();
      mockRequireNativeComponent.mockClear();
      mockNativeComponentRegistryGet.mockClear();
    });

    afterEach(() => {
      delete RN_GLOBAL_OBJ.RN$Bridgeless;
      delete RN_GLOBAL_OBJ.RN$LegacyInterop_UIManager_getConstants;
      jest.dontMock('../../src/js/utils/environment');
      jest.dontMock('react-native/Libraries/NativeComponent/NativeComponentRegistry');
      jest.dontMock('react-native');
    });

    it('uses the native view config on the Old Architecture', () => {
      const { getRNSentryOnDrawReporter: getReporter } = loadModule(true);

      const reporter = getReporter();

      expect(reporter).toBe(mockInteropComponent);
      expect(mockRequireNativeComponent).toHaveBeenCalledWith('RNSentryOnDrawReporter');
      expect(mockNativeComponentRegistryGet).not.toHaveBeenCalled();
    });

    it('uses the native view config while legacy interop is available', () => {
      RN_GLOBAL_OBJ.RN$Bridgeless = true;
      RN_GLOBAL_OBJ.RN$LegacyInterop_UIManager_getConstants = jest.fn();
      const { getRNSentryOnDrawReporter: getReporter } = loadModule(true);

      const reporter = getReporter();

      expect(reporter).toBe(mockInteropComponent);
      expect(mockRequireNativeComponent).toHaveBeenCalledWith('RNSentryOnDrawReporter');
      expect(mockNativeComponentRegistryGet).not.toHaveBeenCalled();
    });

    it('uses a static view config when legacy interop is removed', () => {
      RN_GLOBAL_OBJ.RN$Bridgeless = true;
      const { getRNSentryOnDrawReporter: getReporter } = loadModule(true);

      const reporter = getReporter();

      expect(reporter).toBe(mockStaticComponent);
      expect(mockRequireNativeComponent).not.toHaveBeenCalled();
      expect(mockNativeComponentRegistryGet).toHaveBeenCalledTimes(1);
      const [componentName, viewConfigProvider] = mockNativeComponentRegistryGet.mock.calls[0] as unknown as [
        string,
        () => unknown,
      ];
      expect(componentName).toBe('RNSentryOnDrawReporter');
      expect(viewConfigProvider()).toEqual({
        uiViewClassName: 'RNSentryOnDrawReporter',
        validAttributes: { initialDisplay: true, fullDisplay: true, parentSpanId: true },
      });
    });

    it('returns Noop when the component is not registered', () => {
      const { getRNSentryOnDrawReporter: getReporter } = loadModule(false);

      const reporter = getReporter();

      expect(reporter.name).toBe('RNSentryOnDrawReporterNoop');
      expect(mockRequireNativeComponent).not.toHaveBeenCalled();
      expect(mockNativeComponentRegistryGet).not.toHaveBeenCalled();
    });
  });
});
