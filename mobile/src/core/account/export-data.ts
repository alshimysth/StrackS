/**
 * GDPR export (#76): fetches the server's JSON document and hands it to the system share
 * sheet; the user chooses where it goes (Files, email, cloud).
 *
 * The file contains the GPS tracks, sensitive data (PRD, constraint 6). It only exists for
 * the duration of the share: written to the cache, deleted as soon as the sheet closes,
 * whether the user shared or cancelled.
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
  // Everything that writes is inside the `try`: a full disk mid-write would otherwise leave
  // a partial file, GPS tracks included, in the cache (CodeRabbit review, PR #78).
  try {
    if (file.exists) {
      file.delete();
    }
    file.create();
    file.write(json);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Exporter mes données',
    });
  } finally {
    if (file.exists) {
      file.delete();
    }
  }
}

/** The web isn't a product target; the bundle simply has to keep working. */
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
