import { addBreadcrumb } from "@sentry/core";
import { Severity } from "@sentry/types";
import * as React from "react";
import { StyleSheet, View } from "react-native";

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
};

const touchEventStyles = StyleSheet.create({
  wrapperView: {
    flex: 1,
  },
});

const DEFAULT_BREADCRUMB_CATEGORY = "touch";
const DEFAULT_BREADCRUMB_TYPE = "user";
const DEFAULT_MAX_COMPONENT_TREE_SIZE = 20;

interface ElementInstance {
  elementType?: {
    displayName?: string;
    name?: string;
  };
  return?: ElementInstance;
}

/**
 * Boundary to log breadcrumbs for interaction events.
 */
class TouchEventBoundary extends React.Component<TouchEventBoundaryProps> {
  public static displayName: string = "__Sentry.TouchEventBoundary";
  public static defaultProps: Partial<TouchEventBoundaryProps> = {
    breadcrumbCategory: DEFAULT_BREADCRUMB_CATEGORY,
    breadcrumbType: DEFAULT_BREADCRUMB_TYPE,
    ignoreNames: [],
    maxComponentTreeSize: DEFAULT_MAX_COMPONENT_TREE_SIZE,
  };

  /**
   *
   */
  public render(): React.ReactNode {
    return (
      <View
        style={touchEventStyles.wrapperView}
        onTouchStart={this._onTouchStart as any}
      >
        {this.props.children}
      </View>
    );
  }

  /**
   *
   */
  private _logTouchEvent(
    componentTreeNames: string[],
    displayName: string | null
  ): void {
    addBreadcrumb({
      category: this.props.breadcrumbCategory,
      data: { componentTree: componentTreeNames },
      level: Severity.Info,
      message: displayName
        ? `Touch event within element: ${displayName}`
        : `Touch event within component tree`,
      type: this.props.breadcrumbType,
    });
  }

  private _isNameIgnored = (name: string): boolean => {
    let ignoreNames = this.props.ignoreNames || [];
    // eslint-disable-next-line deprecation/deprecation
    if (this.props.ignoredDisplayNames) {
      // This is to make it compatible with prior version.
      // eslint-disable-next-line deprecation/deprecation
      ignoreNames = [...ignoreNames, ...this.props.ignoredDisplayNames];
    }

    return ignoreNames.some(
      (ignoreName: string | RegExp) =>
        (typeof ignoreName === "string" && name === ignoreName) ||
        (ignoreName instanceof RegExp && name.match(ignoreName))
    );
  };

  // Originally was going to clean the names of any HOCs as well but decided that it might hinder debugging effectively. Will leave here in case
  // private readonly _cleanName = (name: string): string =>
  //   name.replace(/.*\(/g, "").replace(/\)/g, "");

  private _onTouchStart = (e: { _targetInst?: ElementInstance }): void => {
    if (e._targetInst) {
      let currentInst: ElementInstance | undefined = e._targetInst;

      let activeDisplayName = null;
      const componentTreeNames: string[] = [];

      while (
        currentInst &&
        // maxComponentTreeSize will always be defined as we have a defaultProps. But ts needs a check so this is here.
        this.props.maxComponentTreeSize &&
        componentTreeNames.length < this.props.maxComponentTreeSize
      ) {
        if (currentInst.elementType) {
          if (
            // If the loop gets to the boundary itself, break.
            currentInst.elementType.displayName ===
            TouchEventBoundary.displayName
          ) {
            break;
          }

          if (
            typeof currentInst.elementType.displayName === "string" &&
            !this._isNameIgnored(currentInst.elementType.displayName)
          ) {
            const { displayName } = currentInst.elementType;
            if (activeDisplayName === null) {
              activeDisplayName = displayName;
            }
            componentTreeNames.push(displayName);
          } else if (
            typeof currentInst.elementType.name === "string" &&
            !this._isNameIgnored(currentInst.elementType.name)
          ) {
            componentTreeNames.push(currentInst.elementType.name);
          }
        }

        currentInst = currentInst.return;
      }

      if (componentTreeNames.length > 0 || activeDisplayName) {
        this._logTouchEvent(componentTreeNames, activeDisplayName);
      }
    }
  };
}

/**
 * Convenience Higher-Order-Component for TouchEventBoundary
 * @param WrappedComponent any React Component
 * @param boundaryProps TouchEventBoundaryProps
 */
const withTouchEventBoundary = (
  InnerComponent: React.ComponentType<any>,
  boundaryProps: TouchEventBoundaryProps
): React.FunctionComponent => {
  const WrappedComponent: React.FunctionComponent = (props) => (
    <TouchEventBoundary {...boundaryProps}>
      <InnerComponent {...props} />
    </TouchEventBoundary>
  );

  WrappedComponent.displayName = "WithTouchEventBoundary";

  return WrappedComponent;
};

export { TouchEventBoundary, withTouchEventBoundary };
