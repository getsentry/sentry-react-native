import { isHardCrash } from '../src/js/misc';

describe('misc', () => {
  describe('isHardCrash', () => {
    test('undefined exception is not a hard crash', () => {
      expect(isHardCrash({})).toBe(false);
    });
    test('undefined mechanism is not a hard crash', () => {
      expect(
        isHardCrash({
          exception: {
            values: [{}],
          },
        }),
      ).toBe(false);
    });
    test('handled true is not a hard crash', () => {
      expect(
        isHardCrash({
          exception: {
            values: [
              {
                mechanism: {
                  handled: true,
                  type: 'test',
                },
              },
            ],
          },
        }),
      ).toBe(false);
    });
    test('any handled false is a hard crash', () => {
      expect(
        isHardCrash({
          exception: {
            values: [
              {},
              {
                mechanism: {
                  handled: false,
                  type: 'test',
                },
              },
              {
                mechanism: {
                  handled: true,
                  type: 'test',
                },
              },
            ],
          },
        }),
      ).toBe(true);
    });
  });
});
