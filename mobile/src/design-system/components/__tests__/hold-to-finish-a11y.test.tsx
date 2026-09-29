/**
 * #42 : terminer une séance au lecteur d'écran. Maintenir 1,5 s n'y est pas fiable ;
 * l'action accessible « Terminer » demande une confirmation, qui garde la protection
 * contre l'arrêt accidentel.
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

it('se nomme « Terminer la séance » et explique comment faire', async () => {
  await render(<HoldToFinish onFinish={jest.fn()} />);
  const button = screen.getByRole('button', { name: 'Terminer la séance' });
  expect(button.props.accessibilityHint).toMatch(/Maintiens 1,5 seconde/);
  expect(button.props.accessibilityActions).toEqual([{ name: 'activate', label: 'Terminer' }]);
});

it('termine après confirmation seulement', async () => {
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

it('n’offre aucune action quand le bouton est désactivé', async () => {
  await render(<HoldToFinish onFinish={jest.fn()} disabled />);
  expect(screen.getByRole('button').props.accessibilityActions).toEqual([]);
  expect(screen.getByRole('button').props.accessibilityState).toEqual({ disabled: true });
});
