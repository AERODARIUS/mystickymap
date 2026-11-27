# Display or Hide Map Features

## Overview

You can customize the display and visibility of map features in the Maps
JavaScript API using two primary approaches:

1.  **Cloud-based Map Styling**: Configure visibility, opacity, and colors in
    the Google Cloud Console and reference the configuration using a `mapId`.
2.  **Local JSON Styling**: Pass an array of `google.maps.MapTypeStyle` objects
    directly to the map's `styles` option at initialization or dynamically via
    `map.setOptions({ styles: [...] })`.

*Prerequisite: Create reusable, cross-platform map styles.*

--------------------------------------------------------------------------------

## Core Concepts & Style Hierarchy

Map features are organized into a hierarchy where top-level parent features
contain one or more child features. When customizing map styles, you have four
inheritance and scoping options:

-   **Inherit from the base map style**: Uncustomized style elements inherit the
    default style from the base map.
-   **Inherit from parents**: Customizing a style element on a parent map
    feature causes all uncustomized child features below it to inherit that
    style.
-   **Override the parent style**: Customizing a style element on a child map
    feature overrides the parent style for that specific element.
-   **Customize zoom levels**: Style elements can be customized for specific
    zoom levels. Note that not all map features appear at all zoom levels—you
    may need to zoom in or out to see a feature displayed or hidden.

--------------------------------------------------------------------------------

## Controlling Feature Visibility

There are two ways to show or hide map features: **Visibility** and **Opacity**.

> **Warning on Boundary Inaccuracies:** When you hide map features or make them
> transparent, you may expose boundary inaccuracies. Map feature boundaries are
> not always precise, as they are adjusted to look seamless when all layers are
> visible.

### 1. Visibility

Use the **Visibility** style element (`on`, `off`, or `simplified` in JSON
styles) to directly display or hide a map feature.

### 2. Opacity

You can make a map feature transparent by adjusting the opacity of the following
style elements:

-   **Fill color**
-   **Stroke color**
-   **Text fill color**
-   **Text stroke color**

When you adjust the opacity of a map feature, its appearance depends on the map
features underneath. To avoid unexpected visual artifacts, set a custom style
for all overlapping features. *(Note: Opacity is not available for all map
features).*

--------------------------------------------------------------------------------

## Styleable Elements by Geometry Type

Depending on how a map feature is rendered, different style elements are
available:

Feature Geometry         | Typical Examples                                                                             | Styleable Elements                                                                                                       | Restrictions & Notes
:----------------------- | :------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- | :-------------------
**Polygons & Polylines** | *Shapes:* Beach, Country, Town square, Reservation<br>*Lines:* Railway track, Highway, Trail | • Visibility<br>• Fill color<br>• Stroke color<br>• Stroke width                                                         | • To remove an outline, set **Stroke color** equal to **Fill color**, or set **Stroke width** to `0`.<br>• **Stroke color** and **Stroke width** are **NOT available** for Political features (`Country`, `Border`, `State or province`, `Sublocality`) or 3D style buildings.
**Icons & Text Labels**  | Transportation and other non-POI label types                                                 | • Visibility<br>• Icon color<br>• Text fill color<br>• Text stroke color                                                 | Applies to features partially or fully represented with a label.
**Pins**                 | Point of interest (POI) features                                                             | • Visibility<br>• Pin outline color<br>• Pin fill color<br>• Pin glyph color<br>• Text fill color<br>• Text stroke color | Specifically targets POI pins and their accompanying text labels.

--------------------------------------------------------------------------------

## Map Feature Hierarchy Reference

Use the following hierarchy tables to identify parent and child map features for
cloud-based styling and local JSON feature targeting:

### Point of Interest (POI)

Parent Feature       | Child Features
:------------------- | :-------------
**Emergency**        | Fire, Hospital, Pharmacy, Police
**Entertainment**    | Arts, Casino, Cinema, Historic, Museum, Theme park, Tourist attraction
**Food and drink**   | Bar, Cafe, Restaurant, Winery
**Landmark**         | *(No children)*
**Lodging**          | *(No children)*
**Recreation**       | Beach, Boating, Fishing, Golf course, Hot spring, Nature reserve, Park, Peak, Sports complex, Sports field, Trailhead, Zoo
**Retail**           | Grocery, Shopping
**Service**          | ATM, Bank, Car rental, EV charging, Gas station, Parking lot, Post office, Rest stop, Restroom
**Transit**          | Airport
**Other**            | Bridge
**Cemetery**         | *(No children)*
**Government**       | *(No children)*
**Library**          | *(No children)*
**Military**         | *(No children)*
**Place of worship** | Buddhist, Christian, Hindu, Islamic, Jain, Jewish, Shinto, Sikh
**School**           | *(No children)*
**Town square**      | *(No children)*

### Political

Parent Feature        | Child Features
:-------------------- | :--------------
**Country**           | *(No children)*
**Border**            | *(No children)*
**Reservation**       | *(No children)*
**State or province** | *(No children)*
**City**              | *(No children)*
**Sublocality**       | *(No children)*
**Neighborhood**      | *(No children)*
**Land parcel**       | *(No children)*

### Infrastructure

Parent Feature               | Level 1 Child Features                                      | Level 2 Child Features
:--------------------------- | :---------------------------------------------------------- | :---------------------
**Building**                 | Commercial, Indoor                                          | —
**Business corridor**        | *(No children)*                                             | —
**Road network**             | No traffic                                                  | Pedestrian mall
**Trail**                    | Paved, Unpaved                                              | —
**Parking aisle**            | *(No children)*                                             | —
**Ramp**                     | *(No children)*                                             | —
**Road shield**              | *(No children)*                                             | —
**Road sign**                | *(No children)*                                             | —
**Road**                     | Arterial, Highway, Local, No outlet                         | —
**Road detail** <sup>*</sup> | Surface, Crosswalk, Sidewalk, Intersection, Direction arrow | —
**Railway track**            | Commercial, Commuter                                        | —
**Transit station**          | Bicycle share                                               | —
**Bus station**              | *(No children)*                                             | —
**Ferry terminal**           | *(No children)*                                             | —
**Funicular station**        | *(No children)*                                             | —
**Gondola station**          | *(No children)*                                             | —
**Monorail**                 | *(No children)*                                             | —
**Rail station**             | Subway station, Tram station                                | —
**Urban area**               | *(No children)*                                             | —

<sup>*</sup> *Road detail map features are only available on Google Maps
Platform products that have road level details enabled.*

### Natural

Parent Feature  | Level 1 Child Features    | Level 2 Child Features
:-------------- | :------------------------ | :---------------------
**Continent**   | *(No children)*           | —
**Archipelago** | *(No children)*           | —
**Island**      | *(No children)*           | —
**Land**        | Land cover <sup>†</sup>   | Crops, Dry crops, Forest, Ice, Sand, Shrub, Tundra
**Water**       | Ocean, Lake, River, Other | —
**Base**        | *(No children)*           | —

<sup>†</sup> *Land cover map features are rough approximations based on
satellite imagery colors and may not accurately reflect real-world conditions.*

--------------------------------------------------------------------------------

## Implementation Patterns

### 1. Dynamically Hiding and Showing Features (Vanilla TypeScript/JS)

You can toggle feature visibility at runtime by defining
`google.maps.MapTypeStyle[]` configurations and applying them via
`map.setOptions({ styles })`.

Source:
[samples/hiding-features/index.ts](https://github.com/googlemaps/js-samples/blob/HEAD/samples/hiding-features/index.ts?utm_campaign=gmp_git_agentskills_v1)

```typescript
let map: google.maps.Map;

const styles: Record<string, google.maps.MapTypeStyle[]> = {
  default: [],
  hide: [
    {
      featureType: "poi.business",
      stylers: [{ visibility: "off" }],
    },
    {
      featureType: "transit",
      elementType: "labels.icon",
      stylers: [{ visibility: "off" }],
    },
  ],
};

async function initMap(): Promise<void> {
  const { Map } = (await google.maps.importLibrary("maps")) as google.maps.MapsLibrary;

  map = new Map(document.getElementById("map") as HTMLElement, {
    center: { lat: -33.86, lng: 151.209 },
    zoom: 13,
    mapTypeControl: false,
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });

  // Add UI controls to the map allowing users to toggle feature visibility
  const styleControl = document.getElementById("style-selector-control") as HTMLElement;
  map.controls[google.maps.ControlPosition.TOP_LEFT].push(styleControl);

  (document.getElementById("hide-poi") as HTMLElement).addEventListener("click", () => {
    map.setOptions({ styles: styles["hide"] });
  });

  (document.getElementById("show-poi") as HTMLElement).addEventListener("click", () => {
    map.setOptions({ styles: styles["default"] });
  });
}

initMap();
```

### 2. Default-Off Whitelist Pattern (Hiding All Features Except Selected)

When building specialized views (like data overlays or games), you can turn off
all features at the root level and selectively re-enable specific parent or
child features (`water`, `landscape`, `administrative.country`).

Source:
[samples/map-puzzle/index.ts](https://github.com/googlemaps/js-samples/blob/HEAD/samples/map-puzzle/index.ts?utm_campaign=gmp_git_agentskills_v1)

```typescript
const whitelistStyles: google.maps.MapTypeStyle[] = [
  // 1. Hide all features globally
  {
    stylers: [{ visibility: "off" }],
  },
  // 2. Selectively turn on water and landscape
  {
    featureType: "water",
    stylers: [{ visibility: "on" }, { color: "#d4d4d4" }],
  },
  {
    featureType: "landscape",
    stylers: [{ visibility: "on" }, { color: "#e5e3df" }],
  },
  // 3. Re-enable country labels and borders
  {
    featureType: "administrative.country",
    elementType: "labels",
    stylers: [{ visibility: "on" }],
  },
  {
    featureType: "administrative.country",
    elementType: "geometry",
    stylers: [{ visibility: "on" }, { weight: 1.3 }],
  },
];
```

### 3.Applying Cloud-Based Map Styles (`mapId`)

If you configure your feature visibility rules in the Google Cloud Console,
apply them by passing the `mapId` when instantiating the `Map`.

Source:
[samples/map-id-style/index.ts](https://github.com/googlemaps/js-samples/blob/HEAD/samples/map-id-style/index.ts?utm_campaign=gmp_git_agentskills_v1)

```typescript
async function initMap(): Promise<void> {
  const { Map } = (await google.maps.importLibrary("maps")) as google.maps.MapsLibrary;

  new Map(document.getElementById("map") as HTMLElement, {
    mapId: "8e0a97af9386fef",
    center: { lat: 48.85, lng: 2.35 },
    zoom: 12,
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });
}

initMap();
```

### 4. Switching Between Cloud Styles and Local Feature Visibility in React

When using `@vis.gl/react-google-maps`, you can switch between cloud-based
`mapId` styles and local `styles` arrays.

> **Billing & Lifecycle Note:** Due to how the Maps JavaScript API works,
> changing the `mapId` requires creating a new `google.maps.Map` instance under
> the hood, which affects the number of billed map views.

Source:
[examples/change-map-styles/src/app.tsx](https://github.com/visgl/react-google-maps/blob/HEAD/examples/change-map-styles/src/app.tsx?utm_campaign=gmp_git_agentskills_v1)
&
[examples/change-map-styles/src/map-styles/bright-colors.ts](https://github.com/visgl/react-google-maps/blob/HEAD/examples/change-map-styles/src/map-styles/bright-colors.ts?utm_campaign=gmp_git_agentskills_v1)

```tsx
import React, { useState } from 'react';
import { APIProvider, Map } from '@vis.gl/react-google-maps';

const noLabelsStyle: google.maps.MapTypeStyle[] = [
  {
    featureType: 'all',
    elementType: 'all',
    stylers: [{ saturation: '32' }, { lightness: '-3' }, { visibility: 'on' }, { weight: '1.18' }]
  },
  {
    featureType: 'administrative',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }]
  },
  {
    featureType: 'landscape',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }]
  },
  {
    featureType: 'poi',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }]
  },
  {
    featureType: 'road',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }]
  },
  {
    featureType: 'transit',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }]
  },
  {
    featureType: 'water',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }]
  }
];

export const StyledMapApp = ({ apiKey }: { apiKey: string }) => {
  const [hideLabels, setHideLabels] = useState(true);

  return (
    <APIProvider apiKey={apiKey}>
      <button onClick={() => setHideLabels(!hideLabels)}>
        Toggle Feature Labels
      </button>
      <Map
        defaultCenter={{ lat: 22, lng: 0 }}
        defaultZoom={3}
        styles={hideLabels ? noLabelsStyle : []}
        gestureHandling={'greedy'}
        disableDefaultUI={true}
        internalUsageAttributionIds={['gmp_git_agentskills_v1']}
      />
    </APIProvider>
  );
};
```
