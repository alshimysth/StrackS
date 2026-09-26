/**
 * Export RGPD côté mobile (#76) : le document part vers la feuille de partage, et le
 * fichier — tracés GPS compris — ne survit pas au partage.
 */
import { exportFileName, exportPersonalData } from '../export-data';

const mockApi = jest.fn();
const mockShare = jest.fn();
const mockAvailable = jest.fn();
let mockWriteFails = false;
const mockFiles: { uri: string; content?: string; exists: boolean; deleted: boolean }[] = [];

jest.mock('../../api/client', () => ({ api: (...args: unknown[]) => mockApi(...args) }));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockAvailable(),
  shareAsync: (...args: unknown[]) => mockShare(...args),
}));

jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: class {
    record: { uri: string; content?: string; exists: boolean; deleted: boolean };
    constructor(dir: string, name: string) {
      this.record = { uri: `${dir}/${name}`, exists: false, deleted: false };
      mockFiles.push(this.record);
    }
    get uri() {
      return this.record.uri;
    }
    get exists() {
      return this.record.exists;
    }
    create() {
      this.record.exists = true;
    }
    write(content: string) {
      if (mockWriteFails) {
        this.record.content = content.slice(0, 5); // écriture partielle, puis panne
        throw new Error('ENOSPC');
      }
      this.record.content = content;
    }
    delete() {
      this.record.exists = false;
      this.record.deleted = true;
    }
  },
}));

beforeEach(() => {
  mockWriteFails = false;
  mockFiles.length = 0;
  mockApi.mockResolvedValue('{"formatVersion":1}');
  mockAvailable.mockResolvedValue(true);
  mockShare.mockResolvedValue(undefined);
});

it('nomme le fichier avec la date du jour', () => {
  expect(exportFileName(new Date('2026-09-26T08:00:00Z'))).toBe('stracks-export-2026-09-26.json');
});

it('demande le document brut, l’écrit tel quel et le partage en JSON', async () => {
  await exportPersonalData();

  expect(mockApi).toHaveBeenCalledWith('/api/v1/users/me/export', { parse: 'text' });
  expect(mockFiles[0].content).toBe('{"formatVersion":1}');
  expect(mockShare).toHaveBeenCalledWith(
    mockFiles[0].uri,
    expect.objectContaining({ mimeType: 'application/json' }),
  );
});

it('supprime le fichier après le partage', async () => {
  await exportPersonalData();
  expect(mockFiles[0].deleted).toBe(true);
});

it('supprime le fichier même si le partage échoue', async () => {
  mockShare.mockRejectedValue(new Error('annulé'));
  await expect(exportPersonalData()).rejects.toThrow('annulé');
  expect(mockFiles[0].deleted).toBe(true);
});

it('n’écrit rien quand le partage est indisponible', async () => {
  mockAvailable.mockResolvedValue(false);
  await expect(exportPersonalData()).rejects.toThrow(/partage de fichiers/);
  expect(mockFiles).toHaveLength(0);
});

it('ne laisse aucun fichier partiel quand l’écriture échoue', async () => {
  mockWriteFails = true;
  await expect(exportPersonalData()).rejects.toThrow('ENOSPC');
  expect(mockFiles[0].exists).toBe(false);
  expect(mockShare).not.toHaveBeenCalled();
});
