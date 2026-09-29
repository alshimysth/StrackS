/**
 * Sections ajoutées au profil par le lot 3 : totaux (#7), poids (#32), zones de
 * confidentialité (#37), mode GPS (#36), avatar (#7).
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import { AllTimeStats } from '../../core/profile/AllTimeStats';
import { PhysicalProfile } from '../../core/profile/PhysicalProfile';
import { PrivacyZones } from '../../core/profile/PrivacyZones';
import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type PrivacyZone as PrivacyZoneT,
} from '../../core/preferences/schema';
import { haversineM } from '../../core/session/metrics';
import { QUERY_KEY } from '../../core/preferences/use-preferences';
import { initialsOf } from '../../design-system/components/Avatar';
import { createTestQueryClient } from '../../test-support/query-client';

const mockApi = jest.fn();
const mockPosition = jest.fn();

jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: (...args: unknown[]) => mockApi(...args),
}));

jest.mock('../../core/gps/position', () => ({
  getCurrentPosition: () => mockPosition(),
}));

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function withPreferences(patch: Partial<Preferences>) {
  client.setQueryData(QUERY_KEY, { ...DEFAULT_PREFERENCES, ...patch });
}

function summary(totalSessions: number, totals: Record<string, number>) {
  return {
    from: '1970-01-01T00:00:00Z',
    to: '2026-09-28T00:00:00Z',
    bySport: [],
    totalSessions,
    totalDurationS: 45 * 3600 + 12 * 60,
    totals,
    previous: { sessions: 0, durationS: 0, totals: {} },
  };
}

/** Le serveur renvoie le document complet après un PATCH : on renvoie le patch fusionné. */
function echoPatches() {
  mockApi.mockImplementation((path: string, options?: { body?: Partial<Preferences> }) =>
    Promise.resolve({ ...DEFAULT_PREFERENCES, ...(options?.body ?? {}) }),
  );
}

const patches = () =>
  mockApi.mock.calls
    .filter(([path, options]) => path === '/api/v1/users/me/preferences' && options?.method === 'PATCH')
    .map(([, options]) => options.body);

beforeEach(() => {
  client = createTestQueryClient();
  withPreferences({});
  mockApi.mockReset();
  mockPosition.mockReset();
});

afterEach(() => {
  client.unmount();
  client.clear();
});

describe('Totaux depuis le début (#7)', () => {
  it('affiche séances, temps total et distance agrégés par le serveur', async () => {
    mockApi.mockResolvedValue(summary(42, { distanceM: 321_000 }));
    await render(<AllTimeStats />, { wrapper: Wrapper });

    expect(await screen.findByTestId('all-time-sessions')).toHaveTextContent(/42/);
    expect(screen.getByTestId('all-time-duration')).toHaveTextContent(/45 h 12 min/);
    expect(screen.getByTestId('all-time-distance')).toHaveTextContent(/321/);
    expect(mockApi).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/v1\/stats\/summary\?period=all/));
  });

  /** Le socle ne sait pas qu'un sport « a » une distance : pas de clé, pas de carte. */
  it('n’invente pas de distance quand aucun sport pratiqué n’en déclare', async () => {
    mockApi.mockResolvedValue(summary(3, {}));
    await render(<AllTimeStats />, { wrapper: Wrapper });

    expect(await screen.findByTestId('all-time-sessions')).toBeOnTheScreen();
    expect(screen.queryByTestId('all-time-distance')).toBeNull();
  });

  it('invite à une première séance plutôt que d’afficher des zéros', async () => {
    mockApi.mockResolvedValue(summary(0, {}));
    await render(<AllTimeStats />, { wrapper: Wrapper });
    expect(await screen.findByTestId('all-time-empty')).toBeOnTheScreen();
  });
});

describe('Poids (#32)', () => {
  it('explique à quoi sert le poids', async () => {
    await render(<PhysicalProfile />, { wrapper: Wrapper });
    expect(screen.getByText(/Sert uniquement à estimer les calories/)).toBeOnTheScreen();
  });

  /**
   * Revue PR #80 : seul le poids part. Recopier les autres champs depuis un état pas
   * encore chargé enverrait des `null`, que le serveur lit comme « effacer ».
   */
  it('n’envoie que le poids, jamais les autres données physiques', async () => {
    withPreferences({ physical: { ...DEFAULT_PREFERENCES.physical, heightCm: 180 } });
    echoPatches();
    await render(<PhysicalProfile />, { wrapper: Wrapper });

    await fireEvent.changeText(screen.getByTestId('weight-input'), '72,5');
    await fireEvent.press(screen.getByText('Enregistrer le poids'));

    await waitFor(() => expect(patches()).toEqual([{ physical: { weightKg: 72.5 } }]));
  });

  it('saisit en livres en impérial et stocke des kg', async () => {
    withPreferences({ units: 'imperial' });
    echoPatches();
    await render(<PhysicalProfile />, { wrapper: Wrapper });

    expect(screen.getByText('Poids (lb)')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('weight-input'), '158.7');
    await fireEvent.press(screen.getByText('Enregistrer le poids'));

    await waitFor(() => expect(patches()[0]).toMatchObject({ physical: { weightKg: 72 } }));
  });

  /** Mêmes bornes que le serveur (30–300 kg) : le front refuse avant d'envoyer. */
  it.each(['12', '420', 'soixante', ''])('refuse « %s » sans appel serveur', async (input) => {
    await render(<PhysicalProfile />, { wrapper: Wrapper });
    await fireEvent.changeText(screen.getByTestId('weight-input'), input);
    await fireEvent.press(screen.getByText('Enregistrer le poids'));

    expect(await screen.findByText(/Saisis un poids entre 30 et 300 kg/)).toBeOnTheScreen();
    expect(patches()).toEqual([]);
  });

  it('permet de retirer le poids', async () => {
    withPreferences({ physical: { ...DEFAULT_PREFERENCES.physical, weightKg: 70 } });
    echoPatches();
    await render(<PhysicalProfile />, { wrapper: Wrapper });

    expect(screen.getByTestId('weight-input').props.value).toBe('70');
    await fireEvent.press(screen.getByText('Retirer'));
    await waitFor(() => expect(patches()[0]).toMatchObject({ physical: { weightKg: null } }));
  });
});

describe('Zones de confidentialité (#37)', () => {
  it('dit que le tracé reste enregistré : masqué n’est pas supprimé', async () => {
    await render(<PrivacyZones />, { wrapper: Wrapper });
    expect(screen.getByText(/reste enregistré en entier/)).toBeOnTheScreen();
  });

  /** Centre décalé au hasard (revue PR #80) : la position réelle n'est jamais envoyée. */
  it('ajoute une zone qui couvre la position actuelle sans être centrée dessus', async () => {
    mockPosition.mockResolvedValue({ lat: 48.8566123, lng: 2.3522219, accuracyM: 8 });
    echoPatches();
    await render(<PrivacyZones />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByTestId('chip-200'));
    await fireEvent.press(screen.getByText('Masquer autour de ma position actuelle'));

    await waitFor(() => expect(patches()).toHaveLength(1));
    const [zone] = (patches()[0] as { privacyZones: PrivacyZoneT[] }).privacyZones;
    expect(zone).toMatchObject({ radiusM: 200, label: 'Domicile' });
    const offset = haversineM(48.8566123, 2.3522219, zone.lat, zone.lng);
    expect(offset).toBeLessThanOrEqual(0.3 * 200 + 1); // position réelle couverte
    expect(String(zone.lat).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(5);
  });

  /**
   * Revue PR #80 : deux retraits avant la réponse du premier. Calculés depuis le même
   * rendu, le second PATCH renverrait la zone que le premier venait d'enlever.
   */
  it('enchaîne deux retraits rapides sans que le second annule le premier', async () => {
    withPreferences({
      privacyZones: [
        { lat: 1, lng: 1, radiusM: 500, label: 'Domicile' },
        { lat: 2, lng: 2, radiusM: 500, label: 'Zone 2' },
        { lat: 3, lng: 3, radiusM: 500, label: 'Zone 3' },
      ],
    });
    // Réponse lente : les deux appuis ont lieu avant que le premier PATCH ne revienne.
    mockApi.mockImplementation(
      (path: string, options?: { body?: Partial<Preferences> }) =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ ...DEFAULT_PREFERENCES, ...(options?.body ?? {}) }), 50);
        }),
    );
    await render(<PrivacyZones />, { wrapper: Wrapper });

    // L'utilisateur touche ce qui est à l'écran : deux fois le premier « Retirer ».
    await fireEvent.press(screen.getAllByText('Retirer')[0]);
    await fireEvent.press(screen.getAllByText('Retirer')[0]);

    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1]).toEqual({ privacyZones: [{ lat: 3, lng: 3, radiusM: 500, label: 'Zone 3' }] });
  });

  it('retire une zone en renvoyant la liste restante', async () => {
    withPreferences({
      privacyZones: [
        { lat: 1, lng: 1, radiusM: 500, label: 'Domicile' },
        { lat: 2, lng: 2, radiusM: 500, label: 'Zone 2' },
      ],
    });
    echoPatches();
    await render(<PrivacyZones />, { wrapper: Wrapper });

    await fireEvent.press(screen.getAllByText('Retirer')[0]);
    await waitFor(() =>
      expect(patches()).toEqual([{ privacyZones: [{ lat: 2, lng: 2, radiusM: 500, label: 'Zone 2' }] }]),
    );
  });

  it('affiche un refus de localisation sans rien enregistrer', async () => {
    mockPosition.mockRejectedValue(new Error('Permission de localisation refusée — active-la dans les réglages.'));
    await render(<PrivacyZones />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByText('Masquer autour de ma position actuelle'));
    expect(await screen.findByTestId('privacy-error')).toHaveTextContent(/Permission de localisation refusée/);
    expect(patches()).toEqual([]);
  });

  it('n’offre plus d’ajout au-delà de cinq zones', async () => {
    withPreferences({
      privacyZones: [1, 2, 3, 4, 5].map((i) => ({ lat: i, lng: i, radiusM: 500, label: null })),
    });
    await render(<PrivacyZones />, { wrapper: Wrapper });
    expect(screen.queryByText('Masquer autour de ma position actuelle')).toBeNull();
    expect(screen.getByText('5 zones au maximum.')).toBeOnTheScreen();
  });
});

describe('Avatar (#7)', () => {
  it.each([
    ['Marie Curie', 'm@example.com', 'MC'],
    ['Jean-Paul Sartre de Beauvoir', null, 'JB'],
    ['Zoé', null, 'ZO'],
    [null, 'coureur@example.com', 'C'],
    ['   ', null, '?'],
    // Revue PR #80 : un emoji est un seul caractère, jamais une moitié de paire UTF-16.
    ['😀 Alice', null, '😀A'],
    ['😀', null, '😀'],
    [null, '😀@example.com', '😀'],
  ])('%s / %s → %s', (name, email, expected) => {
    expect(initialsOf(name, email)).toBe(expected);
  });
});

describe('Nom affiché (#7)', () => {
  const { DisplayName } = jest.requireActual('../../core/profile/DisplayName');

  it('modifie le nom et met à jour l’utilisateur affiché', async () => {
    const updated = { id: 'u', email: 'a@example.com', displayName: 'Marie', createdAt: '2026-01-01T00:00:00Z' };
    mockApi.mockResolvedValue(updated);
    await render(<DisplayName value="Ancien nom" />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByText('Modifier'));
    await fireEvent.changeText(screen.getByTestId('display-name-input'), '  Marie  ');
    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/api/v1/users/me', { method: 'PATCH', body: { displayName: 'Marie' } }),
    );
    expect(client.getQueryData(['me'])).toEqual(updated);
    await waitFor(() => expect(screen.queryByTestId('display-name-input')).toBeNull());
  });

  it('annule sans rien envoyer', async () => {
    await render(<DisplayName value="Ancien nom" />, { wrapper: Wrapper });
    await fireEvent.press(screen.getByText('Modifier'));
    await fireEvent.press(screen.getByText('Annuler'));
    expect(screen.getByTestId('display-name')).toHaveTextContent('Ancien nom');
    expect(mockApi).not.toHaveBeenCalled();
  });
});
