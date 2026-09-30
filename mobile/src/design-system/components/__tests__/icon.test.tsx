/** #39: a single icon vocabulary, decorative by default. */
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { Button } from '../Button';
import { ICONS, Icon } from '../Icon';
import { lightTheme } from '../../theme';

it('renders every icon of the vocabulary', async () => {
  for (const name of Object.keys(ICONS) as (keyof typeof ICONS)[]) {
    await render(<Icon name={name} color={lightTheme.textPrimary} />);
    expect(screen.getByTestId(`icon-${name}`, { includeHiddenElements: true })).toBeOnTheScreen();
  }
});

/** An icon accompanies a label: the screen reader must not read it twice. */
it('is hidden from screen readers without a label, announced with one', async () => {
  await render(<Icon name="state-gps" color={lightTheme.textPrimary} />);
  expect(screen.getByTestId('icon-state-gps', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);

  await render(<Icon name="state-gps" color={lightTheme.textPrimary} accessibilityLabel="Signal GPS" />);
  // Lucide copies the label onto the inner SVG element: at least one node carries it.
  expect(screen.getAllByLabelText('Signal GPS').length).toBeGreaterThan(0);
});

it('places an icon in a button without changing its accessible name', async () => {
  await render(<Button icon="action-pause">Pause</Button>);
  expect(screen.getByTestId('icon-action-pause', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
});
