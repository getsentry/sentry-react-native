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
  async sendEvent(event: Event): Promise<Response> {
    if (NATIVE.platform === "android") {
      const header = JSON.stringify({ event_id: event.event_id });

      (event as any).message = {
        message: event.message
      };
      const payload = JSON.stringify(event);
      let length = payload.length;
      try {
        // tslint:disable-next-line: no-unsafe-any
        length = await RNSentry.getStringBytesLength(payload);
      } catch {
        // The native call failed, we do nothing, we have payload.length as a fallback
      }
      const item = JSON.stringify({
        content_type: "application/json",
        length,
        type: "event"
      });
      const envelope = `${header}\n${item}\n${payload}`;
      // tslint:disable-next-line: no-unsafe-any
      return RNSentry.captureEnvelope(envelope);
    }
    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.sendEvent(event);
  },

  /**
   * Triggers a native crash.
   * Use this only for testing purposes.
   */
  crash(): void {
    if (this.isModuleLoaded()) {
      // tslint:disable-next-line: no-unsafe-any
      RNSentry.crash();
    }
  },

  /**
   * Checks whether the RNSentry module is loaded.
   */
  isModuleLoaded(): boolean {
    return !!RNSentry;
  },

  platform: Platform.OS
};
