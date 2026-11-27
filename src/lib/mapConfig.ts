export const DEFAULT_DEMO_MAP_ID = 'DEMO_MAP_ID';

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
