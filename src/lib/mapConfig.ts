export const DEFAULT_DEMO_MAP_ID = 'DEMO_MAP_ID';
export const DEFAULT_USER_ZOOM = 15;
export const WORLD_VIEW_CENTER = { lat: 20, lng: 0 };
export const WORLD_VIEW_ZOOM = 2;
export const WORLD_CONTINENTS_BOUNDS = {
  north: 72,
  south: -56,
  west: -168,
  east: 178,
};
export const WORLD_VIEW_PADDING = { top: 24, right: 16, bottom: 24, left: 16 };

/**
 * Resolves the Google Maps Cloud Map ID from environment configuration,
 * falling back to DEMO_MAP_ID so AdvancedMarkerElement continues to render
 * when a custom Cloud Map ID has not been configured yet.
 */
export function resolveMapId(rawMapId?: string | null): string {
  const normalized = typeof rawMapId === 'string' ? rawMapId.trim() : '';
  if (
    !normalized ||
    normalized === 'YOUR_MAP_ID' ||
    normalized === 'undefined' ||
    normalized === 'null'
  ) {
    return DEFAULT_DEMO_MAP_ID;
  }
  return normalized;
}
