import { getRNSentryOnDrawReporter } from '../../src/js/tracing/timetodisplaynative';
import * as Environment from '../../src/js/utils/environment';

describe('timetodisplaynative', () => {
  beforeEach(() => {
    jest.spyOn(Environment, 'isExpoGo').mockReturnValue(false);
  });

  test('getRNSentryOnDrawReporter returns Noop in Expo Go', () => {
    jest.spyOn(Environment, 'isExpoGo').mockReturnValue(true);
    const drawReported = getRNSentryOnDrawReporter();

    expect(drawReported.name).toBe('RNSentryOnDrawReporterNoop');
  });
});
