# Change the density of places on a map

## Overview

You can control the density of points of interest (POIs) displayed on a map.
POIs—which include parks, schools, and recreation areas—appear on the map with
their corresponding icons by default. Adjusting POI density allows you to
control how many of these points of interest are rendered without individually
toggling specific feature categories.

*   **Availability:** Visible on Android, iOS, Maps JavaScript API, and Maps
    Static. Not available for 3D Maps.
*   **Experimental Limitation:** This feature can only be configured on
    **light** map styles in the Google Cloud Console. However, when you link a
    light map style that has POI density settings to a Map ID, those density
    settings automatically apply to the associated **dark** map style as well.
*   **Alternative:** If you want to control the visibility of specific map
    features (including specific POI categories), see
    [Filter which map features to display](https://developers.google.com/maps/documentation/javascript/cloud-customization/viz).

## Prerequisites

*   **Create reusable, cross-platform map styles:** You must have a Cloud-based
    map style and an associated **Map ID** configured in the Google Cloud
    Console.

--------------------------------------------------------------------------------

## Workflow

### Step 1: Configure POI Density in the Cloud Console

POI density is configured via Cloud-based map styling rather than runtime
JavaScript properties:

1.  Open your **light** map style in the Google Cloud Console style editor.
2.  Zoom in on the preview map enough to see points of interest displayed.
3.  In the **Map features** panel, select the settings gear icon to open the
    **Map Settings** menu.
4.  Select your desired **POI Density** level. The **Map Settings** menu will
    close, and the preview map will immediately adjust the density of points of
    interest.
5.  Save and publish your map style, ensuring it is linked to your target **Map
    ID**.

--------------------------------------------------------------------------------

### Step 2: Initialize the Map with Your Styled Map ID

To apply the POI density configuration in your Maps JavaScript API application,
instantiate `google.maps.Map` with the `mapId` associated with your published
style.

#### Modern Asynchronous Pattern (`importLibrary`)

This pattern uses dynamic library import (`google.maps.importLibrary`), which is
the recommended way to load and initialize the Maps JavaScript API.

```typescript
let map: google.maps.Map;

async function initMap(): Promise<void> {
  // Request the needed libraries
  const { Map } = (await google.maps.importLibrary("maps")) as google.maps.MapsLibrary;

  // Instantiate the map with the Map ID linked to your POI density style
  map = new Map(document.getElementById("map") as HTMLElement, {
    center: { lat: 48.85, lng: 2.35 },
    zoom: 14, // Zoom in enough to observe Points of Interest
    mapId: "YOUR_MAP_ID", // Replace with your styled Map ID (e.g., "8e0a97af9386fef")
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });
}

initMap();
```

#### Global Script Callback Pattern

If you load the Maps JavaScript API via a legacy global callback
(`window.initMap`), pass the `mapId` inside `google.maps.MapOptions`:

```typescript
function initMap(): void {
  new google.maps.Map(
    document.getElementById("map") as HTMLElement,
    {
      mapId: "8e0a97af9386fef", // Replace with your styled Map ID
      center: { lat: 48.85, lng: 2.35 },
      zoom: 12,
      internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
    } as google.maps.MapOptions
  );
}

declare global {
  interface Window {
    initMap: () => void;
  }
}
window.initMap = initMap;
```

#### 2D Web Component Pattern (`<gmp-map>`)

If you are using the `<gmp-map>` Custom Element in HTML, provide your `map-id`
and usage attribution directly as HTML attributes:

```html
<gmp-map
  center="48.85,2.35"
  zoom="14"
  map-id="YOUR_MAP_ID"
  internal-usage-attribution-ids="gmp_git_agentskills_v1"
  style="height: 100%; width: 100%;"
></gmp-map>
```

--------------------------------------------------------------------------------

## Verification & Troubleshooting

*   **Zoom Level:** Points of interest only appear at sufficient zoom levels
    (typically city or neighborhood level, such as `zoom: 12` to `16`). If you
    do not see POIs, zoom in closer on an urban or populated area.
*   **Light vs. Dark Style Configuration:** If the POI density option is
    disabled or missing in the Cloud Console **Map Settings** gear menu, verify
    that you are editing a **Light** map style.
*   **Map ID Association:** Ensure you have clicked **Save** and **Publish** on
    your map style in the Google Cloud Console, and that the `mapId` string in
    your code matches the Map ID linked to that style.

--------------------------------------------------------------------------------

## Reference Sources

*   [Sample: Map ID Style (`samples/map-id-style/index.ts`)](https://github.com/googlemaps/js-samples/blob/HEAD/samples/map-id-style/index.ts?utm_campaign=gmp_git_agentskills_v1)
*   [Sample: Add Map (`samples/add-map/index.ts`)](https://github.com/googlemaps/js-samples/blob/HEAD/samples/add-map/index.ts?utm_campaign=gmp_git_agentskills_v1)
*   [Filter which map features to display](https://developers.google.com/maps/documentation/javascript/cloud-customization/viz)
