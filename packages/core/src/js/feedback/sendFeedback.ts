import type { Event, EventHint, SendFeedback, SendFeedbackParams, TransportMakeRequestResponse } from '@sentry/core';
import { captureFeedback, getClient, logger } from '@sentry/core';

const FEEDBACK_WIDGET_SOURCE = 'widget';
const FEEDBACK_RESPONSE_TIMEOUT = 5_000;

/**
 * Sends feedback to Sentry using Sentry.captureFeedback and waits for the response.
 */
export const sendFeedback: SendFeedback = (
  params: SendFeedbackParams,
  hint: EventHint & { includeReplay?: boolean } = { includeReplay: true },
): Promise<string> => {
  const client = getClient();
  if (!client) {
    throw new Error('No client setup, cannot send feedback.');
  }

  const eventId = captureFeedback(
    {
      source: FEEDBACK_WIDGET_SOURCE,
      ...params,
    },
    hint,
  );

  logger.debug('Feedback captured with Event ID:', eventId);

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      logger.error('Feedback submission timed out.');
      reject('Unable to determine if Feedback was correctly sent.');
    }, FEEDBACK_RESPONSE_TIMEOUT);

    const cleanup = client.on('afterSendEvent', (event: Event, response: TransportMakeRequestResponse) => {
      if (event.event_id !== eventId) {
        return;
      }

      clearTimeout(timeout);
      cleanup();

      if (event.type === 'feedback') {
        logger.debug('Feedback detected as sent with eventId:', eventId);
        resolve(eventId);
      } else {
        logger.error('Unexpected response status:', response?.statusCode);
        reject('Unable to send Feedback due to unexpected issues.');
      }
    });
  });
};
