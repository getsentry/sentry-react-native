import { render } from '@testing-library/react-native';
import * as React from 'react';

import { SentryPlayground } from '../../src/js/playground/modal';

describe('PlaygroundComponent', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('matches the snapshot with no props', () => {
    const { toJSON } = render(<SentryPlayground />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('matches the snapshot with project id and organization slug', () => {
    const { toJSON } = render(<SentryPlayground projectId="test-project-1234" organizationSlug="test-org-slug-1234" />);
    expect(toJSON()).toMatchSnapshot();
  });
});
