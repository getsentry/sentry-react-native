import { addBreadcrumb } from "@sentry/core";
import { Breadcrumb, Severity } from "@sentry/types";
import * as React from "react";
import { StyleSheet, View } from "react-native";

// tslint:disable-next-line: interface-over-type-literal
export type InteractionEventBoundaryProps = {
  breadcrumbCategory?: string;
  elementIdKey?: string;
};

// tslint:disable-next-line: interface-over-type-literal
type InteractionEventBoundaryDefaultProps = {
  breadcrumbCategory: string;
  elementIdKey: string;
};

const interactionEventStyles = StyleSheet.create({
  wrapperView: {
    flex: 1,
  },
});

const DEFAULT_BREADCRUMB_CATEGORY = "interaction";
const DEFAULT_ELEMENT_ID_KEY = "sentryID";

/**
 * Boundary to log breadcrumbs for interaction events.
 */
class InteractionEventBoundary extends React.Component<
  InteractionEventBoundaryProps
> {
  public static defaultProps: InteractionEventBoundaryDefaultProps = {
    breadcrumbCategory: DEFAULT_BREADCRUMB_CATEGORY,
    elementIdKey: DEFAULT_ELEMENT_ID_KEY,
  };

  private readonly _logInteraction = (
    elementId: string,
    source: "elementIdKey" | "accessibilityLabel"
  ): void => {
    const breadcrumb: Breadcrumb = {
      category: this.props.breadcrumbCategory,
      level: Severity.Info,
      message:
        source === "elementIdKey"
          ? `Touch event within element: ${elementId}`
          : `Touch event within element with accessibilityLabel: ${elementId}`,
    };

    addBreadcrumb(breadcrumb);
  };

  private readonly _onTouchStart = (e: any): void => {
    /* tslint:disable: no-unsafe-any */
    if (e._targetInst && this.props.elementIdKey) {
      let currentInst = e._targetInst;

      /* While there is an instance, and props do not contain the elementIdKey, we keep moving up the instance
        tree to its parent until we find one with the prop key defined. We also fallback to accessibilityLabel. */
      while (currentInst) {
        if (
          currentInst.memoizedProps &&
          (typeof currentInst.memoizedProps[this.props.elementIdKey] !==
            "undefined" ||
            typeof currentInst.memoizedProps.accessibilityLabel !== "undefined")
        ) {
          break;
        }

        currentInst = currentInst.return;
      }

      if (currentInst && currentInst.memoizedProps) {
        if (
          typeof currentInst.memoizedProps[this.props.elementIdKey] !==
          "undefined"
        ) {
          this._logInteraction(
            currentInst.memoizedProps[this.props.elementIdKey],
            "elementIdKey"
          );
        } else if (
          typeof currentInst.memoizedProps.accessibilityLabel !== "undefined"
        ) {
          this._logInteraction(
            currentInst.memoizedProps.accessibilityLabel,
            "accessibilityLabel"
          );
        }
      }
    }
    /* tslint:enable: no-unsafe-any */
  };

  // tslint:disable-next-line: completed-docs
  public render(): React.ReactNode {
    return (
      <View
        style={interactionEventStyles.wrapperView}
        onTouchStart={this._onTouchStart}
      >
        {this.props.children}
      </View>
    );
  }
}

/**
 * Convenience Higher-Order-Component for InteractionEventBoundary
 * @param WrappedComponent any React Component
 * @param boundaryProps InteractionEventBoundaryProps
 */
const withInteractionEventBoundary = (
  // tslint:disable-next-line: variable-name
  WrappedComponent: React.ComponentType<any>,
  boundaryProps: InteractionEventBoundaryProps
) => (props: any) => (
  <InteractionEventBoundary {...boundaryProps}>
    {/* tslint:disable-next-line: no-unsafe-any */}
    <WrappedComponent {...props} />
  </InteractionEventBoundary>
);

export { InteractionEventBoundary, withInteractionEventBoundary };
