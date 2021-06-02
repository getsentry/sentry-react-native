import { logger } from "@sentry/utils";

import { flush } from "../src/js/sdk";

jest.mock("@sentry/react", () => {
  const mockClient = {
    flush: jest.fn(() => Promise.resolve(true)),
  };

  return {
    getCurrentHub: jest.fn(() => ({
      getClient: jest.fn(() => mockClient),
    })),
  };
});

jest.spyOn(logger, "error");

import { getCurrentHub } from "@sentry/react";

describe("flush", () => {
  it("Calls flush on the client", async () => {
    const mockClient = getCurrentHub().getClient();

    expect(mockClient).toBeTruthy();

    if (mockClient) {
      const flushResult = await flush();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.flush).toBeCalled();
      expect(flushResult).toBe(true);
    }
  });

  it("Returns false if flush failed and logs error", async () => {
    const mockClient = getCurrentHub().getClient();

    expect(mockClient).toBeTruthy();
    if (mockClient) {
      mockClient.flush = jest.fn(() => Promise.reject());

      const flushResult = await flush();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.flush).toBeCalled();
      expect(flushResult).toBe(false);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(logger.error).toBeCalledWith("Failed to flush the event queue.");
    }
  });
});
