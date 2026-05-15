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
import { CommentsView } from './components/CommentsView';
import { ReportModal } from './components/ReportModal';

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
  const [commentNote, setCommentNote] = useState<Note | null>(null);
  const [reportNote, setReportNote] = useState<Note | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const hasHandledUrlNote = useRef(false);

  const handleEditNote = useCallback((note: Note | null) => {
    setEditingNote(note);
    if (note) {
      if (note.color) setDraftColor(note.color);
      if (note.emoji) setDraftEmoji(note.emoji);
    }
  }, []);

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
  
  const handlePermissionDenied = useCallback(() => {
    setIsTrackingLocation(false);
  }, []);

  const { userLocation, heading, isPermissionDenied } = useLocation(isTrackingLocation, handlePermissionDenied);

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
    if (!isAuthReady || hasHandledUrlNote.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const noteIdFromUrl = urlParams.get('noteId');

    if (noteIdFromUrl) {
      const targetNote = notes.find(n => n.id === noteIdFromUrl);
      if (targetNote) {
        hasHandledUrlNote.current = true;
        setTimeout(() => setSelectedNote(targetNote), 0);
      } else {
        // Even if we have other notes, this one isn't in the list
        // If not in the discovery list (e.g. Unlisted or out of range), try to fetch it directly
        import('./firebase').then(async ({ db }) => {
          const { doc, getDoc } = await import('firebase/firestore');
          try {
            const docSnap = await getDoc(doc(db, 'notes', noteIdFromUrl));
            if (docSnap.exists()) {
              const data = docSnap.data();
              const fetchedNote = {
                id: docSnap.id,
                ...data,
              } as Note;

              // Security rules will block this if it's Private and we're not the owner
              hasHandledUrlNote.current = true;
              setTimeout(() => setSelectedNote(fetchedNote), 0);
            }
          } catch {
            // Silently fail if not found or no permission
            console.debug("Note from URL not accessible:", noteIdFromUrl);
          }
        });
      }
    }
  }, [notes, isAuthReady]);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
      const firebaseError = error as { code?: string; message?: string };
      const errorMessage = firebaseError.message || "";
      
      if (firebaseError.code === 'auth/unauthorized-domain' || errorMessage.includes('auth/requests-from-referer')) {
        const domain = window.location.origin;
        setLoginError(
          `Domain Blocked: This environment's URL (${domain}) is not allowlisted in your Google Cloud / Firebase config. ` +
          `Please follow these steps: 1. Go to your Google Cloud Console > APIs & Services > Credentials. 2. Find the API Key. 3. Add "${domain}/*" to "Website restrictions". 4. Also check Firebase Console > Authentication > Settings > Authorized domains.`
        );
      } else {
        setLoginError("Login failed: " + (firebaseError.message || "Unknown error"));
      }
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      window.location.reload();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

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
        <div className="relative w-full h-[100dvh] bg-stone-50 font-sans overflow-hidden">
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
                  setEditingNote={handleEditNote}
                  copyToClipboard={copyToClipboard}
                  onGenerateQRCode={(id) => setQrCodeNoteId(id)}
                  onShowComments={setCommentNote}
                  onReportNote={setReportNote}
                />
              </Map>
            ) : view === 'ar' ? (
              <ARView 
                notes={notes} 
                userLocation={userLocation} 
                heading={heading} 
                user={user}
                setView={setView}
                setEditingNote={handleEditNote}
                copyToClipboard={copyToClipboard}
                copyStatus={copyStatus}
                onShowComments={setCommentNote}
                onReportNote={setReportNote}
              />
            ) : view === 'anchor' ? (
              <AnchorView 
                notes={notes}
                userLocation={userLocation}
                user={user}
                setEditingNote={handleEditNote}
                onFocusNote={handleFocusNote}
                copyToClipboard={copyToClipboard}
                copyStatus={copyStatus}
                onGenerateQRCode={(id) => setQrCodeNoteId(id)}
                onShowComments={setCommentNote}
                onReportNote={setReportNote}
              />
            ) : (
              <QRNotesView 
                notes={notes}
                user={user}
                copyToClipboard={copyToClipboard}
                copyStatus={copyStatus}
                onShowComments={setCommentNote}
                onReportNote={setReportNote}
              />
            )}
          </div>

          <NavigationUI 
            user={user}
            view={view}
            isTrackingLocation={isTrackingLocation}
            isPermissionDenied={isPermissionDenied}
            isCreating={isCreating}
            editingNote={editingNote}
            draftLocation={draftLocation}
            draftColor={draftColor}
            draftEmoji={draftEmoji}
            setView={setView}
            setIsTrackingLocation={setIsTrackingLocation}
            setIsCreating={setIsCreating}
            setEditingNote={handleEditNote}
            setDraftColor={setDraftColor}
            setDraftEmoji={setDraftEmoji}
            handleLogin={handleLogin}
            handleLogout={handleLogout}
            heading={heading}
          />

          {/* Login Error Toast */}
          {loginError && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 w-full max-w-xs px-4 z-[70]">
              <div className="bg-red-600 text-white p-4 rounded-xl shadow-2xl flex items-start gap-3 text-sm">
                <div className="flex-1">
                  <p className="font-bold">Authentication Error</p>
                  <p className="opacity-90 text-xs mt-1">{loginError}</p>
                </div>
                <button 
                  onClick={() => setLoginError(null)}
                  className="p-1 hover:bg-white/10 rounded-lg"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>

        <QRCodeDisplay 
          noteId={qrCodeNoteId || ''} 
          isOpen={!!qrCodeNoteId} 
          onClose={() => setQrCodeNoteId(null)} 
        />
        <CommentsView
          note={commentNote}
          isOpen={!!commentNote}
          user={user}
          onClose={() => setCommentNote(null)}
        />
        <ReportModal
          isOpen={!!reportNote}
          onClose={() => setReportNote(null)}
          noteId={reportNote?.id || ''}
          user={user}
        />
        <InstallPrompt />
      </APIProvider>
    </ErrorBoundary>
  );
}

