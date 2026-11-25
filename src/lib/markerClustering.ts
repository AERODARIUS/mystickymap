import { Note } from '../types';

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface CoordinateGroup {
  id: string;
  coordKey: string;
  position: LatLngLiteral;
  notes: Note[];
}

export interface SingleMarkerCluster {
  kind: 'single';
  id: string;
  position: LatLngLiteral;
  note: Note;
  noteCount: 1;
}

export interface CoincidentMarkerCluster {
  kind: 'coincident';
  id: string;
  coordKey: string;
  position: LatLngLiteral;
  notes: Note[];
  noteCount: number;
}

export interface SpatialMarkerCluster {
  kind: 'cluster';
  id: string;
  position: LatLngLiteral;
  notes: Note[];
  noteCount: number;
  locationCount: number;
  bounds: MapBounds;
}

export type ClusterItem =
  | SingleMarkerCluster
  | CoincidentMarkerCluster
  | SpatialMarkerCluster;

export interface ClusterOptions {
  radiusPx?: number;
  maxClusterZoom?: number;
  tileSize?: number;
  boundsPaddingRatio?: number;
}

export interface MapViewportState {
  zoom: number;
  bounds?: MapBounds | null;
}

const DEFAULT_RADIUS_PX = 58;
const DEFAULT_MAX_CLUSTER_ZOOM = 18;
const DEFAULT_TILE_SIZE = 256;
const DEFAULT_BOUNDS_PADDING_RATIO = 0.25;
const COORDINATE_PRECISION = 6; // ~0.11m at equator; separates distinct locations while merging identical floats

export function isValidLocation(location: unknown): location is LatLngLiteral {
  if (!location || typeof location !== 'object') return false;
  const candidate = location as { lat?: unknown; lng?: unknown };
  return (
    typeof candidate.lat === 'number' &&
    typeof candidate.lng === 'number' &&
    Number.isFinite(candidate.lat) &&
    Number.isFinite(candidate.lng) &&
    candidate.lat >= -90 &&
    candidate.lat <= 90 &&
    candidate.lng >= -180 &&
    candidate.lng <= 180
  );
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) || value === 0 ? 0 : value;
}

export function getCoordinateKey(
  location: LatLngLiteral,
  precision: number = COORDINATE_PRECISION
): string {
  const lat = normalizeZero(Number(location.lat.toFixed(precision)));
  const lng = normalizeZero(Number(location.lng.toFixed(precision)));
  return `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
}

function getTimestampMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object') {
    const ts = value as { toMillis?: () => number; seconds?: number };
    if (typeof ts.toMillis === 'function') {
      try {
        return ts.toMillis();
      } catch {
        return 0;
      }
    }
    if (typeof ts.seconds === 'number') {
      return ts.seconds * 1000;
    }
  }
  return 0;
}

export function compareNotesDeterministically(a: Note, b: Note): number {
  const aTime = getTimestampMillis(a.createdAt) || getTimestampMillis(a.updatedAt);
  const bTime = getTimestampMillis(b.createdAt) || getTimestampMillis(b.updatedAt);
  if (aTime !== bTime) {
    return bTime - aTime; // Newest first
  }
  return a.id.localeCompare(b.id);
}

/**
 * Groups notes that share identical (or sub-10cm coincident) coordinates
 * without mutating the original `note.location` values.
 */
export function groupNotesByCoordinate(notes: Note[]): CoordinateGroup[] {
  if (!notes || notes.length === 0) return [];

  const buckets: Record<string, { position: LatLngLiteral; notes: Note[] }> = Object.create(null);

  for (const note of notes) {
    if (!note || !isValidLocation(note.location)) continue;
    const key = getCoordinateKey(note.location);
    if (!buckets[key]) {
      buckets[key] = {
        position: { lat: note.location.lat, lng: note.location.lng },
        notes: [note],
      };
    } else {
      buckets[key].notes.push(note);
    }
  }

  return Object.keys(buckets)
    .sort()
    .map((coordKey) => {
      const bucket = buckets[coordKey];
      const sortedNotes = [...bucket.notes].sort(compareNotesDeterministically);
      return {
        id: `coord:${coordKey}`,
        coordKey,
        position: bucket.position,
        notes: sortedNotes,
      };
    });
}

export function latLngToWorldPixel(
  location: LatLngLiteral,
  zoom: number,
  tileSize: number = DEFAULT_TILE_SIZE
): { x: number; y: number } {
  const safeZoom = Math.max(0, Math.min(22, zoom));
  const scale = tileSize * Math.pow(2, safeZoom);
  const x = ((location.lng + 180) / 360) * scale;
  const sinLat = Math.sin((location.lat * Math.PI) / 180);
  const clampedSin = Math.max(-0.9999, Math.min(0.9999, sinLat));
  const y =
    (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

export function isLocationInBounds(
  location: LatLngLiteral,
  bounds: MapBounds,
  paddingRatio: number = DEFAULT_BOUNDS_PADDING_RATIO
): boolean {
  const latSpan = Math.max(0.0005, bounds.north - bounds.south);
  const latPad = latSpan * paddingRatio;
  const minLat = Math.max(-90, bounds.south - latPad);
  const maxLat = Math.min(90, bounds.north + latPad);

  if (location.lat < minLat || location.lat > maxLat) {
    return false;
  }

  const wrapsAntimeridian = bounds.west > bounds.east;
  const lngSpan = wrapsAntimeridian
    ? 360 - (bounds.west - bounds.east)
    : bounds.east - bounds.west;

  // If viewport covers nearly the full globe horizontally, include all longitudes
  if (lngSpan >= 359) return true;

  const lngPad = Math.max(0.0005, lngSpan) * paddingRatio;
  if (!wrapsAntimeridian) {
    return location.lng >= bounds.west - lngPad && location.lng <= bounds.east + lngPad;
  }

  const paddedWest = bounds.west - lngPad;
  const paddedEast = bounds.east + lngPad;
  return location.lng >= paddedWest || location.lng <= paddedEast;
}

function toClusterFromGroup(group: CoordinateGroup): SingleMarkerCluster | CoincidentMarkerCluster {
  if (group.notes.length === 1) {
    const note = group.notes[0];
    return {
      kind: 'single',
      id: `note:${note.id}`,
      position: note.location,
      note,
      noteCount: 1,
    };
  }

  return {
    kind: 'coincident',
    id: group.id,
    coordKey: group.coordKey,
    position: group.position,
    notes: group.notes,
    noteCount: group.notes.length,
  };
}

/**
 * Clusters pre-grouped coordinate buckets by Web Mercator pixel proximity at `viewport.zoom`.
 * Coincident notes (same coordinate) always stay grouped into a `'coincident'` item so they
 * never stack invisibly even at maximum zoom.
 */
export function clusterCoordinateGroups(
  groups: CoordinateGroup[],
  viewport: MapViewportState,
  options: ClusterOptions = {}
): ClusterItem[] {
  if (!groups || groups.length === 0) return [];

  const radiusPx = options.radiusPx ?? DEFAULT_RADIUS_PX;
  const maxClusterZoom = options.maxClusterZoom ?? DEFAULT_MAX_CLUSTER_ZOOM;
  const tileSize = options.tileSize ?? DEFAULT_TILE_SIZE;
  const paddingRatio = options.boundsPaddingRatio ?? DEFAULT_BOUNDS_PADDING_RATIO;

  const visibleGroups = viewport.bounds
    ? groups.filter((group) => isLocationInBounds(group.position, viewport.bounds!, paddingRatio))
    : groups;

  if (visibleGroups.length === 0) return [];

  // Above maxClusterZoom, distinct coordinates render independently while coincident coordinates stay grouped
  if (viewport.zoom > maxClusterZoom || radiusPx <= 0) {
    return visibleGroups.map(toClusterFromGroup);
  }

  const worldSize = tileSize * Math.pow(2, Math.max(0, Math.min(22, viewport.zoom)));

  // Process denser locations first (then deterministic coordKey) so cluster anchors stay stable
  const ordered = [...visibleGroups].sort((a, b) => {
    if (b.notes.length !== a.notes.length) {
      return b.notes.length - a.notes.length;
    }
    return a.coordKey.localeCompare(b.coordKey);
  });

  const pixels = ordered.map((group) => latLngToWorldPixel(group.position, viewport.zoom, tileSize));
  const cellSize = Math.max(1, radiusPx);
  const grid: Record<string, number[]> = Object.create(null);

  for (let i = 0; i < ordered.length; i++) {
    const cx = Math.floor(pixels[i].x / cellSize);
    const cy = Math.floor(pixels[i].y / cellSize);
    const cellKey = `${cx}:${cy}`;
    if (!grid[cellKey]) {
      grid[cellKey] = [i];
    } else {
      grid[cellKey].push(i);
    }
  }

  const visited = new Uint8Array(ordered.length);
  const items: ClusterItem[] = [];
  const radiusSq = radiusPx * radiusPx;

  for (let i = 0; i < ordered.length; i++) {
    if (visited[i]) continue;
    visited[i] = 1;

    const anchorGroup = ordered[i];
    const anchorPx = pixels[i];
    const cx = Math.floor(anchorPx.x / cellSize);
    const cy = Math.floor(anchorPx.y / cellSize);

    const mergedGroups: CoordinateGroup[] = [anchorGroup];

    for (let dxCell = -1; dxCell <= 1; dxCell++) {
      for (let dyCell = -1; dyCell <= 1; dyCell++) {
        const neighborKey = `${cx + dxCell}:${cy + dyCell}`;
        const candidates = grid[neighborKey];
        if (!candidates) continue;

        for (let k = 0; k < candidates.length; k++) {
          const j = candidates[k];
          if (visited[j]) continue;

          let dx = Math.abs(pixels[j].x - anchorPx.x);
          if (dx > worldSize / 2) {
            dx = worldSize - dx;
          }
          const dy = pixels[j].y - anchorPx.y;
          if (dx * dx + dy * dy <= radiusSq) {
            visited[j] = 1;
            mergedGroups.push(ordered[j]);
          }
        }
      }
    }

    if (mergedGroups.length === 1) {
      items.push(toClusterFromGroup(anchorGroup));
      continue;
    }

    let weightedLatSum = 0;
    let weightedLngSum = 0;
    let totalNotes = 0;
    let north = -90;
    let south = 90;
    let east = -180;
    let west = 180;
    const allNotes: Note[] = [];

    for (const grp of mergedGroups) {
      const weight = grp.notes.length;
      weightedLatSum += grp.position.lat * weight;
      weightedLngSum += grp.position.lng * weight;
      totalNotes += weight;

      if (grp.position.lat > north) north = grp.position.lat;
      if (grp.position.lat < south) south = grp.position.lat;
      if (grp.position.lng > east) east = grp.position.lng;
      if (grp.position.lng < west) west = grp.position.lng;

      for (const note of grp.notes) {
        allNotes.push(note);
      }
    }

    allNotes.sort(compareNotesDeterministically);

    items.push({
      kind: 'cluster',
      id: `cluster:${Math.round(viewport.zoom)}:${anchorGroup.coordKey}:${mergedGroups.length}:${totalNotes}`,
      position: {
        lat: weightedLatSum / totalNotes,
        lng: weightedLngSum / totalNotes,
      },
      notes: allNotes,
      noteCount: totalNotes,
      locationCount: mergedGroups.length,
      bounds: { north, south, east, west },
    });
  }

  return items;
}

export function clusterNotes(
  notes: Note[],
  viewport: MapViewportState,
  options: ClusterOptions = {}
): ClusterItem[] {
  const groups = groupNotesByCoordinate(notes);
  return clusterCoordinateGroups(groups, viewport, options);
}

/**
 * Determines whether clicking a spatial cluster should zoom the map in
 * rather than opening the note list directly.
 */
export function shouldZoomCluster(
  cluster: SpatialMarkerCluster,
  currentZoom: number,
  maxClusterZoom: number = DEFAULT_MAX_CLUSTER_ZOOM
): boolean {
  if (currentZoom >= maxClusterZoom) return false;
  const latSpan = Math.abs(cluster.bounds.north - cluster.bounds.south);
  const lngSpan = Math.abs(cluster.bounds.east - cluster.bounds.west);
  // If locations are practically on top of each other (< ~2m), open list instead of endless zooming
  return latSpan > 0.00002 || lngSpan > 0.00002;
}
