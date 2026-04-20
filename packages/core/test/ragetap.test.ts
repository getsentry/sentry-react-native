import * as core from '@sentry/core';

import { RageTapDetector } from '../src/js/ragetap';

describe('RageTapDetector', () => {
  let addBreadcrumb: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    addBreadcrumb = jest.spyOn(core, 'addBreadcrumb');
    jest.spyOn(Date, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('emits ui.multiClick breadcrumb after 3 taps on same label', () => {
    const detector = new RageTapDetector();
    const path = [{ name: 'Button', label: 'submit' }];

    detector.check(path, 'submit');
    detector.check(path, 'submit');
    detector.check(path, 'submit');

    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'ui.multiClick',
        level: 'warning',
        type: 'default',
        message: 'submit',
        data: expect.objectContaining({
          clickCount: 3,
          metric: true,
          path,
          node: expect.objectContaining({
            tagName: 'Button',
            attributes: expect.objectContaining({
              'data-sentry-component': 'Button',
              'sentry-label': 'submit',
            }),
          }),
        }),
      }),
    );
  });

  it('does not emit for taps on different targets', () => {
    const detector = new RageTapDetector();

    detector.check([{ name: 'A', label: 'a' }], 'a');
    detector.check([{ name: 'B', label: 'b' }], 'b');
    detector.check([{ name: 'A', label: 'a' }], 'a');

    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it('does not emit when taps are outside the time window', () => {
    const detector = new RageTapDetector();
    const path = [{ name: 'Button', label: 'ok' }];
    const nowMock = jest.spyOn(Date, 'now');

    nowMock.mockReturnValue(1000);
    detector.check(path, 'ok');

    nowMock.mockReturnValue(1500);
    detector.check(path, 'ok');

    // Third tap is beyond 1000ms from the first
    nowMock.mockReturnValue(2500);
    detector.check(path, 'ok');

    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it('resets buffer after rage tap is detected', () => {
    const detector = new RageTapDetector();
    const path = [{ name: 'Button', label: 'ok' }];

    // Trigger rage tap
    detector.check(path, 'ok');
    detector.check(path, 'ok');
    detector.check(path, 'ok');
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);

    // Two more taps should NOT re-trigger (buffer was reset)
    detector.check(path, 'ok');
    detector.check(path, 'ok');
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    const detector = new RageTapDetector({ enabled: false });
    const path = [{ name: 'Button', label: 'ok' }];

    detector.check(path, 'ok');
    detector.check(path, 'ok');
    detector.check(path, 'ok');

    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it('respects custom threshold', () => {
    const detector = new RageTapDetector({ threshold: 5 });
    const path = [{ name: 'Button', label: 'ok' }];

    for (let i = 0; i < 4; i++) {
      detector.check(path, 'ok');
    }
    expect(addBreadcrumb).not.toHaveBeenCalled();

    detector.check(path, 'ok');
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clickCount: 5 }),
      }),
    );
  });

  it('respects custom time window', () => {
    const detector = new RageTapDetector({ timeWindow: 500 });
    const path = [{ name: 'Button', label: 'ok' }];
    const nowMock = jest.spyOn(Date, 'now');

    nowMock.mockReturnValue(1000);
    detector.check(path, 'ok');

    nowMock.mockReturnValue(1200);
    detector.check(path, 'ok');

    // 600ms after first tap — outside 500ms window
    nowMock.mockReturnValue(1600);
    detector.check(path, 'ok');

    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it('uses component name+file as identity when no label', () => {
    const detector = new RageTapDetector();
    const path = [{ name: 'SubmitButton', file: 'form.tsx' }];

    detector.check(path);
    detector.check(path);
    detector.check(path);

    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'SubmitButton (form.tsx)',
        data: expect.objectContaining({
          node: expect.objectContaining({
            tagName: 'SubmitButton',
            attributes: expect.objectContaining({
              'data-sentry-component': 'SubmitButton',
              'data-sentry-source-file': 'form.tsx',
            }),
          }),
        }),
      }),
    );
  });

  it('treats same name but different files as different targets', () => {
    const detector = new RageTapDetector();

    detector.check([{ name: 'Button', file: 'a.tsx' }]);
    detector.check([{ name: 'Button', file: 'b.tsx' }]);
    detector.check([{ name: 'Button', file: 'a.tsx' }]);

    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it('does nothing for empty touch path', () => {
    const detector = new RageTapDetector();

    detector.check([]);
    detector.check([]);
    detector.check([]);

    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it('can trigger again after buffer reset and enough new taps', () => {
    const detector = new RageTapDetector();
    const path = [{ name: 'Button', label: 'ok' }];

    // First rage tap
    detector.check(path, 'ok');
    detector.check(path, 'ok');
    detector.check(path, 'ok');
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);

    // Three more taps → second rage tap
    detector.check(path, 'ok');
    detector.check(path, 'ok');
    detector.check(path, 'ok');
    expect(addBreadcrumb).toHaveBeenCalledTimes(2);
  });
});
