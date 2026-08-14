/**
 * État réseau du socle — source unique pour react-query ET pour l'interface.
 *
 * react-query embarque son propre `onlineManager`, mais son détecteur par défaut est
 * celui du navigateur : sous React Native il considère l'app **toujours en ligne**.
 * Sans le câblage ci-dessous, les requêtes partent dans le vide en avion et les
 * `retry` s'épuisent au lieu d'attendre le retour du réseau.
 *
 * `isInternetReachable` est distingué de `isConnected` à dessein : un Wi-Fi d'hôtel
 * avec portail captif est « connecté » sans router quoi que ce soit. Tant que la
 * valeur est `null`, NetInfo n'a pas encore tranché — on reste optimiste plutôt que
 * d'afficher un bandeau hors ligne au démarrage à chaque lancement.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

export function isOnlineFrom(state: NetInfoState): boolean {
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

/**
 * À appeler une fois au démarrage.
 *
 * `setEventListener` ne renvoie rien : c'est `onlineManager` qui garde la fonction de
 * désabonnement rendue par le setup et l'appelle lui-même quand on lui substitue un
 * autre listener. Il n'y a donc pas de nettoyage à remonter à l'appelant.
 */
export function setupOnlineManager(): void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(isOnlineFrom(state));
    }),
  );
}

/** Lecture réactive de l'état réseau, adossée au même manager que les requêtes. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true,
  );
}
