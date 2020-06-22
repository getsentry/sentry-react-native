import { addBreadcrumb } from "@sentry/core";
import { Breadcrumb, Severity } from "@sentry/types";
import * as React from "react";
import { StyleSheet, View } from "react-native";

// tslint:disable-next-line: interface-over-type-literal
export type InteractionEventBoundaryProps = {
  breadcrumbCategory?: string;
  breadcrumbType?: string;
};

// tslint:disable-next-line: interface-over-type-literal
type InteractionEventBoundaryDefaultProps = {
  breadcrumbCategory: string;
  breadcrumbType: string;
};

const interactionEventStyles = StyleSheet.create({
  wrapperView: {
    flex: 1,
  },
});

const DEFAULT_BREADCRUMB_CATEGORY = "touch";
const DEFAULT_BREADCRUMB_TYPE = "user";

const DEFAULT_ELEMENT_DISPLAY_NAMES = ["View", "Text"];

/**
 * Boundary to log breadcrumbs for interaction events.
 */
class InteractionEventBoundary extends React.Component<
  InteractionEventBoundaryProps
> {
  public static defaultProps: InteractionEventBoundaryDefaultProps = {
    breadcrumbCategory: DEFAULT_BREADCRUMB_CATEGORY,
    breadcrumbType: DEFAULT_BREADCRUMB_TYPE,
  };

  private readonly _logInteraction = (displayName: string): void => {
    const breadcrumb: Breadcrumb = {
      category: this.props.breadcrumbCategory,
      type: this.props.breadcrumbType,
      level: Severity.Info,
      message: `Touch event within element: ${displayName}`,
    };

    addBreadcrumb(breadcrumb);
  };

  private readonly _onTouchStart = (e: any): void => {
    /* tslint:disable: no-unsafe-any */
    if (e._targetInst) {
      let currentInst = e._targetInst;
      let name = null;

      /* While there is an instance, and props do not contain the elementIdKey, we keep moving up the instance
        tree to its parent until we find one with the prop key defined. We also fallback to accessibilityLabel. */
      while (currentInst) {
        if (
          currentInst.elementType &&
          typeof currentInst.elementType.displayName === "string" &&
          !DEFAULT_ELEMENT_DISPLAY_NAMES.includes(
            currentInst.elementType.displayName
          )
        ) {
          name = currentInst.elementType.displayName;
          break;
        }

        currentInst = currentInst.return;
      }

      if (name !== null) {
        this._logInteraction(name);
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
