/*
import { BrowserBackend } from '@sentry/browser/types/backend'; //BREAKCHANGE: Get this from
import { BaseBackend, NoopTransport } from '@sentry/core';
import { BrowserOptions, Transports } from '@sentry/react';
import { Event, EventHint, SeverityLevel, Transport } from '@sentry/types';
// @ts-ignore LogBox introduced in RN 0.63
import { Alert, LogBox, YellowBox } from 'react-native';

import { ReactNativeOptions } from './options';
import { NativeTransport } from './transports/native';
import { NATIVE } from './wrapper';

/** The Sentry ReactNative SDK Backend. */
/*
export class ReactNativeBackend extends BaseBackend<BrowserOptions> {
  private readonly _browserBackend: BrowserBackend;

  /** Creates a new ReactNative backend instance. */
/*
  public constructor(protected readonly _options: ReactNativeOptions) {
    super(_options);
    this._browserBackend = new BrowserBackend(_options);

    // This is a workaround for now using fetch on RN, this is a known issue in react-native and only generates a warning
    // YellowBox deprecated and replaced with with LogBox in RN 0.63
    if (LogBox) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      LogBox.ignoreLogs(['Require cycle:']);
    } else {
      // eslint-disable-next-line deprecation/deprecation
      YellowBox.ignoreWarnings(['Require cycle:']);
    }
  }

}
*/
