import * as core from "@sentry/core";
import { Severity } from "@sentry/types";

import { TouchEventBoundary } from "../src/js/touchevents";

const addBreadcrumb = jest.spyOn(core, "addBreadcrumb");

afterEach(() => {
  jest.resetAllMocks();
});

describe("TouchEventBoundary._onTouchStart", () => {
  it("tree without displayName", () => {
    const { defaultProps } = TouchEventBoundary;
    const boundary = new TouchEventBoundary(defaultProps);

    const event = {
      _targetInst: {
        elementType: {
          name: "View",
        },
        return: {
          elementType: {
            name: "Text",
          },
          return: {
            elementType: {
              name: "CoolComponent",
            },
            return: {
              elementType: {
                name: "Screen",
              },
            },
          },
        },
      },
    };

    // @ts-ignore
    boundary._onTouchStart(event);

    expect(addBreadcrumb).toBeCalledWith({
      category: defaultProps.breadcrumbCategory,
      data: {
        componentTree: ["View", "Text", "CoolComponent", "Screen"],
      },
      level: Severity.Info,
      message: "Touch event within component tree",
      type: defaultProps.breadcrumbType,
    });
  });

  it("displayName is displayed", () => {
    const { defaultProps } = TouchEventBoundary;
    const boundary = new TouchEventBoundary(defaultProps);

    const event = {
      _targetInst: {
        elementType: {
          name: "View",
        },
        return: {
          elementType: {
            name: "Text",
          },
          return: {
            elementType: {
              displayName: "Connect(View)",
            },
          },
        },
      },
    };

    // @ts-ignore
    boundary._onTouchStart(event);

    expect(addBreadcrumb).toBeCalledWith({
      category: defaultProps.breadcrumbCategory,
      data: {
        componentTree: ["View", "Text", "Connect(View)"],
      },
      level: Severity.Info,
      message: "Touch event within element: Connect(View)",
      type: defaultProps.breadcrumbType,
    });
  });

  it("ignoreNames", () => {
    const { defaultProps } = TouchEventBoundary;
    const boundary = new TouchEventBoundary({
      ...defaultProps,
      ignoreNames: ["View", /^Connect\(/, new RegExp("^Happy\\(")],
    });

    const event = {
      _targetInst: {
        elementType: {
          name: "View",
        },
        return: {
          elementType: {
            name: "Text",
          },
          return: {
            elementType: {
              displayName: "Connect(View)",
            },
            return: {
              elementType: {
                displayName: "Styled(View)",
              },
              return: {
                elementType: {
                  displayName: "Happy(View)",
                },
              },
            },
          },
        },
      },
    };

    // @ts-ignore
    boundary._onTouchStart(event);

    expect(addBreadcrumb).toBeCalledWith({
      category: defaultProps.breadcrumbCategory,
      data: {
        componentTree: ["Text", "Styled(View)"],
      },
      level: Severity.Info,
      message: "Touch event within element: Styled(View)",
      type: defaultProps.breadcrumbType,
    });
  });

  it("maxComponentTreeSize", () => {
    const { defaultProps } = TouchEventBoundary;
    const boundary = new TouchEventBoundary({
      ...defaultProps,
      maxComponentTreeSize: 3,
    });

    const event = {
      _targetInst: {
        elementType: {
          name: "View",
        },
        return: {
          elementType: {
            name: "Text",
          },
          return: {
            elementType: {
              displayName: "Connect(View)",
            },
            return: {
              elementType: {
                displayName: "Styled(View)",
              },
              return: {
                elementType: {
                  displayName: "Happy(View)",
                },
              },
            },
          },
        },
      },
    };

    // @ts-ignore
    boundary._onTouchStart(event);

    expect(addBreadcrumb).toBeCalledWith({
      category: defaultProps.breadcrumbCategory,
      data: {
        componentTree: ["View", "Text", "Connect(View)"],
      },
      level: Severity.Info,
      message: "Touch event within element: Connect(View)",
      type: defaultProps.breadcrumbType,
    });
  });
});
