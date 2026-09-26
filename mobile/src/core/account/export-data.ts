/**
 * Export RGPD (#76) : récupère le document JSON du serveur et le confie à la feuille de
 * partage du système — l'utilisateur choisit où il va (Fichiers, email, cloud).
 *
 * Le fichier contient les tracés GPS, donnée sensible (PRD, contrainte 6). Il n'existe que
 * le temps du partage : écrit dans le cache, supprimé dès que la feuille se ferme, que
 * l'utilisateur ait partagé ou annulé.
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { api } from '../api/client';

export function exportFileName(now: Date = new Date()): string {
  return `stracks-export-${now.toISOString().slice(0, 10)}.json`;
}

export async function exportPersonalData(): Promise<void> {
  const json = await api<string>('/api/v1/users/me/export', { parse: 'text' });
  const name = exportFileName();

  if (Platform.OS === 'web') {
    downloadInBrowser(json, name);
    return;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Le partage de fichiers n’est pas disponible sur cet appareil.');
  }
  const file = new File(Paths.cache, name);
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(json);
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Exporter mes données',
    });
  } finally {
    file.delete();
  }
}

/** Le web n'est pas une cible produit ; le bundle doit simplement rester fonctionnel. */
function downloadInBrowser(json: string, name: string): void {
  const doc = (globalThis as { document?: Document }).document;
  if (doc == null) {
    throw new Error('Téléchargement indisponible.');
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
