import { Event, Response } from "@sentry/types";
import { NativeModules } from "react-native";

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
    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.sendEvent(event);
  }
};
