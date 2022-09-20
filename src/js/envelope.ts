import {
  EventEnvelope,
  EventEnvelopeHeaders,
  UserFeedback,
  UserFeedbackItem,
} from '@sentry/types';
import { createEnvelope } from '@sentry/utils';

/**
 * Creates an envelope from a user feedback.
 */
export function createUserFeedbackEnvelope(
  feedback: UserFeedback
): EventEnvelope {
  const headers: EventEnvelopeHeaders = {
    event_id: feedback.event_id, // not sure feedback.event_id is correct
    sent_at: new Date().toISOString(),
  };
  const item = createUserFeedbackEnvelopeItem(feedback);

  return createEnvelope(headers, [item]);
}

function createUserFeedbackEnvelopeItem(
  feedback: UserFeedback
): UserFeedbackItem {
  const feedbackHeaders: UserFeedbackItem[0] = {
    type: 'user_report',
  };
  return [feedbackHeaders, feedback];
}
