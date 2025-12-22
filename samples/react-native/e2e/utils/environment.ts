type TestGlobal = typeof globalThis & {
  E2E_TEST_INIT_TYPE: 'auto' | 'manual';
};

function getTestGlobal(): TestGlobal {
  return globalThis as TestGlobal;
}

export function setAutoInitTest(): void {
  getTestGlobal().E2E_TEST_INIT_TYPE = 'auto';
}

export function isAutoInitTest(): boolean {
  return getTestGlobal().E2E_TEST_INIT_TYPE === 'auto';
}
