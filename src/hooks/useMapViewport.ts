import { useEffect, useState } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import type { MapBounds, MapViewportState } from '../lib/markerClustering';

const DEFAULT_ZOOM = 15;

type GoogleMapInstance = NonNullable<ReturnType<typeof useMap>>;

function readBounds(map: GoogleMapInstance): MapBounds | null {
  const bounds = typeof map.getBounds === 'function' ? map.getBounds() : undefined;
  if (!bounds) return null;

  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  if (!ne || !sw) return null;

  return {
    north: ne.lat(),
    south: sw.lat(),
    east: ne.lng(),
    west: sw.lng(),
  };
}

function areBoundsClose(a: MapBounds | null | undefined, b: MapBounds | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const eps = 1e-6;
  return (
    Math.abs(a.north - b.north) < eps &&
    Math.abs(a.south - b.south) < eps &&
    Math.abs(a.east - b.east) < eps &&
    Math.abs(a.west - b.west) < eps
  );
}

export function useMapViewport(fallbackZoom: number = DEFAULT_ZOOM): MapViewportState {
  const map = useMap();
  const [viewport, setViewport] = useState<MapViewportState>(() => ({
    zoom: fallbackZoom,
    bounds: null,
  }));

  useEffect(() => {
    if (!map) return;

    const syncViewport = () => {
      const nextZoom = typeof map.getZoom === 'function' ? map.getZoom() ?? fallbackZoom : fallbackZoom;
      const nextBounds = readBounds(map);

      setViewport((prev) => {
        if (prev.zoom === nextZoom && areBoundsClose(prev.bounds, nextBounds)) {
          return prev;
        }
        return { zoom: nextZoom, bounds: nextBounds };
      });
    };

    syncViewport();

    const listener =
      typeof map.addListener === 'function' ? map.addListener('idle', syncViewport) : null;

    return () => {
      if (listener && typeof listener.remove === 'function') {
        listener.remove();
      }
    };
  }, [map, fallbackZoom]);

  return viewport;
}
