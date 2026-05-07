/* oxlint-disable eslint(max-lines) */
import type { SeverityLevel, SpanAttributeValue } from '@sentry/core';
import type { GestureResponderEvent } from 'react-native';

import { addBreadcrumb, debug, dropUndefinedKeys, getClient, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import * as React from 'react';
import { StyleSheet, View } from 'react-native';

import type { TouchedComponentInfo } from './ragetap';

import { createIntegration } from './integrations/factory';
import { DEFAULT_RAGE_TAP_THRESHOLD, DEFAULT_RAGE_TAP_TIME_WINDOW, RageTapDetector } from './ragetap';
import { MOBILE_REPLAY_INTEGRATION_NAME } from './replay/mobilereplay';
import { startUserInteractionSpan } from './tracing/integrations/userInteraction';
import { UI_ACTION_TOUCH } from './tracing/ops';
import { SPAN_ORIGIN_AUTO_INTERACTION } from './tracing/origin';

export type TouchEventBoundaryProps = {
  /**
   * The category assigned to the breadcrumb that is logged by the touch event.
   */
  breadcrumbCategory?: string;
  /**
   * The type assigned to the breadcrumb that is logged by the touch event.
   */
  breadcrumbType?: string;
  /**
   * The max number of components to display when logging a touch's component tree.
   */
  maxComponentTreeSize?: number;
  /**
   * Component name(s) to ignore when logging the touch event. This prevents unhelpful logs such as
   * "Touch event within element: View" where you still can't tell which View it occurred in.
   */
  ignoreNames?: Array<string | RegExp>;
  /**
   * Deprecated, use ignoreNames instead
   * @deprecated
   */
  ignoredDisplayNames?: Array<string | RegExp>;
  /**
   * React Node wrapped by TouchEventBoundary.
   */
  children?: React.ReactNode;
  /**
   * Label Name used to identify the touched element.
   */
  labelName?: string;
  /**
   * Custom attributes to add to user interaction spans.
   * Accepts an object with string keys and values that are strings, numbers, booleans, or arrays.
   *
   * @experimental This API is experimental and may change in future releases.
   */
  spanAttributes?: Record<string, SpanAttributeValue>;
  /**
   * Enable rage tap detection. When enabled, rapid consecutive taps on the
   * same element are detected and emitted as `ui.multiClick` breadcrumbs.
   *
   * @default true
   */
  enableRageTapDetection?: boolean;
  /**
   * Number of taps within the time window to trigger a rage tap.
   *
   * @default 3
   */
  rageTapThreshold?: number;
  /**
   * Time window in milliseconds for rage tap detection.
   *
   * @default 1000
   */
  rageTapTimeWindow?: number;
  /**
   * Extract text content from children of touched components as a label fallback.
   * Automatically disabled when Session Replay's `maskAllText` is enabled (the default)
   * to avoid leaking masked content via breadcrumbs. Set `maskAllText: false` in your
   * `mobileReplayIntegration` config to enable text extraction.
   * Per-view `Sentry.Mask` boundaries are also respected.
   * Set to `false` to opt out of text extraction entirely.
   *
   * @default true
   */
  extractTextFromChildren?: boolean;
};

const touchEventStyles = StyleSheet.create({
  wrapperView: {
    flex: 1,
  },
});

const DEFAULT_BREADCRUMB_CATEGORY = 'touch';
const DEFAULT_BREADCRUMB_TYPE = 'user';
const DEFAULT_MAX_COMPONENT_TREE_SIZE = 20;

const SENTRY_LABEL_PROP_KEY = 'sentry-label';
const SENTRY_SPAN_ATTRIBUTES_PROP_KEY = 'sentry-span-attributes';
const SENTRY_COMPONENT_PROP_KEY = 'data-sentry-component';
const SENTRY_ELEMENT_PROP_KEY = 'data-sentry-element';
const SENTRY_FILE_PROP_KEY = 'data-sentry-source-file';

const MASK_COMPONENT_NAME = 'RNSentryReplayMask';
const MAX_TEXT_LENGTH = 64;
const MAX_TEXT_EXTRACTION_DEPTH = 3;
const MAX_SIBLINGS_TO_VISIT = 5;

interface ElementInstance {
  elementType?: {
    displayName?: string;
    name?: string;
  };
  // Raw text fiber nodes store a string instead of an object
  memoizedProps?: Record<string, unknown> | string;
  return?: ElementInstance;
  child?: ElementInstance;
  sibling?: ElementInstance;
}

interface PrivateGestureResponderEvent extends GestureResponderEvent {
  _targetInst?: ElementInstance;
}

/**
 * Boundary to log breadcrumbs for interaction events.
 */
class TouchEventBoundary extends React.Component<TouchEventBoundaryProps> {
  public static displayName: string = '__Sentry.TouchEventBoundary';
  public static defaultProps: Partial<TouchEventBoundaryProps> = {
    breadcrumbCategory: DEFAULT_BREADCRUMB_CATEGORY,
    breadcrumbType: DEFAULT_BREADCRUMB_TYPE,
    ignoreNames: [],
    maxComponentTreeSize: DEFAULT_MAX_COMPONENT_TREE_SIZE,
    enableRageTapDetection: true,
    rageTapThreshold: DEFAULT_RAGE_TAP_THRESHOLD,
    rageTapTimeWindow: DEFAULT_RAGE_TAP_TIME_WINDOW,
    extractTextFromChildren: true,
  };

  public readonly name: string = 'TouchEventBoundary';

  private _rageTapDetector: RageTapDetector;

  public constructor(props: TouchEventBoundaryProps) {
    super(props);
    this._rageTapDetector = new RageTapDetector({
      enabled: props.enableRageTapDetection,
      threshold: props.rageTapThreshold,
      timeWindow: props.rageTapTimeWindow,
    });
  }

  /**
   * Registers the TouchEventBoundary as a Sentry Integration.
   */
  public componentDidMount(): void {
    const client = getClient();
    client?.addIntegration?.(createIntegration(this.name));
  }

  /**
   * Sync rage tap options when props change.
   */
  public componentDidUpdate(): void {
    this._rageTapDetector.updateOptions({
      enabled: this.props.enableRageTapDetection,
      threshold: this.props.rageTapThreshold,
      timeWindow: this.props.rageTapTimeWindow,
    });
  }

  /**
   *
   */
  public render(): React.ReactNode {
    return (
      <View
        style={touchEventStyles.wrapperView}
        // oxlint-disable-next-line typescript-eslint(no-explicit-any)
        onTouchStart={this._onTouchStart.bind(this) as any}
      >
        {this.props.children}
      </View>
    );
  }

  /**
   * Logs the touch event given the component tree names and a label.
   */
  private _logTouchEvent(touchPath: TouchedComponentInfo[], label?: string): void {
    const level = 'info' as SeverityLevel;

    const root = touchPath[0];
    if (!root) {
      debug.warn('[TouchEvents] No root component found in touch path.');
      return;
    }

    const detail = label ? label : `${root.name}${root.file ? ` (${root.file})` : ''}`;
    const crumb = {
      category: this.props.breadcrumbCategory,
      data: { path: touchPath },
      level: level,
      message: `Touch event within element: ${detail}`,
      type: this.props.breadcrumbType,
    };
    addBreadcrumb(crumb);

    debug.log(`[TouchEvents] ${crumb.message}`);
  }

  /**
   * Checks if the name is supposed to be ignored.
   */
  private _isNameIgnored(name: string): boolean {
    let ignoreNames = this.props.ignoreNames || [];
    if (this.props.ignoredDisplayNames) {
      // This is to make it compatible with prior version.
      ignoreNames = [...ignoreNames, ...this.props.ignoredDisplayNames];
    }

    return ignoreNames.some(
      (ignoreName: string | RegExp) =>
        (typeof ignoreName === 'string' && name === ignoreName) ||
        (ignoreName instanceof RegExp && name.match(ignoreName)),
    );
  }

  // Originally was going to clean the names of any HOCs as well but decided that it might hinder debugging effectively. Will leave here in case
  // private readonly _cleanName = (name: string): string =>
  //   name.replace(/.*\(/g, "").replace(/\)/g, "");

  /**
   * Traverses through the component tree when a touch happens and logs it.
   * @param e
   */
  private _onTouchStart(e: PrivateGestureResponderEvent): void {
    if (!e._targetInst) {
      return;
    }

    let currentInst: ElementInstance | undefined = e._targetInst;
    const touchPath: TouchedComponentInfo[] = [];
    const shouldExtractText = this._shouldExtractText();

    while (
      currentInst &&
      // maxComponentTreeSize will always be defined as we have a defaultProps. But ts needs a check so this is here.
      this.props.maxComponentTreeSize &&
      touchPath.length < this.props.maxComponentTreeSize
    ) {
      if (
        // If the loop gets to the boundary itself, break.
        currentInst.elementType?.displayName === TouchEventBoundary.displayName
      ) {
        break;
      }

      const info = getTouchedComponentInfo(currentInst, this.props.labelName, shouldExtractText);
      this._pushIfNotIgnored(touchPath, info);

      currentInst = currentInst.return;
    }

    const label = touchPath.find(info => info.label)?.label;
    if (touchPath.length > 0) {
      this._logTouchEvent(touchPath, label);
      this._rageTapDetector.check(touchPath, label);
    }

    const span = startUserInteractionSpan({
      elementId: label,
      op: UI_ACTION_TOUCH,
    });
    if (span) {
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_ORIGIN_AUTO_INTERACTION);

      // Apply custom attributes from sentry-span-attributes prop
      // Traverse the component tree to find custom attributes
      let instForAttributes: ElementInstance | undefined = e._targetInst;
      let customAttributes: Record<string, SpanAttributeValue> | undefined;

      while (instForAttributes) {
        if (instForAttributes.elementType?.displayName === TouchEventBoundary.displayName) {
          break;
        }

        customAttributes = getSpanAttributes(instForAttributes);
        if (customAttributes && Object.keys(customAttributes).length > 0) {
          break;
        }

        instForAttributes = instForAttributes.return;
      }

      if (customAttributes && Object.keys(customAttributes).length > 0) {
        span.setAttributes(customAttributes);
      }
    }
  }

  private _shouldExtractText(): boolean {
    if (!this.props.extractTextFromChildren) {
      return false;
    }
    const client = getClient();
    if (!client) {
      return true;
    }
    const replayIntegration = client.getIntegrationByName(MOBILE_REPLAY_INTEGRATION_NAME);
    if (replayIntegration && 'options' in replayIntegration) {
      const options = replayIntegration.options as { maskAllText?: boolean };
      if (options.maskAllText !== false) {
        return false;
      }
    }
    return true;
  }

  /**
   * Pushes the name to the componentTreeNames array if it is not ignored.
   */
  private _pushIfNotIgnored(touchPath: TouchedComponentInfo[], value: TouchedComponentInfo | undefined): boolean {
    if (!value) {
      return false;
    }

    if (!value.name && !value.label) {
      return false;
    }
    if (value.name && this._isNameIgnored(value.name)) {
      return false;
    }
    if (value.label && this._isNameIgnored(value.label)) {
      return false;
    }

    // Deduplicate same subsequent items.
    if (touchPath.length > 0 && JSON.stringify(touchPath[touchPath.length - 1]) === JSON.stringify(value)) {
      return false;
    }

    touchPath.push(value);
    return true;
  }
}

function getTouchedComponentInfo(
  currentInst: ElementInstance,
  labelKey: string | undefined,
  shouldExtractText: boolean,
): TouchedComponentInfo | undefined {
  const displayName = currentInst.elementType?.displayName;

  const props = currentInst.memoizedProps;
  if (!props || typeof props === 'string') {
    if (displayName) {
      return {
        name: displayName,
      };
    }
    return undefined;
  }

  const label = getLabelValue(props, labelKey) || (shouldExtractText ? extractTextFromFiber(currentInst) : undefined);

  return dropUndefinedKeys<TouchedComponentInfo>({
    // provided by @sentry/babel-plugin-component-annotate
    name: getComponentName(props) || displayName,
    element: getElementName(props),
    file: getFileName(props),

    label,
  });
}

function getComponentName(props: Record<string, unknown>): string | undefined {
  return (
    (typeof props[SENTRY_COMPONENT_PROP_KEY] === 'string' &&
      props[SENTRY_COMPONENT_PROP_KEY].length > 0 &&
      props[SENTRY_COMPONENT_PROP_KEY] !== 'unknown' &&
      props[SENTRY_COMPONENT_PROP_KEY]) ||
    undefined
  );
}

function getElementName(props: Record<string, unknown>): string | undefined {
  return (
    (typeof props[SENTRY_ELEMENT_PROP_KEY] === 'string' &&
      props[SENTRY_ELEMENT_PROP_KEY].length > 0 &&
      props[SENTRY_ELEMENT_PROP_KEY] !== 'unknown' &&
      props[SENTRY_ELEMENT_PROP_KEY]) ||
    undefined
  );
}

function getFileName(props: Record<string, unknown>): string | undefined {
  return (
    (typeof props[SENTRY_FILE_PROP_KEY] === 'string' &&
      props[SENTRY_FILE_PROP_KEY].length > 0 &&
      props[SENTRY_FILE_PROP_KEY] !== 'unknown' &&
      props[SENTRY_FILE_PROP_KEY]) ||
    undefined
  );
}

function getLabelValue(props: Record<string, unknown>, labelKey: string | undefined): string | undefined {
  return typeof props[SENTRY_LABEL_PROP_KEY] === 'string' && props[SENTRY_LABEL_PROP_KEY].length > 0
    ? props[SENTRY_LABEL_PROP_KEY]
    : // For some reason type narrowing doesn't work as expected with indexing when checking it all in one go in
      // the "check-label" if sentence, so we have to assign it to a variable here first
      // oxlint-disable-next-line typescript-eslint(no-unnecessary-type-assertion)
      typeof labelKey === 'string' && typeof props[labelKey] == 'string' && (props[labelKey] as string).length > 0
      ? // oxlint-disable-next-line typescript-eslint(no-unnecessary-type-assertion)
        (props[labelKey] as string)
      : undefined;
}

function getSpanAttributes(currentInst: ElementInstance): Record<string, SpanAttributeValue> | undefined {
  if (!currentInst.memoizedProps || typeof currentInst.memoizedProps === 'string') {
    return undefined;
  }

  const props = currentInst.memoizedProps;
  const attributes = props[SENTRY_SPAN_ATTRIBUTES_PROP_KEY];

  // Validate that it's an object (not null, not array)
  if (typeof attributes === 'object' && attributes !== null && !Array.isArray(attributes)) {
    return attributes as Record<string, SpanAttributeValue>;
  }

  return undefined;
}

function extractTextFromFiber(inst: ElementInstance): string | undefined {
  const parts: string[] = [];
  collectTextFromFiber(inst.child, parts, 0);
  if (parts.length === 0) {
    return undefined;
  }
  const text = parts.join(' ').trim();
  if (text.length === 0) {
    return undefined;
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return `${text.slice(0, MAX_TEXT_LENGTH)}...`;
  }
  return text;
}

function collectTextFromFiber(
  inst: ElementInstance | undefined,
  parts: string[],
  depth: number,
  siblingIndex: number = 0,
): void {
  if (!inst || depth > MAX_TEXT_EXTRACTION_DEPTH || siblingIndex >= MAX_SIBLINGS_TO_VISIT) {
    return;
  }

  if (inst.elementType?.name === MASK_COMPONENT_NAME || inst.elementType?.displayName === MASK_COMPONENT_NAME) {
    // Skip masked node's children but still visit its siblings
    collectTextFromFiber(inst.sibling, parts, depth, siblingIndex + 1);
    return;
  }

  const props = inst.memoizedProps;
  if (typeof props === 'string') {
    parts.push(props);
  } else if (typeof props?.children === 'string') {
    parts.push(props.children);
  }

  collectTextFromFiber(inst.child, parts, depth + 1, 0);
  collectTextFromFiber(inst.sibling, parts, depth, siblingIndex + 1);
}

/**
 * Convenience Higher-Order-Component for TouchEventBoundary
 * @param WrappedComponent any React Component
 * @param boundaryProps TouchEventBoundaryProps
 */
const withTouchEventBoundary = (
  // oxlint-disable-next-line typescript-eslint(no-explicit-any)
  InnerComponent: React.ComponentType<any>,
  boundaryProps?: TouchEventBoundaryProps,
): React.FunctionComponent => {
  const WrappedComponent: React.FunctionComponent = props => (
    <TouchEventBoundary {...(boundaryProps ?? {})}>
      <InnerComponent {...props} />
    </TouchEventBoundary>
  );

  WrappedComponent.displayName = 'WithTouchEventBoundary';

  return WrappedComponent;
};

export { TouchEventBoundary, withTouchEventBoundary };
