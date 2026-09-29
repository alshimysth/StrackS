/** #39 : un seul vocabulaire d'icônes, décoratives par défaut. */
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { Button } from '../Button';
import { ICONS, Icon } from '../Icon';
import { lightTheme } from '../../theme';

it('rend chaque icône du vocabulaire', async () => {
  for (const name of Object.keys(ICONS) as (keyof typeof ICONS)[]) {
    await render(<Icon name={name} color={lightTheme.textPrimary} />);
    expect(screen.getByTestId(`icon-${name}`, { includeHiddenElements: true })).toBeOnTheScreen();
  }
});

/** Une icône accompagne un libellé : le lecteur d'écran ne doit pas la lire en double. */
it('est masquée aux lecteurs d’écran sans libellé, annoncée avec', async () => {
  await render(<Icon name="state-gps" color={lightTheme.textPrimary} />);
  expect(screen.getByTestId('icon-state-gps', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);

  await render(<Icon name="state-gps" color={lightTheme.textPrimary} accessibilityLabel="Signal GPS" />);
  // Lucide recopie le libellé sur l'élément SVG interne : au moins un nœud le porte.
  expect(screen.getAllByLabelText('Signal GPS').length).toBeGreaterThan(0);
});

it('place une icône dans un bouton sans changer son nom accessible', async () => {
  await render(<Button icon="action-pause">Pause</Button>);
  expect(screen.getByTestId('icon-action-pause', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
});
