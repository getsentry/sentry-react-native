import { Scope } from "@sentry/hub";
import { Breadcrumb, User } from "@sentry/types";

import { NATIVE } from "./wrapper";

type SerializeableValue = string | number | boolean
type SerializeableMap = { [key: string]: SerializeableValue }

/**
 * Extends the scope methods to set scope on the Native SDKs
 */
export class ReactNativeScope extends Scope {
  /**
   * @inheritDoc
   */
  public setUser(user: User | null): this {
    NATIVE.setUser(user);
    return super.setUser(user);
  }

  /**
   * @inheritDoc
   */
  public setTag(key: string, value: string): this {
    NATIVE.setTag(key, value);
    return super.setTag(key, value);
  }

  /**
   * @inheritDoc
   */
  public setTags(tags: { [key: string]: string }): this {
    // As native only has setTag, we just loop through each tag key.
    Object.keys(tags).forEach((key) => {
      NATIVE.setTag(key, tags[key]);
    });
    return super.setTags(tags);
  }

  /**
   * @inheritDoc
   */
  public setExtras(extras: SerializeableMap): this {
    Object.keys(extras).forEach((key) => {
      NATIVE.setExtra(key, extras[key]);
    });
    return super.setExtras(extras);
  }

  /**
   * @inheritDoc
   */
  public setExtra(key: string, extra: SerializeableValue): this {
    NATIVE.setExtra(key, extra);
    return super.setExtra(key, extra);
  }

  /**
   * @inheritDoc
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): this {
    NATIVE.addBreadcrumb(breadcrumb);
    return super.addBreadcrumb(breadcrumb, maxBreadcrumbs);
  }

  /**
   * @inheritDoc
   */
  public clearBreadcrumbs(): this {
    NATIVE.clearBreadcrumbs();
    return super.clearBreadcrumbs();
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public setContext(key: string, context: SerializeableMap | null): this {
    NATIVE.setContext(key, context);
    return super.setContext(key, context);
  }
}
