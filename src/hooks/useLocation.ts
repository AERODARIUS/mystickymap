import { useState, useEffect } from 'react';
import { DeviceOrientationEventiOS } from '../types/dom';

export const useLocation = (isTrackingLocation: boolean) => {
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    let watchId: number;
    if (isTrackingLocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(prev => {
            if (!prev) return newLoc;
            if (Math.abs(prev.lat - newLoc.lat) > 0.00001 || Math.abs(prev.lng - newLoc.lng) > 0.00001) {
              return newLoc;
            }
            return prev;
          });
        },
        (err) => console.error(err),
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
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [isTrackingLocation]);

  return { userLocation, heading };
};
