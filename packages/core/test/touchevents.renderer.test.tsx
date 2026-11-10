// Runs against the real Fabric renderer and event dispatch, faking only the native side.
// It fails if a React Native upgrade stops exposing the touched fiber to the boundary.

const mockParentHandles = new Map<number, unknown>();

jest.mock('react-native/src/private/webapis/dom/nodes/specs/NativeDOM', () => ({
  __esModule: true,
  default: new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'getParentNode' ? (node: FakeNode) => mockParentHandles.get(node.reactTag) ?? null : () => undefined,
    },
  ),
}));

interface FakeNode {
  reactTag: number;
  props: Record<string, unknown>;
  handle: unknown;
}

const viewConfig = {
  uiViewClassName: 'RCTView',
  validAttributes: { testID: true, 'sentry-label': true },
  bubblingEventTypes: {
    topTouchStart: { phasedRegistrationNames: { bubbled: 'onTouchStart', captured: 'onTouchStartCapture' } },
  },
  directEventTypes: {},
};

function fakeFabricUIManager(nodes: FakeNode[], onEventHandler: (handler: unknown) => void): unknown {
  const implemented: Record<string, unknown> = {
    createNode: (
      reactTag: number,
      _viewName: string,
      _rootTag: number,
      props: Record<string, unknown>,
      handle: unknown,
    ) => {
      const node = { reactTag, props, handle };
      nodes.push(node);
      return node;
    },
    appendChild: (parent: FakeNode, child: FakeNode) => {
      mockParentHandles.set(child.reactTag, parent.handle);
    },
    createChildSet: () => [],
    registerEventHandler: onEventHandler,
    unstable_DefaultEventPriority: 32,
    unstable_DiscreteEventPriority: 2,
    unstable_getCurrentEventPriority: () => 32,
  };
  return new Proxy(implemented, {
    get: (target, key: string) => (key in target ? target[key] : () => undefined),
  });
}

async function tapLeafView(enableEventTargetDispatching: boolean): Promise<unknown[]> {
  jest.resetModules();
  mockParentHandles.clear();

  const nodes: FakeNode[] = [];
  let emitEvent: (handle: unknown, type: string, payload: unknown) => void = () => undefined;
  (global as any).nativeFabricUIManager = fakeFabricUIManager(nodes, handler => {
    emitEvent = handler as typeof emitEvent;
  });

  require('react-native/src/private/featureflags/ReactNativeFeatureFlags').override({
    enableNativeEventTargetEventDispatching: () => enableEventTargetDispatching,
  });
  const registry = require('react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry');
  registry.register('View', () => viewConfig);

  const React = require('react');
  const { View } = require('react-native');
  const ReactFabric = require('react-native/Libraries/Renderer/shims/ReactFabric').default;
  const addBreadcrumb = jest.spyOn(require('@sentry/core'), 'addBreadcrumb');
  const { TouchEventBoundary } = require('../src/js/touchevents');

  await React.act(async () => {
    ReactFabric.render(
      <TouchEventBoundary {...TouchEventBoundary.defaultProps}>
        <View testID="leaf" sentry-label="pay-button" />
      </TouchEventBoundary>,
      11,
      null,
      true,
    );
  });

  const leaf = nodes.find(node => node.props.testID === 'leaf') as FakeNode;
  const touch = { identifier: 1, target: leaf.reactTag, pageX: 1, pageY: 1, locationX: 1, locationY: 1, timestamp: 1 };
  await React.act(async () => {
    emitEvent(leaf.handle, 'topTouchStart', { ...touch, touches: [touch], changedTouches: [touch] });
  });

  return addBreadcrumb.mock.calls.map(call => call[0]);
}

describe('TouchEventBoundary with the real Fabric renderer', () => {
  beforeEach(() => {
    (global as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    delete (global as any).IS_REACT_ACT_ENVIRONMENT;
    delete (global as any).nativeFabricUIManager;
    jest.restoreAllMocks();
  });

  it.each([
    ['EventTarget dispatching', true],
    ['legacy plugin dispatching', false],
  ])('records a touch breadcrumb with %s', async (_name, enableEventTargetDispatching) => {
    const breadcrumbs = await tapLeafView(enableEventTargetDispatching);

    expect(breadcrumbs).toEqual([
      expect.objectContaining({
        category: 'touch',
        message: 'Touch event within element: pay-button',
      }),
    ]);
  });
});
