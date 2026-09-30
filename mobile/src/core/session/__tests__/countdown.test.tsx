/**
 * Countdown before start (#3).
 *
 * The ticket's central criterion: "GPS tracking only starts at the end of the countdown
 * (no loss of the first 3 seconds of data)". That's why `onDone` must only be called
 * once, at zero, never on mount.
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
 * A single `act` per call, with a grouped advance: the interval does fire n times (the
 * component decrements through a functional updater), and we avoid nesting asynchronous
 * `act` calls, which RNTL 14 loudly reports.
 */
async function tickSeconds(n: number) {
  await act(async () => {
    jest.advanceTimersByTime(n * 1000);
  });
}

describe('Countdown', () => {
  it('starts from 3 and decreases every second', async () => {
    await render(<Countdown onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('countdown-value')).toHaveTextContent('3');

    await tickSeconds(1);
    expect(screen.getByTestId('countdown-value')).toHaveTextContent('2');

    await tickSeconds(1);
    expect(screen.getByTestId('countdown-value')).toHaveTextContent('1');
  });

  it('does not start the session before the end of the countdown', async () => {
    const onDone = jest.fn();
    await render(<Countdown onDone={onDone} onCancel={jest.fn()} />);

    await tickSeconds(2);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('starts the session at zero, only once', async () => {
    const onDone = jest.fn();
    await render(<Countdown onDone={onDone} onCancel={jest.fn()} />);

    await tickSeconds(5); // two seconds more than needed
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('allows cancelling during the countdown, without starting', async () => {
    const onDone = jest.fn();
    const onCancel = jest.fn();
    await render(<Countdown onDone={onDone} onCancel={onCancel} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('countdown-cancel'));
    });

    expect(onCancel).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  /** The countdown is stopped on unmount: otherwise it would fire on a vanished screen. */
  it('calls nothing more after unmount', async () => {
    const onDone = jest.fn();
    const view = await render(<Countdown onDone={onDone} onCancel={jest.fn()} />);

    await view.unmount();
    await tickSeconds(5);

    expect(onDone).not.toHaveBeenCalled();
  });
});
