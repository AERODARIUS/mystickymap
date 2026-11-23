import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, act } from '@testing-library/react';
import { MapController } from '../../components/MapController';
import { useLocation } from '../useLocation';

const mockPanTo = vi.fn();
const mockSetCenter = vi.fn();
const mockSetZoom = vi.fn();
const mockGetZoom = vi.fn(() => 15);
const mockAddListener = vi.fn(() => ({ remove: vi.fn() }));
const mockGetCenter = vi.fn();

const mockMap = {
  panTo: mockPanTo,
  setCenter: mockSetCenter,
  setZoom: mockSetZoom,
  getZoom: mockGetZoom,
  addListener: mockAddListener,
  getCenter: mockGetCenter,
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

    const successCb = watchPositionMock.mock.calls[0][0] as PositionCallback;
    act(() => {
      successCb({
        coords: { latitude: -34.9011, longitude: -56.1645 },
      } as GeolocationPosition);
    });

    expect(result.current.userLocation).toEqual({ lat: -34.9011, lng: -56.1645 });
    // Watch is automatically cleared once initial location is resolved while tracking is off
    expect(clearWatchMock).toHaveBeenCalledWith(1);

    // Toggling auto-tracking ON starts watchPosition; toggling OFF clears it
    rerender({ tracking: true });
    expect(watchPositionMock).toHaveBeenCalledTimes(2);

    rerender({ tracking: false });
    expect(clearWatchMock).toHaveBeenCalledWith(2);
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
});
