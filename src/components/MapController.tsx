import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { Note } from '../types';

export const MapController = ({ 
  isCreating, 
  editingNote, 
  placementStep,
  userLocation, 
  candidateLocation,
  setCandidateLocation, 
  isTrackingLocation,
  selectedNote,
  focusNonce = 0,
  hasInitiallyPositioned,
  onInitialPositionComplete
}: {
  isCreating: boolean;
  editingNote: Note | null;
  placementStep: 'editing_content' | 'placing_location';
  userLocation: { lat: number, lng: number } | null;
  candidateLocation: { lat: number, lng: number } | null;
  setCandidateLocation: (loc: { lat: number, lng: number } | null) => void;
  isTrackingLocation: boolean;
  selectedNote: Note | null;
  focusNonce?: number;
  hasInitiallyPositioned: boolean;
  onInitialPositionComplete: () => void;
}) => {
  const map = useMap();
  const hasJumpedToInitial = useRef(false);
  const prevStepRef = useRef<string | null>(null);
  const lastHandledFocusNonceRef = useRef(0);

  // Pan map when entering placement step
  useEffect(() => {
    if (!map) return;

    if (placementStep === 'placing_location' && prevStepRef.current !== 'placing_location') {
      if (candidateLocation) {
        map.panTo(candidateLocation);
        if ((map.getZoom() || 0) < 17) {
          map.setZoom(17);
        }
      }
    }
    prevStepRef.current = placementStep;
  }, [map, placementStep, candidateLocation]);

  // Continuously derive candidateLocation from map center when in placement mode
  useEffect(() => {
    if (!map || placementStep !== 'placing_location') return;

    const listener = map.addListener('center_changed', () => {
      const center = map.getCenter();
      if (center) {
        setCandidateLocation({ lat: center.lat(), lng: center.lng() });
      }
    });

    return () => {
      if (listener && typeof listener.remove === 'function') {
        listener.remove();
      }
    };
  }, [map, placementStep, setCandidateLocation]);

  useEffect(() => {
    if (selectedNote && map && !hasJumpedToInitial.current && !isTrackingLocation) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('noteId') === selectedNote.id) {
        map.panTo(selectedNote.location);
        map.setZoom(17);
        hasJumpedToInitial.current = true;
      }
    }
  }, [selectedNote, map, isTrackingLocation]);

  // Pan and zoom when a note is focused externally (e.g., AnchorView or AdminDashboard)
  useEffect(() => {
    if (!map || !selectedNote || focusNonce <= 0 || focusNonce === lastHandledFocusNonceRef.current) {
      return;
    }
    lastHandledFocusNonceRef.current = focusNonce;
    map.panTo(selectedNote.location);
    if ((map.getZoom() ?? 0) < 16) {
      map.setZoom(17);
    }
  }, [map, selectedNote, focusNonce]);

  // One-time initial positioning on user's first entry, independent of auto-tracking toggle
  useEffect(() => {
    if (hasInitiallyPositioned || !userLocation || !map || isCreating || editingNote || selectedNote) {
      return;
    }

    map.setCenter(userLocation);
    const timer = setTimeout(() => {
      onInitialPositionComplete();
    }, 0);

    return () => clearTimeout(timer);
  }, [hasInitiallyPositioned, userLocation, map, isCreating, editingNote, selectedNote, onInitialPositionComplete]);

  useEffect(() => {
    if (isTrackingLocation && userLocation && map && !isCreating && !editingNote) {
      map.panTo(userLocation);
    }
  }, [userLocation, map, isTrackingLocation, isCreating, editingNote]);

  return null;
};
