import { Scope } from '@sentry/core';
import type { Attachment, Breadcrumb, User } from '@sentry/types';

import { DEFAULT_BREADCRUMB_LEVEL } from './breadcrumb';
import { convertToNormalizedObject } from './utils/normalize';
import { NATIVE } from './wrapper';

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
    Object.keys(tags).forEach(key => {
      NATIVE.setTag(key, tags[key]);
    });
    return super.setTags(tags);
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public setExtras(extras: { [key: string]: any }): this {
    Object.keys(extras).forEach(key => {
      NATIVE.setExtra(key, extras[key]);
    });
    return super.setExtras(extras);
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-explicit-any
  public setExtra(key: string, extra: any): this {
    NATIVE.setExtra(key, extra);
    return super.setExtra(key, extra);
  }

  /**
   * @inheritDoc
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): this {
    const mergedBreadcrumb: Breadcrumb = {
      ...breadcrumb,
      level: breadcrumb.level || DEFAULT_BREADCRUMB_LEVEL,
      data: breadcrumb.data ? convertToNormalizedObject(breadcrumb.data) : undefined,
    };

    super.addBreadcrumb(mergedBreadcrumb, maxBreadcrumbs);

    const finalBreadcrumb = this._breadcrumbs[this._breadcrumbs.length - 1];
    NATIVE.addBreadcrumb(finalBreadcrumb);
    return this;
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
  public setContext(key: string, context: { [key: string]: any } | null): this {
    NATIVE.setContext(key, context);
    return super.setContext(key, context);
  }

  /**
   * @inheritDoc
   */
  public addAttachment(attachment: Attachment): this {
    return super.addAttachment(attachment);
  }

  /**
   * @inheritDoc
   */
  public clearAttachments(): this {
    return super.clearAttachments();
  }
}
