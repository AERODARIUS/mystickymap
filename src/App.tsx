/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { APIProvider, Map } from '@vis.gl/react-google-maps';
import { auth, googleProvider, signInWithPopup, onAuthStateChanged } from './firebase';
import { User } from 'firebase/auth';

// Components
import { SplashScreen } from './components/SplashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ARView } from './components/ARView';
import { MapController } from './components/MapController';
import { MapMarkers } from './components/MapMarkers';
import { NavigationUI } from './components/NavigationUI';
import { AnchorView } from './components/AnchorView';
import { QRNotesView } from './components/QRNotesView';
import { QRCodeDisplay } from './components/QRCodeDisplay';
import { InstallPrompt } from './components/InstallPrompt';

// Hooks & Utils
import { useNotes } from './hooks/useNotes';
import { useLocation } from './hooks/useLocation';
import { Note } from './types';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY' && API_KEY !== 'undefined' && API_KEY !== '';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState<'map' | 'ar' | 'anchor' | 'qr'>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path === '/anchor') return 'anchor';
      if (path === '/ar') return 'ar';
      if (path === '/qr') return 'qr';
    }
    return 'map';
  });
  const [isCreating, setIsCreating] = useState(false);
  const [isTrackingLocation, setIsTrackingLocation] = useState(() => {
    if (typeof window !== 'undefined') {
      return !new URLSearchParams(window.location.search).has('noteId');
    }
    return true;
  });
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [draftColor, setDraftColor] = useState('#10b981');
  const [draftEmoji, setDraftEmoji] = useState('📝');
  const [draftLocation, setDraftLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [qrCodeNoteId, setQrCodeNoteId] = useState<string | null>(null);
  const hasHandledUrlNote = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const path = view === 'map' ? '/' : `/${view}`;
      if (window.location.pathname !== path) {
        window.history.pushState({}, '', path);
      }
    }
  }, [view]);

  // Custom Hooks
  const { notes } = useNotes(user, isAuthReady);
  const { userLocation, heading } = useLocation(isTrackingLocation);

  const copyToClipboard = useCallback((id: string) => {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('noteId', id);
    navigator.clipboard.writeText(url.toString());
    setCopyStatus(id);
    setTimeout(() => setCopyStatus(null), 2000);
  }, []);

  const handleFocusNote = useCallback((note: Note) => {
    setView('map');
    setSelectedNote(note);
    setIsTrackingLocation(false);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (userProfile) => {
      setUser(userProfile);
      setIsAuthReady(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAuthReady || notes.length === 0 || hasHandledUrlNote.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const noteIdFromUrl = urlParams.get('noteId');

    if (noteIdFromUrl) {
      const targetNote = notes.find(n => n.id === noteIdFromUrl);
      if (targetNote) {
        hasHandledUrlNote.current = true;
        // Defer state update to avoid cascading render lint error
        setTimeout(() => setSelectedNote(targetNote), 0);
      }
    }
  }, [notes, isAuthReady]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => auth.signOut();

  if (!hasValidKey) return <SplashScreen />;

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-50">
        <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <APIProvider apiKey={API_KEY} version="weekly">
        <div className="relative w-full h-screen bg-stone-50 font-sans overflow-hidden">
          {/* Main View */}
          <div className="absolute inset-0">
            {view === 'map' ? (
              <Map
                defaultCenter={userLocation || { lat: 37.42, lng: -122.08 }}
                defaultZoom={15}
                mapId="DEMO_MAP_ID"
                style={{ width: '100%', height: '100%' }}
                gestureHandling="greedy"
                disableDefaultUI
              >
                <MapController 
                  isCreating={isCreating}
                  editingNote={editingNote}
                  userLocation={userLocation}
                  setDraftLocation={setDraftLocation}
                  setDraftColor={setDraftColor}
                  draftLocation={draftLocation}
                  isTrackingLocation={isTrackingLocation}
                  selectedNote={selectedNote}
                />
                
                <MapMarkers 
                  user={user}
                  notes={notes}
                  userLocation={userLocation}
                  isCreating={isCreating}
                  editingNote={editingNote}
                  draftLocation={draftLocation}
                  draftColor={draftColor}
                  draftEmoji={draftEmoji}
                  selectedNote={selectedNote}
                  copyStatus={copyStatus}
                  setDraftLocation={setDraftLocation}
                  setSelectedNote={setSelectedNote}
                  setEditingNote={setEditingNote}
                  copyToClipboard={copyToClipboard}
                  onGenerateQRCode={(id) => setQrCodeNoteId(id)}
                />
              </Map>
            ) : view === 'ar' ? (
              <ARView 
                notes={notes} 
                userLocation={userLocation} 
                heading={heading} 
                user={user}
                setView={setView}
                setEditingNote={setEditingNote}
                copyToClipboard={copyToClipboard}
                copyStatus={copyStatus}
              />
            ) : view === 'anchor' ? (
              <AnchorView 
                notes={notes}
                userLocation={userLocation}
                user={user}
                setEditingNote={setEditingNote}
                onFocusNote={handleFocusNote}
                copyToClipboard={copyToClipboard}
                copyStatus={copyStatus}
                onGenerateQRCode={(id) => setQrCodeNoteId(id)}
              />
            ) : (
              <QRNotesView 
                notes={notes}
                user={user}
                copyToClipboard={copyToClipboard}
                copyStatus={copyStatus}
              />
            )}
          </div>

          <NavigationUI 
            user={user}
            view={view}
            isTrackingLocation={isTrackingLocation}
            isCreating={isCreating}
            editingNote={editingNote}
            draftLocation={draftLocation}
            draftColor={draftColor}
            draftEmoji={draftEmoji}
            setView={setView}
            setIsTrackingLocation={setIsTrackingLocation}
            setIsCreating={setIsCreating}
            setEditingNote={setEditingNote}
            setDraftColor={setDraftColor}
            setDraftEmoji={setDraftEmoji}
            handleLogin={handleLogin}
            handleLogout={handleLogout}
            heading={heading}
          />
        </div>

        <QRCodeDisplay 
          noteId={qrCodeNoteId || ''} 
          isOpen={!!qrCodeNoteId} 
          onClose={() => setQrCodeNoteId(null)} 
        />
        <InstallPrompt />
      </APIProvider>
    </ErrorBoundary>
  );
}

