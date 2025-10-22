import * as environment from '../../src/js/utils/environment';

jest.mock('@sentry/browser', () => ({
  supabaseIntegration: jest.fn(),
}));

describe('supabase', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });


});