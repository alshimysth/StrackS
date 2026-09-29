/**
 * Check of the test harness itself (#40): the jest-expo preset can transform TSX, mount a
 * React Native tree and let @testing-library/react-native query and act on it.
 *
 * The component is defined here on purpose, so this file only checks the harness,
 * independently from any screen's render tree.
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

// @testing-library/react-native 14 makes `render` and events asynchronous (they were
// synchronous in 13): everything is awaited.
describe('test harness', () => {
  it('mounts a React Native component and makes it queryable', async () => {
    await render(<Compteur label="Tours" />);
    expect(screen.getByText('Tours : 0')).toBeTruthy();
  });

  it('propagates a user event to the component state', async () => {
    await render(<Compteur label="Tours" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Incrémenter' }));
    expect(screen.getByText('Tours : 1')).toBeTruthy();
  });

  it('provides the testing-library accessibility matchers', async () => {
    await render(<Compteur label="Tours" />);
    expect(screen.getByRole('button')).toBeOnTheScreen();
    expect(screen.queryByText('Absent')).toBeNull();
  });
});
