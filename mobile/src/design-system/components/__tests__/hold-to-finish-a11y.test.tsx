/**
 * #42: finishing a session with a screen reader. Holding for 1.5 s isn't reliable there;
 * the accessible "Terminer" action asks for a confirmation, which keeps the protection
 * against an accidental stop.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { HoldToFinish } from '../HoldToFinish';

jest.mock('../../use-theme', () => ({
  useTheme: () => jest.requireActual('../../theme').darkTheme,
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's' },
}));

function pressAlertButton(label: string) {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  buttons.find((b) => b.text === label)?.onPress?.();
}

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

it('is named "Terminer la séance" and explains how to do it', async () => {
  await render(<HoldToFinish onFinish={jest.fn()} />);
  const button = screen.getByRole('button', { name: 'Terminer la séance' });
  expect(button.props.accessibilityHint).toMatch(/Maintiens 1,5 seconde/);
  expect(button.props.accessibilityActions).toEqual([{ name: 'activate', label: 'Terminer' }]);
});

it('finishes only after confirmation', async () => {
  const onFinish = jest.fn();
  await render(<HoldToFinish onFinish={onFinish} />);

  await fireEvent(screen.getByRole('button'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(Alert.alert).toHaveBeenCalledWith('Terminer la séance ?', expect.any(String), expect.any(Array));
  expect(onFinish).not.toHaveBeenCalled();

  pressAlertButton('Continuer');
  expect(onFinish).not.toHaveBeenCalled();

  pressAlertButton('Terminer');
  expect(onFinish).toHaveBeenCalledTimes(1);
});

it('offers no action when the button is disabled', async () => {
  await render(<HoldToFinish onFinish={jest.fn()} disabled />);
  expect(screen.getByRole('button').props.accessibilityActions).toEqual([]);
  expect(screen.getByRole('button').props.accessibilityState).toEqual({ disabled: true });
});
