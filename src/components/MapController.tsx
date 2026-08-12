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
  selectedNote
}: {
  isCreating: boolean;
  editingNote: Note | null;
  placementStep: 'editing_content' | 'placing_location';
  userLocation: { lat: number, lng: number } | null;
  candidateLocation: { lat: number, lng: number } | null;
  setCandidateLocation: (loc: { lat: number, lng: number } | null) => void;
  isTrackingLocation: boolean;
  selectedNote: Note | null;
}) => {
  const map = useMap();
  const hasJumpedToInitial = useRef(false);
  const prevStepRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (isTrackingLocation && userLocation && map && !isCreating && !editingNote) {
      map.panTo(userLocation);
    }
  }, [userLocation, map, isTrackingLocation, isCreating, editingNote]);

  return null;
};
