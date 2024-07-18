import { addBreadcrumb, getCurrentHub } from '@sentry/core';
import type { SeverityLevel } from '@sentry/types';
import { dropUndefinedKeys, logger } from '@sentry/utils';
import * as React from 'react';
import type { GestureResponderEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { createIntegration } from './integrations/factory';
import { ReactNativeTracing } from './tracing';
import { UI_ACTION_TOUCH } from './tracing/ops';

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
const SENTRY_COMPONENT_PROP_KEY = 'data-sentry-component';
const SENTRY_ELEMENT_PROP_KEY = 'data-sentry-element';
const SENTRY_FILE_PROP_KEY = 'data-sentry-source-file';

interface ElementInstance {
  elementType?: {
    displayName?: string;
    name?: string;
  };
  memoizedProps?: Record<string, unknown>;
  return?: ElementInstance;
}

interface TouchedComponentInfo {
  name?: string;
  label?: string;
  element?: string;
  file?: string;
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
  };

  public readonly name: string = 'TouchEventBoundary';

  private _tracingIntegration: ReactNativeTracing | null = null;

  /**
   * Registers the TouchEventBoundary as a Sentry Integration.
   */
  public componentDidMount(): void {
    const client = getCurrentHub().getClient();
    client?.addIntegration?.(createIntegration(this.name));
    if (!this._tracingIntegration && client) {
      this._tracingIntegration = client.getIntegration(ReactNativeTracing);
    }
  }

  /**
   *
   */
  public render(): React.ReactNode {
    return (
      <View
        style={touchEventStyles.wrapperView}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const detail = label ? label : `${root.name}${root.file ? ` (${root.file})` : ''}`;

    const crumb = {
      category: this.props.breadcrumbCategory,
      data: { path: touchPath },
      level: level,
      message: `Touch event within element: ${detail}`,
      type: this.props.breadcrumbType,
    };
    addBreadcrumb(crumb);

    logger.log(`[TouchEvents] ${crumb.message}`);
  }

  /**
   * Checks if the name is supposed to be ignored.
   */
  private _isNameIgnored(name: string): boolean {
    let ignoreNames = this.props.ignoreNames || [];
    // eslint-disable-next-line deprecation/deprecation
    if (this.props.ignoredDisplayNames) {
      // This is to make it compatible with prior version.
      // eslint-disable-next-line deprecation/deprecation
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
  // eslint-disable-next-line complexity
  private _onTouchStart(e: PrivateGestureResponderEvent): void {
    if (!e._targetInst) {
      return;
    }

    let currentInst: ElementInstance | undefined = e._targetInst;
    const touchPath: TouchedComponentInfo[] = [];

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

      const info = getTouchedComponentInfo(currentInst, this.props.labelName);
      this._pushIfNotIgnored(touchPath, info);

      currentInst = currentInst.return;
    }

    const label = touchPath.find(info => info.label)?.label;
    if (touchPath.length > 0) {
      this._logTouchEvent(touchPath, label);
    }

    this._tracingIntegration?.startUserInteractionTransaction({
      elementId: label,
      op: UI_ACTION_TOUCH,
    });
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

function getTouchedComponentInfo(currentInst: ElementInstance, labelKey: string | undefined): TouchedComponentInfo | undefined {
  const displayName = currentInst.elementType?.displayName;

  const props = currentInst.memoizedProps;
  if (!props) {
    // Early return if no props are available, as we can't extract any useful information
    if (displayName) {
      return {
        name: displayName,
      };
    }
    return undefined;
  }

  return dropUndefinedKeys<TouchedComponentInfo>({
    // provided by @sentry/babel-plugin-component-annotate
    name: getComponentName(props) || displayName,
    element: getElementName(props),
    file: getFileName(props),

    // `sentry-label` or user defined label key
    label: getLabelValue(props, labelKey),
  });
}

function getComponentName(props: Record<string, unknown>): string | undefined {
  return typeof props[SENTRY_COMPONENT_PROP_KEY] === 'string' &&
    props[SENTRY_COMPONENT_PROP_KEY].length > 0 &&
    props[SENTRY_COMPONENT_PROP_KEY] !== 'unknown' &&
    props[SENTRY_COMPONENT_PROP_KEY] || undefined;
}

function getElementName(props: Record<string, unknown>): string | undefined {
  return typeof props[SENTRY_ELEMENT_PROP_KEY] === 'string' &&
    props[SENTRY_ELEMENT_PROP_KEY].length > 0 &&
    props[SENTRY_ELEMENT_PROP_KEY] !== 'unknown' &&
    props[SENTRY_ELEMENT_PROP_KEY] || undefined;
}

function getFileName(props: Record<string, unknown>): string | undefined {
  return typeof props[SENTRY_FILE_PROP_KEY] === 'string' &&
    props[SENTRY_FILE_PROP_KEY].length > 0 &&
    props[SENTRY_FILE_PROP_KEY] !== 'unknown' &&
    props[SENTRY_FILE_PROP_KEY] || undefined;
}

function getLabelValue(props: Record<string, unknown>, labelKey: string | undefined): string | undefined {
  return typeof props[SENTRY_LABEL_PROP_KEY] === 'string' && props[SENTRY_LABEL_PROP_KEY].length > 0
    ? props[SENTRY_LABEL_PROP_KEY] as string
    // For some reason type narrowing doesn't work as expected with indexing when checking it all in one go in
    // the "check-label" if sentence, so we have to assign it to a variable here first
    : typeof labelKey === 'string' && typeof props[labelKey] == 'string' && (props[labelKey] as string).length > 0
      ? props[labelKey] as string
      : undefined;
}

/**
 * Convenience Higher-Order-Component for TouchEventBoundary
 * @param WrappedComponent any React Component
 * @param boundaryProps TouchEventBoundaryProps
 */
const withTouchEventBoundary = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
