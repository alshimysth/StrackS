/**
 * Compte à rebours avant démarrage (#3).
 *
 * Le critère central du ticket : « le tracking GPS ne démarre qu'à la fin du décompte
 * (pas de perte des 3 premières secondes de données) ». C'est pour ça que `onDone` ne
 * doit être appelé qu'une fois, à zéro — jamais au montage.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { Countdown } from '../Countdown';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * Un seul `act` par appel, avec une avance groupée : l'intervalle tire bien n fois
 * (le composant décrémente via un updater fonctionnel), et on évite d'imbriquer des
 * `act` asynchrones, ce que RNTL 14 signale bruyamment.
 */
async function tickSeconds(n: number) {
  await act(async () => {
    jest.advanceTimersByTime(n * 1000);
  });
}

describe('Countdown', () => {
  it('part de 3 et décroît chaque seconde', async () => {
    await render(<Countdown onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('countdown-value')).toHaveTextContent('3');

    await tickSeconds(1);
    expect(screen.getByTestId('countdown-value')).toHaveTextContent('2');

    await tickSeconds(1);
    expect(screen.getByTestId('countdown-value')).toHaveTextContent('1');
  });

  it('ne démarre pas la séance avant la fin du décompte', async () => {
    const onDone = jest.fn();
    await render(<Countdown onDone={onDone} onCancel={jest.fn()} />);

    await tickSeconds(2);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('démarre la séance à zéro, une seule fois', async () => {
    const onDone = jest.fn();
    await render(<Countdown onDone={onDone} onCancel={jest.fn()} />);

    await tickSeconds(5); // deux secondes de plus que nécessaire
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('permet d’annuler pendant le décompte, sans démarrer', async () => {
    const onDone = jest.fn();
    const onCancel = jest.fn();
    await render(<Countdown onDone={onDone} onCancel={onCancel} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('countdown-cancel'));
    });

    expect(onCancel).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  /** Le décompte est arrêté au démontage : sinon il tirerait sur un écran disparu. */
  it('n’appelle plus rien après démontage', async () => {
    const onDone = jest.fn();
    const view = await render(<Countdown onDone={onDone} onCancel={jest.fn()} />);

    view.unmount();
    await tickSeconds(5);

    expect(onDone).not.toHaveBeenCalled();
  });
});
