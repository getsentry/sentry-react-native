jest.mock('../../src/js/profiling/debugid');

import type { Client, DebugImage, Event } from '@sentry/core';

import { debugMetaIntegration } from '../../src/js/integrations/debugmeta';
import { getDebugMetadata } from '../../src/js/profiling/debugid';

describe('Debug Meta integration', () => {
  const mockedGetDebugMetadata = getDebugMetadata as jest.MockedFunction<typeof getDebugMetadata>;

  const DEBUG_ID = '12345678-1234-1234-1234-1234567890ab';
  const IMAGE: DebugImage = {
    type: 'sourcemap',
    code_file: 'app:///index.android.bundle',
    debug_id: DEBUG_ID,
  };

  beforeEach(() => {
    mockedGetDebugMetadata.mockReset();
  });

  const runIntegration = (event: Event): Event => {
    const integration = debugMetaIntegration();
    // processEvent is synchronous for error events
    return integration.processEvent!(event, {}, {} as Client) as Event;
  };

  const errorEventWithFrame = (): Event => ({
    exception: {
      values: [{ stacktrace: { frames: [{ filename: 'app:///index.android.bundle', function: 'foo' }] } }],
    },
  });

  describe('standalone behaviour', () => {
    it('stamps debug_meta.images on error events when a Debug ID is present', () => {
      // Arrange
      mockedGetDebugMetadata.mockReturnValue([IMAGE]);

      // Act
      const event = runIntegration(errorEventWithFrame());

      // Assert
      expect(event.debug_meta?.images).toEqual([IMAGE]);
    });

    it('does not add debug_meta when no Debug ID is available', () => {
      // Arrange
      mockedGetDebugMetadata.mockReturnValue([]);

      // Act
      const event = runIntegration(errorEventWithFrame());

      // Assert
      expect(event.debug_meta).toBeUndefined();
    });

    it('skips non-error events (transactions, profiles)', () => {
      // Arrange
      mockedGetDebugMetadata.mockReturnValue([IMAGE]);

      // Act
      const event = runIntegration({ type: 'transaction' });

      // Assert
      expect(event.debug_meta).toBeUndefined();
      expect(mockedGetDebugMetadata).not.toHaveBeenCalled();
    });

    it('backs off when a frame already carries a debug_id (core matched the stack)', () => {
      // Arrange: core's applyDebugIds ran first and matched the premodule stack
      mockedGetDebugMetadata.mockReturnValue([IMAGE]);
      const event: Event = {
        exception: {
          values: [{ stacktrace: { frames: [{ filename: 'app:///index.android.bundle', debug_id: DEBUG_ID }] } }],
        },
      };

      // Act
      const processed = runIntegration(event);

      // Assert: we do not stamp; core's later applyDebugMeta will handle it
      expect(processed.debug_meta).toBeUndefined();
    });

    it('preserves unrelated pre-existing images and appends the bundle image', () => {
      // Arrange: e.g. a native linked error already added its own image
      mockedGetDebugMetadata.mockReturnValue([IMAGE]);
      const nativeImage: DebugImage = {
        type: 'macho',
        debug_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        image_addr: '0x0',
      };
      const event: Event = {
        debug_meta: { images: [nativeImage] },
        ...errorEventWithFrame(),
      };

      // Act
      const processed = runIntegration(event);

      // Assert
      expect(processed.debug_meta?.images).toEqual([nativeImage, IMAGE]);
    });
  });

  // Faithfully reproduces the core prepareEvent ordering to guard against emitting
  // a duplicate image alongside core's own stamp:
  //   applyDebugIds (sets frame.debug_id) -> event processors (this integration) -> applyDebugMeta (stamps images)
  describe('core prepareEvent pipeline ordering', () => {
    // Local stand-ins matching @sentry/core's prepareEvent behaviour. Kept in the
    // test (not imported) because core does not export them from its public entry.
    const coreApplyDebugIds = (event: Event, matchFilename: string | null): void => {
      event.exception?.values?.forEach(exception => {
        exception.stacktrace?.frames?.forEach(frame => {
          if (frame.filename && frame.filename === matchFilename) {
            frame.debug_id = DEBUG_ID;
          }
        });
      });
    };
    const coreApplyDebugMeta = (event: Event): void => {
      const map: Record<string, string> = {};
      event.exception?.values?.forEach(exception => {
        exception.stacktrace?.frames?.forEach(frame => {
          if (frame.debug_id) {
            const key = frame.abs_path || frame.filename;
            if (key) {
              map[key] = frame.debug_id;
            }
            delete frame.debug_id;
          }
        });
      });
      if (Object.keys(map).length === 0) {
        return;
      }
      event.debug_meta = event.debug_meta || {};
      event.debug_meta.images = event.debug_meta.images || [];
      Object.entries(map).forEach(([code_file, debug_id]) => {
        event.debug_meta!.images!.push({ type: 'sourcemap', code_file, debug_id });
      });
    };

    it('does not duplicate the image when core successfully matches the stack', () => {
      // Arrange
      mockedGetDebugMetadata.mockReturnValue([IMAGE]);
      const event = errorEventWithFrame();

      // Act: core matches, then our processor runs, then core stamps debug_meta
      coreApplyDebugIds(event, 'app:///index.android.bundle');
      runIntegration(event);
      coreApplyDebugMeta(event);

      // Assert: exactly one image (contributed by core, not doubled by us)
      expect(event.debug_meta?.images).toHaveLength(1);
      expect(event.debug_meta?.images?.[0]).toMatchObject({ debug_id: DEBUG_ID, type: 'sourcemap' });
    });

    it('stamps the image exactly once when core fails to match the Hermes stack', () => {
      // Arrange
      mockedGetDebugMetadata.mockReturnValue([IMAGE]);
      const event = errorEventWithFrame();

      // Act: core does not match (Hermes premodule stack); our processor fills the gap
      coreApplyDebugIds(event, null);
      runIntegration(event);
      coreApplyDebugMeta(event);

      // Assert: exactly one image, contributed by us
      expect(event.debug_meta?.images).toHaveLength(1);
      expect(event.debug_meta?.images).toEqual([IMAGE]);
    });
  });
});
