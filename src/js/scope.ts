import { Scope } from "@sentry/hub";

import { NATIVE } from "./wrapper";

export class ReactNativeScope extends Scope {
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
  public setTag(key: string, value: string): this {
    this._tags = { ...this._tags, [key]: value };
    this._notifyScopeListeners();

    // Stringify the value as user could pass other types such as a number which would crash native.
    NATIVE.setTag(key, String(value));

    return this;
  }
}
