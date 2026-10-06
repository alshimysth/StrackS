/**
 * Tabs layout: onboarding comes first (#82), even before resuming an orphan session
 * (PR #85 review).
 */
import { render, waitFor } from '@testing-library/react-native';
import React from 'react';

import TabsLayout from '../(tabs)/_layout';
import { useOnboarding } from '../../core/onboarding/onboarding';

const mockRecover = jest.fn();
const mockReplace = jest.fn();
const mockRedirects: string[] = [];

// The tab navigator comes from `expo-router/js-tabs` since SDK 56; only its presence matters
// here, so both stand-ins render nothing.
jest.mock('expo-router/js-tabs', () => {
  const Tabs = () => null;
  Tabs.Screen = () => null;
  return { Tabs };
});
jest.mock('expo-router', () => {
  return {
    Redirect: ({ href }: { href: string }) => {
      mockRedirects.push(href);
      return null;
    },
    useRouter: () => ({ replace: (...a: unknown[]) => mockReplace(...a) }),
  };
});
jest.mock('../../core/auth/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ token: 'jwt' }),
}));
jest.mock('../../core/session/use-session-store', () => ({
  useSessionStore: { getState: () => ({ recover: () => mockRecover() }) },
}));
jest.mock('../../core/gps/position', () => ({ hasForegroundPermission: jest.fn().mockResolvedValue(false) }));
jest.mock('../../design-system/use-theme', () => ({
  useTheme: () => jest.requireActual('../../design-system/theme').lightTheme,
}));

beforeEach(() => {
  mockRedirects.length = 0;
  mockRecover.mockResolvedValue(true); // an orphan session exists
});

it('sends to onboarding without resuming the session until it is completed', async () => {
  useOnboarding.setState({ status: 'pending' });
  await render(<TabsLayout />);

  expect(mockRedirects).toContain('/onboarding');
  expect(mockRecover).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

it('resumes the orphan session once onboarding is completed', async () => {
  useOnboarding.setState({ status: 'done' });
  await render(<TabsLayout />);

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/tracking'));
  expect(mockRedirects).not.toContain('/onboarding');
});
