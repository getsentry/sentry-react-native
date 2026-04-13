import { debug, getClient, setCurrentClient } from '@sentry/core';
import { act, render, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { Appearance, Text } from 'react-native';

import { defaultConfiguration } from '../../src/js/feedback/defaults';
import {
  hideFeedbackButton,
  resetFeedbackButtonManager,
  resetFeedbackFormManager,
  showFeedbackButton,
  showFeedbackForm,
} from '../../src/js/feedback/FeedbackFormManager';
import { FeedbackFormProvider } from '../../src/js/feedback/FeedbackFormProvider';
import { feedbackIntegration } from '../../src/js/feedback/integration';
import {
  AUTO_INJECT_FEEDBACK_BUTTON_INTEGRATION_NAME,
  AUTO_INJECT_FEEDBACK_INTEGRATION_NAME,
} from '../../src/js/feedback/lazy';
import { isModalSupported } from '../../src/js/feedback/utils';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

jest.mock('../../src/js/feedback/utils', () => ({
  isModalSupported: jest.fn(),
  isNativeDriverSupportedForColorAnimations: jest.fn().mockReturnValue(true),
}));

const consoleWarnSpy = jest.spyOn(console, 'warn');

const mockedIsModalSupported = isModalSupported as jest.MockedFunction<typeof isModalSupported>;

beforeEach(() => {
  debug.error = jest.fn();
});

describe('FeedbackFormManager', () => {
  beforeEach(() => {
    const client = new TestClient(getDefaultTestClientOptions());
    setCurrentClient(client);
    client.init();
    consoleWarnSpy.mockReset();
    resetFeedbackFormManager();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('showFeedbackForm displays the form when FeedbackFormProvider is used', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { getByText, getByTestId } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    await act(async () => {
      showFeedbackForm();
    });

    expect(getByTestId('feedback-form-modal')).toBeTruthy();
    expect(getByText('App Components')).toBeTruthy();
  });

  it('showFeedbackForm does not display the form when Modal is not available', async () => {
    mockedIsModalSupported.mockReturnValue(false);
    const { getByText, queryByTestId } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    await act(async () => {
      showFeedbackForm();
    });

    expect(queryByTestId('feedback-form-modal')).toBeNull();
    expect(getByText('App Components')).toBeTruthy();
    expect(debug.error).toHaveBeenLastCalledWith(
      'FeedbackForm Modal is not supported in React Native < 0.71 with Fabric renderer.',
    );
  });

  it('showFeedbackForm does not throw an error when FeedbackFormProvider is not used', () => {
    expect(() => {
      showFeedbackForm();
    }).not.toThrow();
  });

  it('showFeedbackForm displays the form with the feedbackIntegration options', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { getByPlaceholderText, getByText } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    const integration = feedbackIntegration({
      messagePlaceholder: 'Custom Message Placeholder',
      submitButtonLabel: 'Custom Submit Button',
    });
    getClient()?.addIntegration(integration);

    await act(async () => {
      showFeedbackForm();
    });

    await waitFor(() => {
      expect(getByPlaceholderText('Custom Message Placeholder')).toBeTruthy();
    });
    expect(getByText('Custom Submit Button')).toBeTruthy();
  });

  it('showFeedbackForm displays the form with the feedbackIntegration options merged with the defaults', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { getByPlaceholderText, getByText, queryByText } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    const integration = feedbackIntegration({
      submitButtonLabel: 'Custom Submit Button',
    });
    getClient()?.addIntegration(integration);

    await act(async () => {
      showFeedbackForm();
    });

    await waitFor(() => {
      expect(queryByText(defaultConfiguration.submitButtonLabel)).toBeFalsy(); // overridden value
      expect(getByText('Custom Submit Button')).toBeTruthy(); // overridden value
    });
    expect(getByPlaceholderText(defaultConfiguration.messagePlaceholder)).toBeTruthy(); // default configuration value
  });

  it('showFeedbackForm warns about missing feedback provider', async () => {
    mockedIsModalSupported.mockReturnValue(true);

    await act(async () => {
      showFeedbackForm();
    });

    expect(consoleWarnSpy).toHaveBeenLastCalledWith(
      "[Sentry] FeedbackForm requires 'Sentry.wrap(RootComponent)' to be called before 'showFeedbackForm()'.",
    );
  });

  it('showFeedbackForm does not warn about missing feedback provider when FeedbackFormProvider is used', () => {
    mockedIsModalSupported.mockReturnValue(true);

    render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    showFeedbackForm();

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('showFeedbackForm adds the feedbackIntegration to the client', () => {
    mockedIsModalSupported.mockReturnValue(true);

    showFeedbackForm();

    expect(getClient().getIntegrationByName(AUTO_INJECT_FEEDBACK_INTEGRATION_NAME)).toBeDefined();
  });
});

describe('FeedbackButtonManager', () => {
  let listener: (preferences: Appearance.AppearancePreferences) => void;

  afterEach(() => {
    jest.resetAllMocks();
  });

  beforeEach(() => {
    const client = new TestClient(getDefaultTestClientOptions());
    setCurrentClient(client);
    client.init();
    consoleWarnSpy.mockReset();
    resetFeedbackButtonManager();

    jest.spyOn(Appearance, 'addChangeListener').mockImplementation(cb => {
      listener = cb;
      return { remove: jest.fn() };
    });
  });

  it('showFeedbackButton displays the button when FeedbackFormProvider is used', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { getByText } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    await act(async () => {
      showFeedbackForm();
    });

    await waitFor(() => {
      expect(getByText('Report a Bug')).toBeTruthy();
    });
  });

  it('hideFeedbackButton hides the button', () => {
    const { queryByText } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    showFeedbackButton();
    hideFeedbackButton();

    expect(queryByText('Report a Bug')).toBeNull();
  });

  it('showFeedbackButton does not throw an error when FeedbackFormProvider is not used', () => {
    expect(() => {
      showFeedbackButton();
    }).not.toThrow();
  });

  it('showFeedbackButton warns about missing feedback provider', () => {
    showFeedbackButton();

    expect(consoleWarnSpy).toHaveBeenLastCalledWith(
      "[Sentry] FeedbackButton requires 'Sentry.wrap(RootComponent)' to be called before 'showFeedbackButton()'.",
    );
  });

  it('showFeedbackButton does not warn about missing feedback provider when FeedbackFormProvider is used', () => {
    render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    showFeedbackButton();

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('showFeedbackButton adds the feedbackIntegration to the client', () => {
    showFeedbackButton();

    expect(getClient().getIntegrationByName(AUTO_INJECT_FEEDBACK_BUTTON_INTEGRATION_NAME)).toBeDefined();
  });

  it('the Feedback Form matches the snapshot with default configuration and system light theme', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { toJSON } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');

    await act(async () => {
      showFeedbackForm();
    });

    expect(toJSON()).toMatchSnapshot();
  });

  it('the Feedback Form matches the snapshot with default configuration and system dark theme', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { toJSON } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');

    await act(async () => {
      showFeedbackForm();
    });

    expect(toJSON()).toMatchSnapshot();
  });

  it('the Feedback Form matches the snapshot with default configuration and dynamically changed theme', async () => {
    const component = (
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>
    );

    mockedIsModalSupported.mockReturnValue(true);
    const { toJSON } = render(component);

    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');

    await act(async () => {
      showFeedbackForm();
    });

    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');
    await act(async () => {
      listener({ colorScheme: 'dark' });
    });

    expect(toJSON()).toMatchSnapshot();
  });

  it('the Feedback Form matches the snapshot with custom light theme', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { toJSON } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    const integration = feedbackIntegration({
      colorScheme: 'light',
      themeLight: {
        foreground: '#ff0000',
        background: '#00ff00',
      },
    });
    getClient()?.addIntegration(integration);

    await act(async () => {
      showFeedbackForm();
    });

    expect(toJSON()).toMatchSnapshot();
  });

  it('the Feedback Form matches the snapshot with custom dark theme', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { toJSON } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    const integration = feedbackIntegration({
      colorScheme: 'dark',
      themeDark: {
        foreground: '#00ff00',
        background: '#ff0000',
      },
    });
    getClient()?.addIntegration(integration);

    await act(async () => {
      showFeedbackForm();
    });

    expect(toJSON()).toMatchSnapshot();
  });

  it('the Feedback Form matches the snapshot with system light custom theme', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { toJSON } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    const integration = feedbackIntegration({
      colorScheme: 'system',
      themeLight: {
        foreground: '#ff0000',
        background: '#00ff00',
      },
    });
    getClient()?.addIntegration(integration);

    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');

    await act(async () => {
      showFeedbackForm();
    });

    expect(toJSON()).toMatchSnapshot();
  });

  it('the Feedback Form matches the snapshot with system dark custom theme', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { toJSON } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    const integration = feedbackIntegration({
      colorScheme: 'system',
      themeDark: {
        foreground: '#00ff00',
        background: '#ff0000',
      },
    });
    getClient()?.addIntegration(integration);

    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');

    await act(async () => {
      showFeedbackForm();
    });

    expect(toJSON()).toMatchSnapshot();
  });

  it('the Feedback Button matches the snapshot with default configuration and system light theme', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { toJSON } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');

    await act(async () => {
      showFeedbackButton();
    });

    expect(toJSON()).toMatchSnapshot();
  });

  it('the Feedback Button matches the snapshot with default configuration and system dark theme', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { toJSON } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');

    await act(async () => {
      showFeedbackButton();
    });

    expect(toJSON()).toMatchSnapshot();
  });

  it('the Feedback Button matches the snapshot with default configuration and dynamically changed theme', async () => {
    const component = (
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>
    );

    mockedIsModalSupported.mockReturnValue(true);
    const { toJSON } = render(component);

    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');

    await act(async () => {
      showFeedbackButton();
    });

    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');
    await act(async () => {
      listener({ colorScheme: 'dark' });
    });

    expect(toJSON()).toMatchSnapshot();
  });

  it('the Feedback Button matches the snapshot with custom light theme', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { toJSON } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    const integration = feedbackIntegration({
      colorScheme: 'light',
      themeLight: {
        foreground: '#ff0000',
        background: '#00ff00',
      },
    });
    getClient()?.addIntegration(integration);

    await act(async () => {
      showFeedbackButton();
    });

    expect(toJSON()).toMatchSnapshot();
  });

  it('the Feedback Button matches the snapshot with custom dark theme', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { toJSON } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    const integration = feedbackIntegration({
      colorScheme: 'dark',
      themeDark: {
        foreground: '#00ff00',
        background: '#ff0000',
      },
    });
    getClient()?.addIntegration(integration);

    await act(async () => {
      showFeedbackButton();
    });

    expect(toJSON()).toMatchSnapshot();
  });

  it('the Feedback Button matches the snapshot with system light custom theme', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { toJSON } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    const integration = feedbackIntegration({
      colorScheme: 'system',
      themeLight: {
        foreground: '#ff0000',
        background: '#00ff00',
      },
    });
    getClient()?.addIntegration(integration);

    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');

    await act(async () => {
      showFeedbackButton();
    });

    expect(toJSON()).toMatchSnapshot();
  });

  it('the Feedback Button matches the snapshot with system dark custom theme', async () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { toJSON } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>,
    );

    const integration = feedbackIntegration({
      colorScheme: 'system',
      themeDark: {
        foreground: '#00ff00',
        background: '#ff0000',
      },
    });
    getClient()?.addIntegration(integration);

    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');

    await act(async () => {
      showFeedbackButton();
    });

    expect(toJSON()).toMatchSnapshot();
  });
});
