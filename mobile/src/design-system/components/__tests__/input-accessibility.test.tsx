/** Revue PR #80 : un champ se nomme par son libellé visible pour les lecteurs d'écran. */
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { Input } from '../Input';

jest.mock('../../use-theme', () => ({
  useTheme: () => jest.requireActual('../../theme').lightTheme,
}));

it('prend le libellé visible comme nom accessible, et l’aide comme indication', async () => {
  await render(<Input label="Poids (kg)" helper="Sert aux calories." value="" onChangeText={() => undefined} />);
  expect(screen.getByLabelText('Poids (kg)')).toBeOnTheScreen();
  expect(screen.getByLabelText('Poids (kg)').props.accessibilityHint).toBe('Sert aux calories.');
});

it('annonce l’erreur plutôt que l’aide quand il y en a une', async () => {
  await render(
    <Input label="Poids (kg)" helper="Sert aux calories." error="Trop léger" value="" onChangeText={() => undefined} />,
  );
  expect(screen.getByLabelText('Poids (kg)').props.accessibilityHint).toBe('Trop léger');
});

it('respecte un nom accessible fourni par l’appelant', async () => {
  await render(<Input label="Code" accessibilityLabel="Code reçu par email" value="" onChangeText={() => undefined} />);
  expect(screen.getByLabelText('Code reçu par email')).toBeOnTheScreen();
});
