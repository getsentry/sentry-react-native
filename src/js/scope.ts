import { Scope } from "@sentry/hub";
import { Breadcrumb, User } from "@sentry/types";
import { timestampWithMs } from "@sentry/utils";

import { NATIVE } from "./wrapper";

export class ReactNativeScope extends Scope {
  /**
   * @inheritDoc
   */
  public setUser(user: User | null): this {
    this._user = user || {};

    NATIVE.setUser(user);

    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setTag(key: string, value: string): this {
    this._tags = { ...this._tags, [key]: value };
    this._notifyScopeListeners();

    // Stringify the value as user could pass other types such as a number which would crash native.
    NATIVE.setTag(key, String(value));

    return this;
  }

  /**
   * @inheritDoc
   */
  public setTags(tags: { [key: string]: string }): this {
    this._tags = {
      ...this._tags,
      ...tags
    };
    this._notifyScopeListeners();

    // As native only has setTag, we just loop through each tag key.
    Object.keys(tags).forEach((key) => {
      // Stringify the value as user could pass other types such as a number which would crash native.
      NATIVE.setTag(key, String(tags[key]));
    });

    return this;
  }

  /**
   * @inheritDoc
   */
  public setExtras(extras: { [key: string]: any }): this {
    this._extra = {
      ...this._extra,
      ...extras
    };

    Object.keys(extras).forEach((key) => {
      NATIVE.setExtra(key, extras[key]);
    });

    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setExtra(key: string, extra: any): this {
    this._extra = { ...this._extra, [key]: extra };

    NATIVE.setExtra(key, extra);

    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): this {
    const mergedBreadcrumb = {
      timestamp: timestampWithMs(),
      ...breadcrumb
    };

    this._breadcrumbs =
      maxBreadcrumbs !== undefined && maxBreadcrumbs >= 0
        ? [...this._breadcrumbs, mergedBreadcrumb].slice(-maxBreadcrumbs)
        : [...this._breadcrumbs, mergedBreadcrumb];

    NATIVE.addBreadcrumb(breadcrumb);

    this._notifyScopeListeners();
    return this;
  }

  // /**
  //  * @inheritDoc
  //  */
  // public setFingerprint(fingerprint: string[]): this {
  //   this._fingerprint = fingerprint;

  //   NATIVE.setFingerprint(fingerprint);

  //   this._notifyScopeListeners();
  //   return this;
  // }
}
