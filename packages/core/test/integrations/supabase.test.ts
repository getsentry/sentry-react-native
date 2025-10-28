import { supabaseIntegration as browserSupabaseIntegration } from '@sentry/browser';
import { supabaseIntegration } from '../../src/js';

jest.mock('@sentry/browser', () => ({
  supabaseIntegration: jest.fn(),
}));

function createMockClient() {
  return {
    init: jest.fn(),
  };
}

describe('supabase', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  // this test is sufficient to test the integration because everything else
  // is covered by the integration tests in the @sentry/browser package
  it('passes React Native options to browserSupabaseIntegration', () => {
    const mockClient = createMockClient();
    supabaseIntegration({ supabaseClient: mockClient });

    expect(browserSupabaseIntegration).toHaveBeenCalledWith({
      supabaseClient: mockClient,
    });
  });
});
