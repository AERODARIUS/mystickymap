import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { Note } from '../../types';
import {
  clusterNotes,
  getCoordinateKey,
  groupNotesByCoordinate,
  isLocationInBounds,
  shouldZoomCluster,
} from '../markerClustering';

function makeNote(
  id: string,
  lat: number,
  lng: number,
  createdAtMs: number = 1_700_000_000_000,
  overrides: Partial<Note> = {}
): Note {
  return {
    id,
    type: 'text',
    content: `Offer ${id}`,
    contentFormat: 'plain',
    location: { lat, lng },
    authorId: 'author-1',
    authorName: 'Recruiter',
    privacy: 'public',
    createdAt: Timestamp.fromMillis(createdAtMs),
    color: '#0d9488',
    emoji: '💼',
    ...overrides,
  };
}

describe('markerClustering pure geospatial logic', () => {
  it('handles empty note lists and invalid coordinates safely', () => {
    expect(groupNotesByCoordinate([])).toEqual([]);
    expect(clusterNotes([], { zoom: 15 })).toEqual([]);

    const badNotes = [
      makeNote('bad-1', Number.NaN, -56.16),
      makeNote('bad-2', 95, -56.16),
      makeNote('bad-3', -34.9, 200),
    ];
    expect(groupNotesByCoordinate(badNotes)).toEqual([]);
    expect(clusterNotes(badNotes, { zoom: 15 })).toEqual([]);
  });

  it('renders a single note at a location as a single marker preserving original coordinates', () => {
    const note = makeNote('single-1', -34.908118, -56.201784);
    const items = clusterNotes([note], { zoom: 15 });

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('single');
    if (items[0].kind === 'single') {
      expect(items[0].note.id).toBe('single-1');
      expect(items[0].position).toBe(note.location);
      expect(items[0].position).toEqual({ lat: -34.908118, lng: -56.201784 });
    }
  });

  it('groups notes with identical coordinates into a coincident group without mutating note.location', () => {
    const shared = { lat: -34.9011, lng: -56.1645 };
    const n1 = makeNote('job-1', shared.lat, shared.lng, 1000);
    const n2 = makeNote('job-2', shared.lat, shared.lng, 3000);
    const n3 = makeNote('job-3', shared.lat, shared.lng, 2000);

    // Even at max zoom (21), coincident coordinates stay grouped so they never stack invisibly
    const items = clusterNotes([n1, n2, n3], { zoom: 21 });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('coincident');
    if (items[0].kind === 'coincident') {
      expect(items[0].noteCount).toBe(3);
      // Deterministic newest-first order
      expect(items[0].notes.map((n) => n.id)).toEqual(['job-2', 'job-3', 'job-1']);
      expect(items[0].position).toEqual(shared);
    }

    // Original note coordinates are untouched
    expect(n1.location).toEqual(shared);
    expect(n2.location).toEqual(shared);
    expect(n3.location).toEqual(shared);
  });

  it('distinguishes coincident coordinates from nearby distinct coordinates when zoomed in', () => {
    const coincidentA = [
      makeNote('a1', -34.9011, -56.1645),
      makeNote('a2', -34.9011, -56.1645),
    ];
    // ~50 meters north
    const distinctB = makeNote('b1', -34.90065, -56.1645);

    // At high zoom, distinct locations separate cleanly while coincident ones remain a group
    const zoomedIn = clusterNotes([...coincidentA, distinctB], { zoom: 18 });
    expect(zoomedIn).toHaveLength(2);
    const kinds = zoomedIn.map((item) => item.kind).sort();
    expect(kinds).toEqual(['coincident', 'single']);

    // At low zoom, both locations merge into a single spatial cluster of 3 notes across 2 locations
    const zoomedOut = clusterNotes([...coincidentA, distinctB], { zoom: 12 });
    expect(zoomedOut).toHaveLength(1);
    expect(zoomedOut[0].kind).toBe('cluster');
    if (zoomedOut[0].kind === 'cluster') {
      expect(zoomedOut[0].noteCount).toBe(3);
      expect(zoomedOut[0].locationCount).toBe(2);
      expect(zoomedOut[0].notes.map((n) => n.id).sort()).toEqual(['a1', 'a2', 'b1']);
      expect(shouldZoomCluster(zoomedOut[0], 12)).toBe(true);
    }
  });

  it('scales cleanly with 358+ mixed coincident and distinct notes preserving exact note count', () => {
    const notes: Note[] = [];
    // 200 notes at Montevideo Centro
    for (let i = 0; i < 200; i++) {
      notes.push(makeNote(`centro-${i}`, -34.9058, -56.1913, 1_700_000_000_000 + i));
    }
    // 100 notes at Tres Cruces
    for (let i = 0; i < 100; i++) {
      notes.push(makeNote(`tc-${i}`, -34.8946, -56.1667, 1_700_000_100_000 + i));
    }
    // 58 distinct notes spread across the city
    for (let i = 0; i < 58; i++) {
      notes.push(
        makeNote(
          `distinct-${i}`,
          -34.88 - (i % 10) * 0.005,
          -56.21 + Math.floor(i / 10) * 0.01,
          1_700_000_200_000 + i
        )
      );
    }

    expect(notes).toHaveLength(358);

    // City overview zoom: heavily clustered, total noteCount across clusters === 358
    const overview = clusterNotes(notes, { zoom: 11 });
    expect(overview.length).toBeLessThan(20);
    const overviewTotal = overview.reduce((sum, item) => sum + item.noteCount, 0);
    expect(overviewTotal).toBe(358);

    // Street-level zoom: Centro (200) and Tres Cruces (100) are coincident clusters, 58 are single
    const street = clusterNotes(notes, { zoom: 19 });
    expect(street).toHaveLength(60);
    const streetTotal = street.reduce((sum, item) => sum + item.noteCount, 0);
    expect(streetTotal).toBe(358);
    expect(street.filter((c) => c.kind === 'coincident')).toHaveLength(2);
    expect(street.filter((c) => c.kind === 'single')).toHaveLength(58);
  });

  it('filters by viewport bounds including antimeridian wrap', () => {
    const inside = makeNote('in', -34.9, -56.16);
    const outside = makeNote('out', 40.71, -74.0);

    const visible = clusterNotes([inside, outside], {
      zoom: 13,
      bounds: { north: -34.85, south: -34.95, east: -56.1, west: -56.25 },
    });
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('note:in');

    // Antimeridian check (Pacific): west=170, east=-170
    expect(
      isLocationInBounds({ lat: 0, lng: 175 }, { north: 10, south: -10, east: -170, west: 170 }, 0)
    ).toBe(true);
    expect(
      isLocationInBounds({ lat: 0, lng: -175 }, { north: 10, south: -10, east: -170, west: 170 }, 0)
    ).toBe(true);
    expect(
      isLocationInBounds({ lat: 0, lng: 0 }, { north: 10, south: -10, east: -170, west: 170 }, 0)
    ).toBe(false);
  });

  it('normalizes -0 coordinates consistently in getCoordinateKey', () => {
    expect(getCoordinateKey({ lat: -0, lng: 0 })).toBe('0.000000,0.000000');
  });

  it('stops zooming when cluster bounds are practically coincident or zoom >= maxClusterZoom', () => {
    const tinyCluster = {
      kind: 'cluster' as const,
      id: 'c1',
      position: { lat: -34.9, lng: -56.16 },
      notes: [makeNote('1', -34.9, -56.16), makeNote('2', -34.900005, -56.160005)],
      noteCount: 2,
      locationCount: 2,
      bounds: { north: -34.9, south: -34.900005, east: -56.16, west: -56.160005 },
    };
    expect(shouldZoomCluster(tinyCluster, 15)).toBe(false);
    expect(shouldZoomCluster({
      ...tinyCluster,
      bounds: { north: -34.89, south: -34.91, east: -56.15, west: -56.17 },
    }, 18)).toBe(false);
  });
});
