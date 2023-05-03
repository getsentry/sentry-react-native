import { addBreadcrumb, getCurrentHub } from '@sentry/core';
import type { SeverityLevel } from '@sentry/types';
import { logger } from '@sentry/utils';
import * as React from 'react';
import type { GestureResponderEvent} from 'react-native';
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

interface ElementInstance {
  elementType?: {
    displayName?: string;
    name?: string;
  };
  memoizedProps?: Record<string, unknown>;
  return?: ElementInstance;
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
  private _logTouchEvent(
    componentTreeNames: string[],
    activeLabel?: string
  ): void {
    const level = 'info' as SeverityLevel;
    const crumb = {
      category: this.props.breadcrumbCategory,
      data: { componentTree: componentTreeNames },
      level: level,
      message: activeLabel
        ? `Touch event within element: ${activeLabel}`
        : 'Touch event within component tree',
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
        (ignoreName instanceof RegExp && name.match(ignoreName))
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

    let activeLabel: string | undefined;
    let activeDisplayName: string | undefined;
    const componentTreeNames: string[] = [];

    while (
      currentInst &&
      // maxComponentTreeSize will always be defined as we have a defaultProps. But ts needs a check so this is here.
      this.props.maxComponentTreeSize &&
      componentTreeNames.length < this.props.maxComponentTreeSize
    ) {
      if (
        // If the loop gets to the boundary itself, break.
        currentInst.elementType?.displayName ===
        TouchEventBoundary.displayName
      ) {
        break;
      }

      const props = currentInst.memoizedProps;
      const sentryLabel =
        typeof props?.[SENTRY_LABEL_PROP_KEY] !== 'undefined'
          ? `${props[SENTRY_LABEL_PROP_KEY]}`
          : undefined;

      // For some reason type narrowing doesn't work as expected with indexing when checking it all in one go in
      // the "check-label" if sentence, so we have to assign it to a variable here first
      let labelValue;
      if (typeof this.props.labelName === 'string')
        labelValue = props?.[this.props.labelName];

      // Check the label first
      if (sentryLabel && !this._isNameIgnored(sentryLabel)) {
        if (!activeLabel) {
          activeLabel = sentryLabel;
        }
        componentTreeNames.push(sentryLabel);
      } else if (
        typeof labelValue === 'string' &&
        !this._isNameIgnored(labelValue)
      ) {
        if (!activeLabel) {
          activeLabel = labelValue;
        }
        componentTreeNames.push(labelValue);
      } else if (currentInst.elementType) {
        const { elementType } = currentInst;

        if (
          elementType.displayName &&
          !this._isNameIgnored(elementType.displayName)
        ) {
          // Check display name
          if (!activeDisplayName) {
            activeDisplayName = elementType.displayName;
          }
          componentTreeNames.push(elementType.displayName);
        }
      }

      currentInst = currentInst.return;
    }

    const finalLabel = activeLabel ?? activeDisplayName;

    if (componentTreeNames.length > 0 || finalLabel) {
      this._logTouchEvent(componentTreeNames, finalLabel);
    }

    this._tracingIntegration?.startUserInteractionTransaction({
      elementId: activeLabel,
      op: UI_ACTION_TOUCH,
    });
  }
}

/**
 * Convenience Higher-Order-Component for TouchEventBoundary
 * @param WrappedComponent any React Component
 * @param boundaryProps TouchEventBoundaryProps
 */
const withTouchEventBoundary = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  InnerComponent: React.ComponentType<any>,
  boundaryProps?: TouchEventBoundaryProps
): React.FunctionComponent => {
  const WrappedComponent: React.FunctionComponent = (props) => (
    <TouchEventBoundary {...(boundaryProps ?? {})}>
      <InnerComponent {...props} />
    </TouchEventBoundary>
  );

  WrappedComponent.displayName = 'WithTouchEventBoundary';

  return WrappedComponent;
};

export { TouchEventBoundary, withTouchEventBoundary };
