import { addGlobalEventProcessor, getCurrentHub } from "@sentry/core";
import { EventProcessor } from "@sentry/types";

import { Release } from "../../src/js/integrations/release";

jest.mock("@sentry/core", () => {
  const client = {
    getOptions: jest.fn(),
  };

  const hub = {
    getClient: () => client,
    getIntegration: () => Release,
  };

  return {
    addGlobalEventProcessor: jest.fn(),
    getCurrentHub: () => hub,
  };
});

jest.mock("../../src/js/wrapper", () => ({
  NATIVE: {
    fetchRelease: async () => ({
      build: "native_build",
      id: "native_id",
      version: "native_version",
    }),
  },
}));

describe("Tests the Release integration", () => {
  test("Uses release from native SDK if release/dist are not present in options.", async () => {
    const releaseIntegration = new Release();

    let eventProcessor: EventProcessor = () => null;
    // @ts-expect-error
    // tslint:disable-next-line: no-unsafe-any
    addGlobalEventProcessor.mockImplementation((e) => (eventProcessor = e));
    releaseIntegration.setupOnce();

    expect(addGlobalEventProcessor).toBeCalled();

    const client = getCurrentHub().getClient();
    // @ts-expect-error
    // tslint:disable-next-line: no-unsafe-any
    client.getOptions.mockImplementation(() => ({}));

    const event = await eventProcessor({});

    expect(event?.release).toBe(`native_id@native_version+native_build`);
    expect(event?.dist).toBe("native_build");
  });

  test("Uses release and dist from options", async () => {
    const releaseIntegration = new Release();

    let eventProcessor: EventProcessor = () => null;
    // @ts-expect-error
    // tslint:disable-next-line: no-unsafe-any
    addGlobalEventProcessor.mockImplementation((e) => (eventProcessor = e));
    releaseIntegration.setupOnce();

    expect(addGlobalEventProcessor).toBeCalled();

    const client = getCurrentHub().getClient();
    // @ts-expect-error
    // tslint:disable-next-line: no-unsafe-any
    client.getOptions.mockImplementation(() => ({
      dist: "options_dist",
      release: "options_release",
    }));

    const event = await eventProcessor({});

    expect(event?.release).toBe("options_release");
    expect(event?.dist).toBe("options_dist");
  });

  test("Uses __sentry_release and __sentry_dist over everything else.", async () => {
    const releaseIntegration = new Release();

    let eventProcessor: EventProcessor = () => null;
    // @ts-expect-error
    // tslint:disable-next-line: no-unsafe-any
    addGlobalEventProcessor.mockImplementation((e) => (eventProcessor = e));
    releaseIntegration.setupOnce();

    expect(addGlobalEventProcessor).toBeCalled();

    const client = getCurrentHub().getClient();
    // @ts-expect-error
    // tslint:disable-next-line: no-unsafe-any
    client.getOptions.mockImplementation(() => ({
      dist: "options_dist",
      release: "options_release",
    }));

    const event = await eventProcessor({
      extra: {
        __sentry_dist: "sentry_dist",
        __sentry_release: "sentry_release",
      },
    });

    expect(event?.release).toBe("sentry_release");
    expect(event?.dist).toBe("sentry_dist");
  });
});
