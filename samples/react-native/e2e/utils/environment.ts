type TestGlobal = typeof globalThis & {
  E2E_TEST_PLATFORM: 'android' | 'ios';
};

function getTestGlobal(): TestGlobal {
  return globalThis as TestGlobal;
}

export function setAndroid(): void {
  getTestGlobal().E2E_TEST_PLATFORM = 'android';
}

export function setIOS(): void {
  getTestGlobal().E2E_TEST_PLATFORM = 'ios';
}

export function isAndroid(): boolean {
  return getTestGlobal().E2E_TEST_PLATFORM === 'android';
}

export function isIOS(): boolean {
  return getTestGlobal().E2E_TEST_PLATFORM === 'ios';
}
