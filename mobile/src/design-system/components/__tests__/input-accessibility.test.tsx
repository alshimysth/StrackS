/** PR #80 review: a field is named by its visible label for screen readers. */
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { Input } from '../Input';

jest.mock('../../use-theme', () => ({
  useTheme: () => jest.requireActual('../../theme').lightTheme,
}));

it('takes the visible label as accessible name, and the helper as hint', async () => {
  await render(<Input label="Poids (kg)" helper="Sert aux calories." value="" onChangeText={() => undefined} />);
  expect(screen.getByLabelText('Poids (kg)')).toBeOnTheScreen();
  expect(screen.getByLabelText('Poids (kg)').props.accessibilityHint).toBe('Sert aux calories.');
});

it('announces the error rather than the helper when there is one', async () => {
  await render(
    <Input label="Poids (kg)" helper="Sert aux calories." error="Trop léger" value="" onChangeText={() => undefined} />,
  );
  expect(screen.getByLabelText('Poids (kg)').props.accessibilityHint).toBe('Trop léger');
});

it('respects an accessible name provided by the caller', async () => {
  await render(<Input label="Code" accessibilityLabel="Code reçu par email" value="" onChangeText={() => undefined} />);
  expect(screen.getByLabelText('Code reçu par email')).toBeOnTheScreen();
});
