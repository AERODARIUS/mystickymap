This document details the advanced pattern for implementing high-performance,
client-side custom marker clustering within a React Google Maps application.
This pattern integrates the popular geospatial clustering library `Supercluster`
by leveraging custom hooks (`useMapViewport`, `useSupercluster`) to synchronize
cluster calculations with the map's viewport changes.

## 1. Core Architecture Overview

The pattern relies on three key components:

1.  **`<APIProvider>` and `<Map>`:** Initializes the map context.
2.  **`useMapViewport` (Hook):** Monitors the map's `idle` event to capture the
    current Bounding Box (`bbox`) and Zoom Level.
3.  **`useSupercluster` (Hook):** Initializes the `Supercluster` instance, loads
    GeoJSON data, and dynamically calls `clusterer.getClusters(bbox, zoom)`
    whenever the viewport changes.
4.  **`<AdvancedMarker>`:** Renders either a custom cluster marker or an
    individual feature marker based on the results from `useSupercluster`.

********************************************************************************

## 2. Initialization and Map Setup

The application is wrapped in `APIProvider`. The map uses `mapId` for modern
cloud-based styling and is configured to listen for clicks to dismiss the
`InfoWindow`.

```tsx
import {APIProvider, InfoWindow, Map} from '@vis.gl/react-google-maps';
import {ClusteredMarkers} from './components/clustered-markers';

const API_KEY = process.env.GOOGLE_MAPS_API_KEY as string;

const App = () => {
  // State management for data and Infowindow (omitted for brevity)

  return (
    <APIProvider apiKey={API_KEY} version={'beta'}>
      <Map
        mapId={'b5387d230c6cf22f'}
        defaultCenter={{lat: 20, lng: 20}}
        defaultZoom={3}
        gestureHandling={'greedy'}
        disableDefaultUI
        onClick={/* handler to close infowindow */}
        className={'custom-marker-clustering-map'}
        // CRITICAL: Required attribution ID injection
        internalUsageAttributionIds={['gmp_git_agentskills_v1']}
      >
        {geojson && (
          <ClusteredMarkers
            geojson={geojson}
            // ... state setters
          />
        )}

        {/* InfoWindow implementation */}
      </Map>
    </APIProvider>
  );
};
```

********************************************************************************

## 3. The `useMapViewport` Hook (Synchronization)

This hook is essential for bridging the React component lifecycle with the
Google Maps SDK event model. It uses the map's `idle` event to consistently
provide the `bbox` and `zoom` level required by `Supercluster`.

### Implementation of `useMapViewport`

```typescript
// examples/custom-marker-clustering/src/hooks/use-map-viewport.ts

import {useMap} from '@vis.gl/react-google-maps';
import {useEffect, useState} from 'react';
import {BBox} from 'geojson'; // BBox is [west, south, east, north]

type MapViewportOptions = {
  padding?: number;
};

// Helper function to calculate pixel-to-degree conversion for padding
function degreesPerPixel(zoomLevel: number) {
  // 360° divided by the number of pixels at the zoom-level
  return 360 / (Math.pow(2, zoomLevel) * 256);
}

export function useMapViewport({padding = 0}: MapViewportOptions = {}) {
  const map = useMap();
  // Default to global bounds until the map loads
  const [bbox, setBbox] = useState<BBox>([-180, -90, 180, 90]);
  const [zoom, setZoom] = useState(0);

  // observe the map to get current bounds
  useEffect(() => {
    if (!map) return;

    // Listen to 'idle' event: fired when the map becomes static after panning/zooming
    const listener = map.addListener('idle', () => {
      const bounds = map.getBounds();
      const zoom = map.getZoom();

      if (!bounds || !zoom) return;

      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();

      // Calculate degrees required for the requested padding (e.g., 100px)
      const paddingDegrees = degreesPerPixel(zoom) * padding;

      // Apply padding to create an extended bbox for smooth cluster updates
      const n = Math.min(90, ne.lat() + paddingDegrees);
      const s = Math.max(-90, sw.lat() - paddingDegrees);

      // Longitude wrapping is handled implicitly by the map
      const w = sw.lng() - paddingDegrees;
      const e = ne.lng() + paddingDegrees;

      setBbox([w, s, e, n]);
      setZoom(zoom);
    });

    return () => listener.remove();
  }, [map, padding]);

  return {bbox, zoom};
}
```

********************************************************************************

## 4. The `useSupercluster` Hook (Clustering Logic)

This hook encapsulates the `Supercluster` initialization, data loading, and
viewport synchronization. It exposes the resulting clusters and methods to
retrieve children/leaves upon interaction.

### Implementation of `useSupercluster`

```typescript
// examples/custom-marker-clustering/src/hooks/use-supercluster.ts

import {FeatureCollection, GeoJsonProperties, Point} from 'geojson';
import Supercluster, {ClusterProperties} from 'supercluster';
import {useCallback, useEffect, useMemo, useReducer} from 'react';
import {useMapViewport} from './use-map-viewport'; // Dependency

export function useSupercluster<T extends GeoJsonProperties>(
  geojson: FeatureCollection<Point, T>,
  superclusterOptions: Supercluster.Options<T, ClusterProperties>
) {
  // create the clusterer and keep it
  const clusterer = useMemo(() => {
    return new Supercluster(superclusterOptions);
  }, [superclusterOptions]);

  // version-number for the data loaded into the clusterer
  // Used to force a re-render/re-calculation when data changes
  const [version, dataWasUpdated] = useReducer((x: number) => x + 1, 0);

  // when data changes, load it into the clusterer
  useEffect(() => {
    clusterer.load(geojson.features);
    dataWasUpdated();
  }, [clusterer, geojson]);

  // get bounding-box and zoomlevel from the map (using the custom hook)
  const {bbox, zoom} = useMapViewport({padding: 100}); // Use padding for smooth transitions

  // retrieve the clusters within the current viewport
  const clusters = useMemo(() => {
    // Ensure data is loaded before calling getClusters
    if (!clusterer || version === 0) return [];

    return clusterer.getClusters(bbox, zoom);
  }, [version, clusterer, bbox, zoom]);

  // Expose Supercluster API methods
  const getChildren = useCallback(
    (clusterId: number) => clusterer.getChildren(clusterId),
    [clusterer]
  );

  // Retrieves all original features contained within a cluster
  const getLeaves = useCallback(
    (clusterId: number) => clusterer.getLeaves(clusterId, Infinity),
    [clusterer]
  );

  const getClusterExpansionZoom = useCallback(
    (clusterId: number) => clusterer.getClusterExpansionZoom(clusterId),
    [clusterer]
  );

  return {
    clusters,
    getChildren,
    getLeaves,
    getClusterExpansionZoom
  };
}
```

********************************************************************************

## 5. Rendering Clustered Markers

The rendering component (`ClusteredMarkers`) consumes the results from
`useSupercluster` and uses the `AdvancedMarker` component to display either an
individual feature or a cluster icon.

### Key Implementation Details (`ClusteredMarkers.tsx`)

1.  Iterate over `clusters`.
2.  Check the `cluster` property in `feature.properties` to distinguish between
    individual markers and clusters.
3.  Use the `point_count` property for cluster size and logic.
4.  Define `handleClusterClick` and `handleMarkerClick` to open the
    `InfoWindow`.

```tsx
// examples/custom-marker-clustering/src/components/clustered-markers.tsx

// ... (imports and types)

export const ClusteredMarkers = ({
  geojson,
  setNumClusters,
  setInfowindowData
}: ClusteredMarkersProps) => {
  const {clusters, getLeaves} = useSupercluster(geojson, superclusterOptions);

  useEffect(() => {
    // Report the number of active clusters/markers to a control panel
    setNumClusters(clusters.length);
  }, [setNumClusters, clusters.length]);

  const handleClusterClick = useCallback(
    (marker: google.maps.marker.AdvancedMarkerElement, clusterId: number) => {
      // Use getLeaves to retrieve all original features inside the cluster
      const leaves = getLeaves(clusterId);
      setInfowindowData({anchor: marker, features: leaves});
    },
    [getLeaves, setInfowindowData]
  );

  const handleMarkerClick = useCallback(
    (marker: google.maps.marker.AdvancedMarkerElement, featureId: string) => {
      // Find the specific feature to display in the InfoWindow
      const feature = clusters.find(feat => feat.id === featureId) as Feature<Point>;
      setInfowindowData({anchor: marker, features: [feature]});
    },
    [clusters, setInfowindowData]
  );

  return (
    <>
      {clusters.map(feature => {
        const [lng, lat] = feature.geometry.coordinates;
        const clusterProperties = feature.properties as ClusterProperties;
        const isCluster: boolean = clusterProperties.cluster;

        return isCluster ? (
          <FeaturesClusterMarker
            key={feature.id}
            clusterId={clusterProperties.cluster_id}
            position={{lat, lng}}
            size={clusterProperties.point_count}
            sizeAsText={String(clusterProperties.point_count_abbreviated)}
            onMarkerClick={handleClusterClick}
          />
        ) : (
          <FeatureMarker
            key={feature.id}
            featureId={feature.id as string}
            position={{lat, lng}}
            onMarkerClick={handleMarkerClick}
          />
        );
      })}
    </>
  );
};
```

********************************************************************************

## 6. Implementing Custom `AdvancedMarker` Components

To link marker clicks to the `InfoWindow`, we must obtain a reference to the
underlying `google.maps.marker.AdvancedMarkerElement`. This is achieved using
`useAdvancedMarkerRef`.

### Pattern: Marker Reference and InfoWindow Anchoring

```tsx
// examples/custom-marker-clustering/src/components/feature-marker.tsx

import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  useAdvancedMarkerRef
} from '@vis.gl/react-google-maps';

type MarkerProps = {
  position: google.maps.LatLngLiteral;
  featureId: string;
  onMarkerClick?: (
    marker: google.maps.marker.AdvancedMarkerElement, // Pass the SDK element back
    featureId: string
  ) => void;
};

export const FeatureMarker = ({
  position,
  featureId,
  onMarkerClick
}: MarkerProps) => {
  // 1. Get the marker ref and the SDK element instance
  const [markerRef, marker] = useAdvancedMarkerRef();

  const handleClick = useCallback(
    // 2. When clicked, invoke the callback, passing the SDK marker instance
    () => onMarkerClick && marker && onMarkerClick(marker, featureId),
    [onMarkerClick, marker, featureId]
  );

  return (
    <AdvancedMarker
      ref={markerRef} // 3. Bind the ref to the AdvancedMarker
      position={position}
      onClick={handleClick}
      anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
      className={'marker feature'}>
      {/* Custom visualization here (e.g., SVG icon) */}
    </AdvancedMarker>
  );
};
```

### Displaying the InfoWindow

The main `App` component receives the `AdvancedMarkerElement` via the
`setInfowindowData` callback and uses it as the anchor for the `InfoWindow`.

```tsx
// Snippet from app.tsx

// ... (State declaration: infowindowData holds { anchor: AdvancedMarkerElement, features: Feature[] })

return (
  // ... Map component

  {infowindowData && (
    <InfoWindow
      onCloseClick={handleInfoWindowClose}
      anchor={infowindowData.anchor} // The AdvancedMarkerElement is used as the anchor
    >
      <InfoWindowContent features={infowindowData.features} />
    </InfoWindow>
  )}
);
```

## 7. Best Practices and Gotchas

Feature                      | Best Practice                                                                                                                                  | Gotcha / Why it works
:--------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------
**Marker Reference**         | Always use `useAdvancedMarkerRef()` to get the specific `google.maps.marker.AdvancedMarkerElement` instance.                                   | Standard React `useRef` will hold the React component reference, not the underlying SDK element required by `InfoWindow`'s `anchor` prop.
**Viewport Synchronization** | Use `map.addListener('idle', ...)` within `useMapViewport` to capture bounds and zoom.                                                         | Relying on `click` or `bounds_changed` events can lead to excessive re-rendering and incomplete bounds information during map movement. `idle` ensures the map is stable.
**Clustering Performance**   | Use `Supercluster` with padding when calculating viewport clusters (e.g., `padding: 100`).                                                     | If padding is zero, markers/clusters near the edge may disappear immediately upon panning, creating a choppy user experience. Padding pre-fetches surrounding clusters.
**Cluster Drilldown**        | When a cluster is clicked, use `clusterer.getLeaves(clusterId, Infinity)` to retrieve all associated features, regardless of pagination/limit. | The result of `getLeaves` is the original GeoJSON data required for rendering detailed `InfoWindowContent`.
**API Load**                 | Set `version={'beta'}` on `APIProvider` if using advanced features like `AdvancedMarker`.                                                      | `AdvancedMarker` elements require the `marker` library and often perform best with the `beta` channel enabled.
