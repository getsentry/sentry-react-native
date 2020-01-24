import { Event, Response } from "@sentry/types";
import { NativeModules, Platform } from "react-native";

const { RNSentry } = NativeModules;

/**
 * Our internal interface for calling native functions
 */
export const NATIVE = {
  /**
   * Sending the event over the bridge to native
   * @param event Event
   */
  sendEvent(event: Event): PromiseLike<Response> {
    if (NATIVE.platform === "android") {
      const header = JSON.stringify({ event_id: event.event_id });

      (event as any).message = {
        message: event.message
      };
      const payload = JSON.stringify(event);
      const item = JSON.stringify({
        content_type: "application/json",
        length: payload.length,
        type: "event"
      });
      const envelope = `${header}\n${item}\n${payload}`;
      // tslint:disable-next-line: no-unsafe-any
      return RNSentry.captureEnvelope(envelope);
    }
    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.sendEvent(event);
  },

  platform: Platform.OS
};
