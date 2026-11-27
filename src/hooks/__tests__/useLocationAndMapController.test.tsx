import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, act } from '@testing-library/react';
import { MapController } from '../../components/MapController';
import { useLocation } from '../useLocation';
import {
  DEFAULT_USER_ZOOM,
  WORLD_CONTINENTS_BOUNDS,
  WORLD_VIEW_CENTER,
  WORLD_VIEW_PADDING,
  WORLD_VIEW_ZOOM,
} from '../../lib/mapConfig';

const mockPanTo = vi.fn();
const mockSetCenter = vi.fn();
const mockSetZoom = vi.fn();
const mockGetZoom = vi.fn(() => 15);
const mockAddListener = vi.fn(() => ({ remove: vi.fn() }));
const mockGetCenter = vi.fn();
const mockFitBounds = vi.fn();

const mockMap: {
  panTo: typeof mockPanTo;
  setCenter: typeof mockSetCenter;
  setZoom: typeof mockSetZoom;
  getZoom: typeof mockGetZoom;
  addListener: typeof mockAddListener;
  getCenter: typeof mockGetCenter;
  fitBounds?: typeof mockFitBounds;
} = {
  panTo: mockPanTo,
  setCenter: mockSetCenter,
  setZoom: mockSetZoom,
  getZoom: mockGetZoom,
  addListener: mockAddListener,
  getCenter: mockGetCenter,
  fitBounds: mockFitBounds,
};

vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => mockMap,
}));

describe('useLocation & MapController initial positioning', () => {
  let watchPositionMock: ReturnType<typeof vi.fn>;
  let clearWatchMock: ReturnType<typeof vi.fn>;
  let nextWatchId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    nextWatchId = 1;
    mockGetZoom.mockReturnValue(15);
    mockMap.fitBounds = mockFitBounds;
    watchPositionMock = vi.fn(() => nextWatchId++);
    clearWatchMock = vi.fn();

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: watchPositionMock,
        clearWatch: clearWatchMock,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('fetches initial location once via watchPosition even when auto-tracking is off, then clears watch until enabled', () => {
    const { result, rerender } = renderHook(
      ({ tracking }: { tracking: boolean }) => useLocation(tracking),
      { initialProps: { tracking: false } }
    );

    expect(watchPositionMock).toHaveBeenCalledTimes(1);
    expect(result.current.userLocation).toBeNull();
    expect(result.current.isLocationUnavailable).toBe(false);

    const successCb = watchPositionMock.mock.calls[0][0] as PositionCallback;
    act(() => {
      successCb({
        coords: { latitude: -34.9011, longitude: -56.1645 },
      } as GeolocationPosition);
    });

    expect(result.current.userLocation).toEqual({ lat: -34.9011, lng: -56.1645 });
    expect(result.current.isPermissionDenied).toBe(false);
    expect(result.current.isLocationUnavailable).toBe(false);
    // Watch is automatically cleared once initial location is resolved while tracking is off
    expect(clearWatchMock).toHaveBeenCalledWith(1);

    // Toggling auto-tracking ON starts watchPosition; toggling OFF clears it
    rerender({ tracking: true });
    expect(watchPositionMock).toHaveBeenCalledTimes(2);

    rerender({ tracking: false });
    expect(clearWatchMock).toHaveBeenCalledWith(2);
  });

  it('marks location denied and unavailable when permission is denied or geolocation is unsupported', () => {
    const onPermissionDenied = vi.fn();
    const { result } = renderHook(() => useLocation(false, onPermissionDenied));

    const errorCb = watchPositionMock.mock.calls[0][1] as PositionErrorCallback;
    act(() => {
      errorCb({
        code: 1,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: 'User denied Geolocation',
      } as GeolocationPositionError);
    });

    expect(result.current.isPermissionDenied).toBe(true);
    expect(result.current.isLocationUnavailable).toBe(true);
    expect(onPermissionDenied).toHaveBeenCalledTimes(1);
    expect(clearWatchMock).toHaveBeenCalledWith(1);

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: undefined,
    });

    const { result: unsupportedResult } = renderHook(() => useLocation(false));
    expect(unsupportedResult.current.isLocationUnavailable).toBe(true);
  });

  it('centers the map once on initial entry (including under StrictMode) independently of tracking button, and only tracks continuously when enabled', () => {
    const onInitialPositionComplete = vi.fn();
    const setCandidateLocation = vi.fn();

    const { rerender } = render(
      <React.StrictMode>
        <MapController
          isCreating={false}
          editingNote={null}
          placementStep="editing_content"
          userLocation={{ lat: -34.9011, lng: -56.1645 }}
          candidateLocation={null}
          setCandidateLocation={setCandidateLocation}
          isTrackingLocation={false}
          selectedNote={null}
          hasInitiallyPositioned={false}
          onInitialPositionComplete={onInitialPositionComplete}
        />
      </React.StrictMode>
    );

    act(() => {
      vi.runAllTimers();
    });

    expect(mockSetCenter).toHaveBeenCalledWith({ lat: -34.9011, lng: -56.1645 });
    expect(onInitialPositionComplete).toHaveBeenCalledTimes(1);

    // Subsequent location updates with hasInitiallyPositioned=true and tracking=false do NOT re-center or pan
    rerender(
      <React.StrictMode>
        <MapController
          isCreating={false}
          editingNote={null}
          placementStep="editing_content"
          userLocation={{ lat: -34.905, lng: -56.17 }}
          candidateLocation={null}
          setCandidateLocation={setCandidateLocation}
          isTrackingLocation={false}
          selectedNote={null}
          hasInitiallyPositioned={true}
          onInitialPositionComplete={onInitialPositionComplete}
        />
      </React.StrictMode>
    );

    act(() => {
      vi.runAllTimers();
    });

    expect(mockPanTo).not.toHaveBeenCalled();

    // Enabling the auto-position button restores continuous tracking behavior
    rerender(
      <React.StrictMode>
        <MapController
          isCreating={false}
          editingNote={null}
          placementStep="editing_content"
          userLocation={{ lat: -34.905, lng: -56.17 }}
          candidateLocation={null}
          setCandidateLocation={setCandidateLocation}
          isTrackingLocation={true}
          selectedNote={null}
          hasInitiallyPositioned={true}
          onInitialPositionComplete={onInitialPositionComplete}
        />
      </React.StrictMode>
    );

    expect(mockPanTo).toHaveBeenCalledWith({ lat: -34.905, lng: -56.17 });
  });

  it('zooms out to fit all continents when location services are not granted, and zooms back in if location later resolves', () => {
    const onInitialPositionComplete = vi.fn();
    const setCandidateLocation = vi.fn();
    mockGetZoom.mockReturnValue(WORLD_VIEW_ZOOM);

    const { rerender } = render(
      <React.StrictMode>
        <MapController
          isCreating={false}
          editingNote={null}
          placementStep="editing_content"
          userLocation={null}
          candidateLocation={null}
          setCandidateLocation={setCandidateLocation}
          isTrackingLocation={false}
          selectedNote={null}
          hasInitiallyPositioned={false}
          onInitialPositionComplete={onInitialPositionComplete}
          isLocationDenied={true}
        />
      </React.StrictMode>
    );

    expect(mockFitBounds).toHaveBeenCalledWith(WORLD_CONTINENTS_BOUNDS, WORLD_VIEW_PADDING);
    expect(onInitialPositionComplete).not.toHaveBeenCalled();

    // If user later grants location permission, center and zoom back to street level
    rerender(
      <React.StrictMode>
        <MapController
          isCreating={false}
          editingNote={null}
          placementStep="editing_content"
          userLocation={{ lat: -34.9011, lng: -56.1645 }}
          candidateLocation={null}
          setCandidateLocation={setCandidateLocation}
          isTrackingLocation={false}
          selectedNote={null}
          hasInitiallyPositioned={false}
          onInitialPositionComplete={onInitialPositionComplete}
          isLocationDenied={false}
        />
      </React.StrictMode>
    );

    act(() => {
      vi.runAllTimers();
    });

    expect(mockSetCenter).toHaveBeenCalledWith({ lat: -34.9011, lng: -56.1645 });
    expect(mockSetZoom).toHaveBeenCalledWith(DEFAULT_USER_ZOOM);
    expect(onInitialPositionComplete).toHaveBeenCalledTimes(1);
  });

  it('falls back to world center and zoom when fitBounds is unavailable on map instance', () => {
    const onInitialPositionComplete = vi.fn();
    const setCandidateLocation = vi.fn();
    delete mockMap.fitBounds;

    render(
      <MapController
        isCreating={false}
        editingNote={null}
        placementStep="editing_content"
        userLocation={null}
        candidateLocation={null}
        setCandidateLocation={setCandidateLocation}
        isTrackingLocation={false}
        selectedNote={null}
        hasInitiallyPositioned={false}
        onInitialPositionComplete={onInitialPositionComplete}
        isLocationDenied={true}
      />
    );

    expect(mockSetCenter).toHaveBeenCalledWith(WORLD_VIEW_CENTER);
    expect(mockSetZoom).toHaveBeenCalledWith(WORLD_VIEW_ZOOM);
  });
});
