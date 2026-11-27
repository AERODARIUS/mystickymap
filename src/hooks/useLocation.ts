import { useState, useEffect } from 'react';
import { DeviceOrientationEventiOS } from '../types/dom';

export const useLocation = (isTrackingLocation: boolean, onPermissionDenied?: () => void) => {
  const hasGeolocationSupport =
    typeof navigator !== 'undefined' && Boolean(navigator.geolocation);

  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);
  const [isLocationUnavailable, setIsLocationUnavailable] = useState(!hasGeolocationSupport);
  const [hasResolvedInitialLocation, setHasResolvedInitialLocation] = useState(!hasGeolocationSupport);

  const shouldWatchGeolocation = isTrackingLocation || !hasResolvedInitialLocation;

  useEffect(() => {
    let watchId: number | undefined;
    if (shouldWatchGeolocation && typeof navigator !== 'undefined' && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setIsPermissionDenied(false);
          setIsLocationUnavailable(false);
          setHasResolvedInitialLocation(true);
          const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(prev => {
            if (!prev) return newLoc;
            if (Math.abs(prev.lat - newLoc.lat) > 0.00001 || Math.abs(prev.lng - newLoc.lng) > 0.00001) {
              return newLoc;
            }
            return prev;
          });
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setIsPermissionDenied(true);
            setIsLocationUnavailable(true);
            setHasResolvedInitialLocation(true);
            onPermissionDenied?.();
          } else {
            setIsLocationUnavailable(true);
            setHasResolvedInitialLocation(true);
            // Avoid console.error for common geolocation unavailable/timeout scenarios
            console.warn('Geolocation error:', err.message);
          }
        },
        { enableHighAccuracy: true }
      );
    }

    const handleOrientation = (e: Event) => {
      const orientationEvent = e as DeviceOrientationEventiOS;
      const headingVal = orientationEvent.webkitCompassHeading || (orientationEvent.alpha !== null ? 360 - orientationEvent.alpha : null);
      if (headingVal !== null) {
        setHeading(prev => {
          if (prev === null || Math.abs(prev - headingVal) > 1) {
            return headingVal;
          }
          return prev;
        });
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      if (watchId !== undefined && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [shouldWatchGeolocation, onPermissionDenied]);

  return { userLocation, heading, isPermissionDenied, isLocationUnavailable };
};
