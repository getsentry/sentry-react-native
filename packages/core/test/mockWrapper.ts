import { type NATIVE as ORIGINAL_NATIVE } from '../src/js/wrapper';
import type { MockInterface } from './testutils';

type NativeType = typeof ORIGINAL_NATIVE;

const NATIVE: MockInterface<NativeType> = {
  enableNative: true,
  nativeIsReady: true,
  platform: 'ios',

  _NativeClientError: new Error('MockNative client is not available'),
  _DisabledNativeError: new Error('MockNative is disabled'),

  _processItem: jest.fn(),
  _processLevels: jest.fn(),
  _processLevel: jest.fn(),
  _serializeObject: jest.fn(),
  _isModuleLoaded: <NativeType['_isModuleLoaded'] & jest.Mock>jest.fn(),

  isNativeAvailable: jest.fn(),

  initNativeSdk: jest.fn(),
  closeNativeSdk: jest.fn(),

  sendEnvelope: jest.fn(),
  captureScreenshot: jest.fn(),

  fetchNativeRelease: jest.fn(),
  fetchNativeDeviceContexts: jest.fn(),
  fetchNativeAppStart: jest.fn(),
  fetchNativeFrames: jest.fn(),
  fetchNativeSdkInfo: jest.fn(),

  disableNativeFramesTracking: jest.fn(),
  enableNativeFramesTracking: jest.fn(),

  addBreadcrumb: jest.fn(),
  setContext: jest.fn(),
  clearBreadcrumbs: jest.fn(),
  setExtra: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),

  nativeCrash: jest.fn(),

  fetchModules: jest.fn(),
  fetchViewHierarchy: jest.fn(),

  startProfiling: jest.fn(),
  stopProfiling: jest.fn(),

  fetchNativePackageName: jest.fn(),
  fetchNativeStackFramesBy: jest.fn(),

  initNativeReactNavigationNewFrameTracking: jest.fn(),

  captureReplay: jest.fn(),
  getCurrentReplayId: jest.fn(),

  crashedLastRun: jest.fn(),
  getNewScreenTimeToDisplay: jest.fn(),
  getDataFromUri: jest.fn(),
  popTimeToDisplayFor: jest.fn(),
  setActiveSpanId: jest.fn(),
  encodeToBase64: jest.fn(),
};

NATIVE.isNativeAvailable.mockReturnValue(true);
NATIVE.initNativeSdk.mockResolvedValue(true);
NATIVE.captureScreenshot.mockResolvedValue(null);
NATIVE.fetchNativeRelease.mockResolvedValue({
  version: 'mock-native-version',
  build: 'mock-native-build',
  id: 'mock-native-id',
});
NATIVE.fetchNativeDeviceContexts.mockResolvedValue({});
NATIVE.fetchNativeAppStart.mockResolvedValue(null);
NATIVE.fetchNativeFrames.mockResolvedValue(null);
NATIVE.fetchNativeSdkInfo.mockResolvedValue(null);
NATIVE.fetchModules.mockResolvedValue(null);
NATIVE.fetchViewHierarchy.mockResolvedValue(null);
NATIVE.startProfiling.mockReturnValue(false);
NATIVE.stopProfiling.mockReturnValue(null);
NATIVE.fetchNativePackageName.mockReturnValue('mock-native-package-name');
NATIVE.fetchNativeStackFramesBy.mockReturnValue(null);
NATIVE.initNativeReactNavigationNewFrameTracking.mockReturnValue(Promise.resolve());
NATIVE.captureReplay.mockResolvedValue(null);
NATIVE.getCurrentReplayId.mockReturnValue(null);
NATIVE.crashedLastRun.mockResolvedValue(false);
NATIVE.popTimeToDisplayFor.mockResolvedValue(null);
NATIVE.getNewScreenTimeToDisplay.mockResolvedValue(null);

export const getRNSentryModule = jest.fn();

export { NATIVE };
