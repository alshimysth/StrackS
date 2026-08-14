/**
 * Détection réseau (#27/#41) — la nuance qui compte est le portail captif.
 */
import type { NetInfoState } from '@react-native-community/netinfo';

import { isOnlineFrom } from '../online';

function state(partial: Partial<NetInfoState>): NetInfoState {
  return { isConnected: true, isInternetReachable: true, ...partial } as NetInfoState;
}

describe('isOnlineFrom', () => {
  it('est en ligne quand la connexion route bien', () => {
    expect(isOnlineFrom(state({}))).toBe(true);
  });

  it('est hors ligne sans connexion', () => {
    expect(isOnlineFrom(state({ isConnected: false }))).toBe(false);
  });

  /**
   * Wi-Fi d'hôtel avec portail captif : l'appareil est « connecté » mais ne joint
   * rien. S'en tenir à `isConnected` ferait croire l'app en ligne et enverrait ses
   * requêtes dans le vide.
   */
  it('est hors ligne sur une connexion qui ne route pas', () => {
    expect(isOnlineFrom(state({ isConnected: true, isInternetReachable: false }))).toBe(false);
  });

  /**
   * `null` = NetInfo n'a pas encore tranché. Rester optimiste évite un bandeau
   * « hors ligne » qui clignote à chaque lancement de l'app.
   */
  it('reste optimiste tant que la joignabilité est indéterminée', () => {
    expect(isOnlineFrom(state({ isConnected: true, isInternetReachable: null }))).toBe(true);
  });
});
