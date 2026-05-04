import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { Note } from '../types';

export const MapController = ({ 
  isCreating, 
  editingNote, 
  userLocation, 
  setDraftLocation, 
  setDraftColor,
  draftLocation,
  isTrackingLocation,
  selectedNote
}: {
  isCreating: boolean;
  editingNote: Note | null;
  userLocation: { lat: number, lng: number } | null;
  setDraftLocation: (loc: { lat: number, lng: number } | null) => void;
  setDraftColor: (color: string) => void;
  draftLocation: { lat: number, lng: number } | null;
  isTrackingLocation: boolean;
  selectedNote: Note | null;
}) => {
  const map = useMap();
  const hasJumpedToInitial = useRef(false);

  useEffect(() => {
    if (isCreating && map && !draftLocation) {
      const center = map.getCenter();
      if (center) {
        setDraftLocation({ lat: center.lat(), lng: center.lng() });
      }
      if ((map.getZoom() || 0) < 17) map.setZoom(17);
      setDraftColor('#10b981');
    } else if (editingNote && map && !draftLocation) {
      setDraftLocation(editingNote.location);
      setDraftColor(editingNote.color || '#10b981');
      map.panTo(editingNote.location);
      map.setZoom(17);
    } else if (!isCreating && !editingNote && draftLocation) {
      setDraftLocation(null);
    }
  }, [isCreating, editingNote, userLocation, map, setDraftLocation, setDraftColor, draftLocation, isTrackingLocation]);

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
