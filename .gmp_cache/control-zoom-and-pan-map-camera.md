# Control Zoom and Pan on a Map (Camera)

The Maps JavaScript API models the map view as a **camera** looking down on a
flat plane. You can control the camera's position, zoom, tilt, and heading
(bearing) both at initialization and programmatically at runtime. You can also
restrict user panning and zooming to specific geographic bounds or disable
camera gestures entirely.

## Prerequisites

Before controlling the camera, ensure you have a basic map initialized on your
page. For programmatic **tilt** and **heading** (rotation) support, you must use
a **Vector Map**:

-   When loading via a `<div>` and JavaScript, the default rendering type is
    `RASTER`. To enable the vector map, configure a Map ID in the Google Cloud
    Console with Vector rendering, Tilt, and Rotation enabled, and pass `mapId`
    in `google.maps.MapOptions`.
-   When loading via the `<gmp-map>` web component, the default rendering type
    is `VECTOR` with tilt and heading control enabled by default.

--------------------------------------------------------------------------------

## Camera Properties

The position of the camera is defined by four primary properties:

| Property                | Type           | Description                       |
| :---------------------- | :------------- | :-------------------------------- |
| **`center`** (Target)   | `LatLng \|     | Latitude and longitude            |
:                         : LatLngLiteral` : coordinates at the center of the  :
:                         :                : map. Latitude is clamped between  :
:                         :                : `-85` and `85` degrees. Longitude :
:                         :                : wraps within `(-180, 180)`.       :
| **`zoom`**              | `number`       | Determines the scale of the map   |
:                         :                : (`1`\: World, `5`\: Continent,    :
:                         :                : `10`\: City, `15`\: Streets,      :
:                         :                : `20`\: Buildings). Need not be an :
:                         :                : integer when fractional zoom is   :
:                         :                : enabled.                          :
| **`heading`** (Bearing) | `number`       | Compass direction in clockwise    |
:                         :                : degrees from true north (`0` =    :
:                         :                : North, `90` = East, `180` =       :
:                         :                : South). Values are wrapped into   :
:                         :                : `[0, 360]`. *(Requires Vector     :
:                         :                : Map)*                             :
| **`tilt`**              | `number`       | Viewing angle in degrees from the |
:                         :                : nadir/zenith (`0` = straight      :
:                         :                : down, `45` = oblique              :
:                         :                : perspective). Maximum allowed     :
:                         :                : tilt varies by zoom level and is  :
:                         :                : clamped automatically. *(Requires :
:                         :                : Vector Map)*                      :

--------------------------------------------------------------------------------

## Programmatic Camera Control

### 1. Update Multiple Camera Properties at Once (`moveCamera`)

Use `map.moveCamera(cameraOptions)` to simultaneously update any combination of
`center`, `zoom`, `heading`, and `tilt`.

```javascript
async function initMap() {
  const { Map } = await google.maps.importLibrary("maps");

  const map = new Map(document.getElementById("map"), {
    center: { lat: 37.7893719, lng: -122.3942 },
    zoom: 16,
    heading: 320,
    tilt: 47.5,
    mapId: "90f87356969d889c", // Vector Map ID
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });

  // Update multiple camera properties simultaneously
  map.moveCamera({
    center: { lat: 37.795, lng: -122.4 },
    zoom: 17,
    heading: 0,
    tilt: 30,
  });
}

initMap();
```

### 2. Adjust Individual Camera Properties

You can read and update individual properties using getter and setter methods on
the `google.maps.Map` instance:

-   **Center / Pan**: `map.setCenter(latlng)`, `map.getCenter()`,
    `map.panBy(x, y)`, `map.panTo(latlng)`, `map.panToBounds(latLngBounds)`
-   **Zoom**: `map.setZoom(zoom)`, `map.getZoom()`
-   **Bounds**: `map.fitBounds(latLngBounds)`, `map.getBounds()`
-   **Tilt**: `map.setTilt(tilt)`, `map.getTilt()`
-   **Heading**: `map.setHeading(heading)`, `map.getHeading()`

#### Example: Custom UI Controls for Tilt and Rotation

Source:
[Tilt and Rotation Documentation](https://developers.google.com/maps/documentation/javascript/vector-map#tilt-rotation)

```typescript
async function initMap(): Promise<void> {
  const { Map } = (await google.maps.importLibrary("maps")) as google.maps.MapsLibrary;

  const map = new Map(document.getElementById("map") as HTMLElement, {
    center: { lat: 37.7893719, lng: -122.3942 },
    zoom: 16,
    heading: 320,
    tilt: 47.5,
    mapId: "90f87356969d889c",
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });

  const buttons: [string, string, number, google.maps.ControlPosition][] = [
    ["Rotate Left", "rotate", 20, google.maps.ControlPosition.LEFT_CENTER],
    ["Rotate Right", "rotate", -20, google.maps.ControlPosition.RIGHT_CENTER],
    ["Tilt Down", "tilt", 20, google.maps.ControlPosition.TOP_CENTER],
    ["Tilt Up", "tilt", -20, google.maps.ControlPosition.BOTTOM_CENTER],
  ];

  const adjustMap = (mode: string, amount: number) => {
    switch (mode) {
      case "tilt":
        map.setTilt(map.getTilt()! + amount);
        break;
      case "rotate":
        map.setHeading(map.getHeading()! + amount);
        break;
      default:
        break;
    }
  };

  buttons.forEach(([text, mode, amount, position]) => {
    const controlDiv = document.createElement("div");
    const controlUI = document.createElement("button");

    controlUI.classList.add("ui-button");
    controlUI.innerText = text;
    controlUI.addEventListener("click", () => {
      adjustMap(mode, amount);
    });
    controlDiv.appendChild(controlUI);
    map.controls[position].push(controlDiv);
  });
}

initMap();
```

#### Impact of Tilt and Rotation on Other Map Methods

-   `map.getBounds()` always returns the smallest bounding box that includes the
    visible region. When tilt is applied, the returned bounds may represent a
    larger region than the visible viewport.
-   `map.fitBounds()` and `map.panToBounds()` **reset tilt and heading to `0`**
    prior to fitting or panning to the bounds.
-   To change the map center while preserving tilt and heading, use
    `map.setCenter()`, `map.panBy()`, or `map.moveCamera()`.

--------------------------------------------------------------------------------

## Camera Animations

### Simple `requestAnimationFrame` Loop

You can animate camera properties smoothly by calling `map.moveCamera()` inside
a `requestAnimationFrame` callback:

```javascript
const degreesPerSecond = 3;

function animateCamera(time) {
  // Rotate the heading continuously, leaving center, zoom, and tilt as-is
  map.moveCamera({
    heading: (time / 1000) * degreesPerSecond,
  });

  requestAnimationFrame(animateCamera);
}

requestAnimationFrame(animateCamera);
```

### Smooth Easing Animation with Tween.js

For complex camera transitions across `tilt`, `heading`, `zoom`, and `center`,
combine `map.moveCamera()` with an easing library like `@tweenjs/tween.js`.

Source:
[samples/move-camera-ease/index.ts](https://github.com/googlemaps/js-samples/blob/HEAD/samples/move-camera-ease/index.ts?utm_campaign=gmp_git_agentskills_v1)

```typescript
import { Easing, Tween, update } from "@tweenjs/tween.js";

let map: google.maps.Map;

const cameraOptions: google.maps.CameraOptions = {
  tilt: 0,
  heading: 0,
  zoom: 3,
  center: { lat: 35.6594945, lng: 139.6999859 },
};

async function initMap(): Promise<void> {
  const { Map } = (await google.maps.importLibrary("maps")) as google.maps.MapsLibrary;

  map = new Map(document.getElementById("map") as HTMLElement, {
    ...cameraOptions,
    mapId: "15431d2b469f209e",
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });

  // Install Tweenjs with: npm i @tweenjs/tween.js
  new Tween(cameraOptions)
    .to({ tilt: 65, heading: 90, zoom: 18 }, 15000) // Move to destination in 15 seconds
    .easing(Easing.Quadratic.Out)
    .onUpdate(() => {
      map.moveCamera(cameraOptions);
    })
    .start();

  function animate(time: number) {
    requestAnimationFrame(animate);
    update(time);
  }

  requestAnimationFrame(animate);
}

initMap();
```

--------------------------------------------------------------------------------

## Fractional Zoom

Fractional zoom allows zooming to non-integer levels for smoother transitions.

-   **Vector maps**: Enabled by default (`isFractionalZoomEnabled: true`).
-   **Raster maps**: Disabled by default (`isFractionalZoomEnabled: false`).

```javascript
// Enable at initialization
const map = new google.maps.Map(document.getElementById("map"), {
  center: { lat: -34.397, lng: 150.644 },
  zoom: 8.5,
  isFractionalZoomEnabled: true,
  internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
});

// Or toggle at runtime
map.setOptions({ isFractionalZoomEnabled: true });

// Listen for fractional zoom state changes
map.addListener("isfractionalzoomenabled_changed", () => {
  const isEnabled = map.get("isFractionalZoomEnabled");
  console.log("Fractional zoom enabled:", isEnabled);
});
```

> **Caution:** The `zoom_changed` event fires much more frequently when
> fractional zoom is enabled. If you attach listeners to `zoom_changed` (for
> example, to toggle marker visibility), throttle your handler or only trigger
> updates when `Math.floor(map.getZoom())` changes by an integer value.

--------------------------------------------------------------------------------

## Controlling User Interactions, Gestures, and Restrictions

### 1. Mouse and Keyboard Gestures for Vector Maps

When tilt and rotation user interactions are enabled on a vector map:

-   **Mouse**: Hold down the `Shift` key, then drag up/down to adjust **tilt**,
    or drag left/right to adjust **heading**.
-   **Keyboard**: Hold down the `Shift` key, then use the `Up`/`Down` arrow keys
    to adjust **tilt**, or `Left`/`Right` arrow keys to adjust **heading**.

### 2. Controlling Scroll & Pan Behavior (`gestureHandling`)

Use the `gestureHandling` map option to control how the map responds to touch
and scroll-wheel gestures on pages that scroll:

| Value           | Behavior                                                   |
| :-------------- | :--------------------------------------------------------- |
| `"cooperative"` | Scroll events (or one-finger touch gestures) scroll the    |
:                 : page instead of zooming/panning the map. Users must use    :
:                 : `Ctrl + scroll` (or two fingers) to zoom/pan the map.      :
| `"greedy"`      | All touch gestures and scroll events pan or zoom the map   |
:                 : immediately.                                               :
| `"none"`        | Disables panning and zooming on the map via user gestures. |
| `"auto"`        | *(Default)* Enables `"cooperative"` or `"greedy"`          |
:                 : automatically depending on whether the page is scrollable. :

#### Example: Disable Pan and Zoom Completely

To lock the camera so users cannot pan or zoom, set `gestureHandling: "none"`
and `zoomControl: false`.

Source:
[samples/interaction-disable-pan-zoom/index.ts](https://github.com/googlemaps/js-samples/blob/HEAD/samples/interaction-disable-pan-zoom/index.ts?utm_campaign=gmp_git_agentskills_v1)

```typescript
async function initMap(): Promise<void> {
  const { Map } = (await google.maps.importLibrary("maps")) as google.maps.MapsLibrary;

  new Map(document.getElementById("map") as HTMLElement, {
    zoom: 4,
    center: { lat: -25.363, lng: 131.044 },
    gestureHandling: "none",
    zoomControl: false,
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });
}

initMap();
```

### 3. Restrict Camera to Geographic Bounds (`restriction`)

Use the `restriction` option in `MapOptions` to constrain user panning and
zooming to a specific `LatLngBounds` box.

Source:
[samples/control-bounds-restriction/index.ts](https://github.com/googlemaps/js-samples/blob/HEAD/samples/control-bounds-restriction/index.ts?utm_campaign=gmp_git_agentskills_v1)

```typescript
const NEW_ZEALAND_BOUNDS = {
  north: -34.36,
  south: -47.35,
  west: 166.28,
  east: -175.81,
};
const AUCKLAND = { lat: -37.06, lng: 174.58 };

async function initMap(): Promise<void> {
  const { Map } = (await google.maps.importLibrary("maps")) as google.maps.MapsLibrary;

  const map = new Map(document.getElementById("map") as HTMLElement, {
    center: AUCKLAND,
    zoom: 7,
    restriction: {
      latLngBounds: NEW_ZEALAND_BOUNDS,
      strictBounds: false, // Set to true to prevent any area outside bounds from being visible
    },
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });
}

initMap();
```

--------------------------------------------------------------------------------

## Camera Events and Synchronization Patterns

You can listen to camera state changes using
`map.addListener(eventName, handler)`:

-   `bounds_changed`: Fired when the viewport bounds have changed.
-   `center_changed`: Fired when the map `center` property changes.
-   `zoom_changed`: Fired when the map `zoom` property changes.
-   `heading_changed`: Fired when the map `heading` property changes.
-   `tilt_changed`: Fired when the map `tilt` property changes.
-   `idle`: Fired when the map becomes idle after panning or zooming stops.

### Example: Synchronizing an Overview / Inset Map

You can link a secondary overview map to a primary interactive map by listening
to `bounds_changed` and clamping the overview zoom level.

Source:
[samples/inset-map/index.ts](https://github.com/googlemaps/js-samples/blob/HEAD/samples/inset-map/index.ts?utm_campaign=gmp_git_agentskills_v1)

```typescript
const OVERVIEW_DIFFERENCE = 5;
const OVERVIEW_MIN_ZOOM = 3;
const OVERVIEW_MAX_ZOOM = 10;

function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max);
}

async function initMap(): Promise<void> {
  const { Map } = (await google.maps.importLibrary("maps")) as google.maps.MapsLibrary;

  const mapOptions: google.maps.MapOptions = {
    center: { lat: 50, lng: 8 },
    zoom: 7,
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  };

  // Instantiate the primary map
  const map = new Map(document.getElementById("map") as HTMLElement, {
    ...mapOptions,
  });

  // Instantiate the overview map without interactive controls
  const overview = new Map(document.getElementById("overview") as HTMLElement, {
    ...mapOptions,
    disableDefaultUI: true,
    gestureHandling: "none",
    zoomControl: false,
  });

  map.addListener("bounds_changed", () => {
    overview.setCenter(map.getCenter()!);
    overview.setZoom(
      clamp(
        map.getZoom()! - OVERVIEW_DIFFERENCE,
        OVERVIEW_MIN_ZOOM,
        OVERVIEW_MAX_ZOOM
      )
    );
  });
}

initMap();
```
