/**
 * Vérification du harnais de test lui-même (#40) : le preset jest-expo sait
 * transformer du TSX, monter un arbre React Native et laisser
 * @testing-library/react-native l'interroger et l'actionner.
 *
 * Le composant est défini ici, volontairement : les écrans de `src/app/` et les
 * composants de `src/design-system/` sont en cours de refonte par d'autres
 * sessions (#48), et coupler ce test à leur arbre de rendu le rendrait rouge à
 * chaque itération de design. Ce fichier ne garantit qu'une chose — que le
 * harnais est prêt pour les tests d'écran, à écrire quand le design se posera.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

function Compteur({ label }: { label: string }) {
  const [count, setCount] = useState(0);
  return (
    <View>
      <Text>{`${label} : ${count}`}</Text>
      <Pressable accessibilityRole="button" onPress={() => setCount((c) => c + 1)}>
        <Text>Incrémenter</Text>
      </Pressable>
    </View>
  );
}

// @testing-library/react-native 14 rend `render` et les événements
// asynchrones (c'était synchrone en 13) : tout s'attend avec await.
describe('harnais de test', () => {
  it('monte un composant React Native et le rend interrogeable', async () => {
    await render(<Compteur label="Tours" />);
    expect(screen.getByText('Tours : 0')).toBeTruthy();
  });

  it('propage un événement utilisateur jusqu\'à l\'état du composant', async () => {
    await render(<Compteur label="Tours" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Incrémenter' }));
    expect(screen.getByText('Tours : 1')).toBeTruthy();
  });

  it('fournit les matchers d\'accessibilité de la testing-library', async () => {
    await render(<Compteur label="Tours" />);
    expect(screen.getByRole('button')).toBeOnTheScreen();
    expect(screen.queryByText('Absent')).toBeNull();
  });
});
