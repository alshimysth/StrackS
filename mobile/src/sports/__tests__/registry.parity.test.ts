/**
 * Parity of the mobile sport catalog with the backend plugins.
 *
 * A sport the server knows but the app can't start is a dead end on the home screen; a
 * GPS ceiling that differs between the two sides makes the live distance diverge from the
 * recomputation at stop (#40). Neither shows at compile time. Expected values are read
 * from the Java sources, never copied here: copied values would stay true while the
 * backend changes.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

import { sportCatalog, sportEntries } from '../catalog';
import { sportRegistry } from '../registry';

jest.mock('react-native-maps', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View, Polyline: View, Marker: View };
});

const SPORTS_DIR = resolve(__dirname, '../../../../backend/src/main/java/com/stracks/sports');

interface JavaPlugin {
  code: string;
  label: string;
  family: string;
  trackingMode: 'GPS' | 'TIMER';
  maxSpeedKmh?: number;
}

function javaFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? javaFiles(path) : name.endsWith('.java') ? [path] : [];
  });
}

/** Every `new SportTypeDescriptor("code", "label", FAMILY, TrackingMode.X, …)` of the backend. */
function javaPlugins(): JavaPlugin[] {
  const plugins: JavaPlugin[] = [];
  for (const file of javaFiles(SPORTS_DIR)) {
    const source = readFileSync(file, 'utf8');
    const descriptor =
      /new SportTypeDescriptor\(\s*"([a-z_]+)",\s*"([^"]+)",\s*([\w.]+),\s*TrackingMode\.(GPS|TIMER)/.exec(source);
    if (descriptor == null) {
      continue;
    }
    const family = /\bFAMILY = new SportFamily\("([a-z]+)"/.exec(familySource(file, descriptor[3]));
    const maxSpeed = /MAX_SPEED_KMH = ([\d.]+);/.exec(source);
    plugins.push({
      code: descriptor[1],
      label: descriptor[2],
      family: family?.[1] ?? descriptor[3],
      trackingMode: descriptor[4] as 'GPS' | 'TIMER',
      ...(maxSpeed != null ? { maxSpeedKmh: Number(maxSpeed[1]) } : {}),
    });
  }
  return plugins;
}

/** The family constant lives either in the plugin or in a sibling of its package. */
function familySource(file: string, reference: string): string {
  const dir = resolve(file, '..');
  const owner = reference.includes('.') ? `${reference.split('.')[0]}.java` : null;
  const candidates = owner != null ? [join(dir, owner)] : javaFiles(dir);
  return candidates.map((path) => readFileSync(path, 'utf8')).join('\n');
}

const expected = javaPlugins();

it('reads the backend plugins', () => {
  expect(expected.length).toBeGreaterThanOrEqual(14);
});

it('catalogues exactly the sports the backend registers', () => {
  expect(Object.keys(sportCatalog).sort()).toEqual(expected.map((p) => p.code).sort());
});

it('gives every catalogued sport its screens', () => {
  for (const entry of sportEntries) {
    expect(sportRegistry[entry.code]?.TrackingScreen).toBeDefined();
    expect(sportRegistry[entry.code]?.SummaryPanel).toBeDefined();
  }
});

describe.each(expected)('$code', (plugin) => {
  const entry = sportCatalog[plugin.code];

  it('shares the family and the tracking mode of its plugin', () => {
    expect(entry.family).toBe(plugin.family);
    expect(entry.trackingMode).toBe(plugin.trackingMode.toLowerCase());
  });

  it('mirrors the GPS ceiling of its plugin', () => {
    if (plugin.trackingMode === 'GPS') {
      expect(entry.maxGpsSpeedKmh).toBe(plugin.maxSpeedKmh);
    } else {
      expect(entry.maxGpsSpeedKmh).toBeUndefined();
    }
  });

  it('declares a draft only for a timed sport', () => {
    if (plugin.trackingMode === 'TIMER') {
      expect(entry.initialDraft).toBeDefined();
      expect(entry.metricsFromDraft).toBeDefined();
      // The draft must survive the buffer: JSON in, JSON out.
      const draft = entry.initialDraft?.();
      expect(JSON.parse(JSON.stringify(draft))).toEqual(draft);
    } else {
      expect(entry.initialDraft).toBeUndefined();
    }
  });
});
