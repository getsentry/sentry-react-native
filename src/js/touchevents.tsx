import { addBreadcrumb } from "@sentry/core";
import { Severity } from "@sentry/types";
import * as React from "react";
import { StyleSheet, View } from "react-native";

// tslint:disable-next-line: interface-over-type-literal
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
   * Component displayName(s) to ignore when logging the touch event. This prevents unhelpful logs such as
   * "Touch event within element: View" where you still can't tell which View it occurred in.
   *
   * By default, only View and Text are ignored. If you pass this prop, don't forget to include them.
   */
  ignoredDisplayNames?: string[];
};

const touchEventStyles = StyleSheet.create({
  wrapperView: {
    flex: 1,
  },
});

const DEFAULT_BREADCRUMB_CATEGORY = "touch";
const DEFAULT_BREADCRUMB_TYPE = "user";
const DEFAULT_MAX_COMPONENT_TREE_SIZE = 20;
const DEFAULT_IGNORED_DISPLAY_NAMES = ["View", "Text"];

/**
 * Boundary to log breadcrumbs for interaction events.
 */
class TouchEventBoundary extends React.Component<TouchEventBoundaryProps> {
  public static displayName: string = "__Sentry.TouchEventBoundary";
  public static defaultProps: Partial<TouchEventBoundaryProps> = {
    breadcrumbCategory: DEFAULT_BREADCRUMB_CATEGORY,
    breadcrumbType: DEFAULT_BREADCRUMB_TYPE,
    ignoredDisplayNames: DEFAULT_IGNORED_DISPLAY_NAMES,
    maxComponentTreeSize: DEFAULT_MAX_COMPONENT_TREE_SIZE,
  };

  private readonly _logTouchEvent = (
    componentTreeNames: string[],
    displayName: string | null
  ): void => {
    addBreadcrumb({
      category: this.props.breadcrumbCategory,
      data: { componentTree: componentTreeNames },
      level: Severity.Info,
      message: displayName
        ? `Touch event within element: ${displayName}`
        : `Touch event within component tree`,
      type: this.props.breadcrumbType,
    });
  };

  private readonly _onTouchStart = (e: any): void => {
    /* tslint:disable: no-unsafe-any */
    if (e._targetInst) {
      let currentInst = e._targetInst;

      let displayName = null;
      const componentTreeNames = [];

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

          if (typeof currentInst.elementType.displayName === "string") {
            if (
              Array.isArray(this.props.ignoredDisplayNames) &&
              !this.props.ignoredDisplayNames.includes(
                currentInst.elementType.displayName
              )
            ) {
              displayName = currentInst.elementType.displayName;
            }

            componentTreeNames.push(currentInst.elementType.displayName);
          } else if (typeof currentInst.elementType.name === "string") {
            componentTreeNames.push(currentInst.elementType.name);
          }
        }

        currentInst = currentInst.return;
      }

      if (componentTreeNames.length > 0 || displayName) {
        this._logTouchEvent(componentTreeNames, displayName);
      }
    }
    /* tslint:enable: no-unsafe-any */
  };

  // tslint:disable-next-line: completed-docs
  public render(): React.ReactNode {
    return (
      <View
        style={touchEventStyles.wrapperView}
        onTouchStart={this._onTouchStart}
      >
        {this.props.children}
      </View>
    );
  }
}

/**
 * Convenience Higher-Order-Component for TouchEventBoundary
 * @param WrappedComponent any React Component
 * @param boundaryProps TouchEventBoundaryProps
 */
const withTouchEventBoundary = (
  // tslint:disable-next-line: variable-name
  WrappedComponent: React.ComponentType<any>,
  boundaryProps: TouchEventBoundaryProps
) => (props: any) => (
  <TouchEventBoundary {...boundaryProps}>
    {/* tslint:disable-next-line: no-unsafe-any */}
    <WrappedComponent {...props} />
  </TouchEventBoundary>
);

export { TouchEventBoundary, withTouchEventBoundary };
