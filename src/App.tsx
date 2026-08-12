/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { APIProvider, Map } from '@vis.gl/react-google-maps';
import { auth, googleProvider, signInWithPopup, onAuthStateChanged, db, handleFirestoreError, OperationType, serverTimestamp, logAnalyticsEvent } from './firebase';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { User } from 'firebase/auth';

// Components
import { SplashScreen } from './components/SplashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ARView } from './components/ARView';
import { MapController } from './components/MapController';
import { MapMarkers } from './components/MapMarkers';
import { NavigationUI } from './components/NavigationUI';
import { LocationPlacement } from './components/LocationPlacement';
import { AnchorView } from './components/AnchorView';
import { QRNotesView } from './components/QRNotesView';
import { QRCodeDisplay } from './components/QRCodeDisplay';
import { InstallPrompt } from './components/InstallPrompt';
import { CommentsView } from './components/CommentsView';
import { ReportModal } from './components/ReportModal';
import { AdminDashboard } from './components/AdminDashboard';

// Hooks & Utils
import { useNotes } from './hooks/useNotes';
import { useAdmin } from './hooks/useAdmin';
import { useFeatureFlags } from './hooks/useFeatureFlags';
import { useLocation } from './hooks/useLocation';
import { Note, Comment, NotePrivacy } from './types';

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
  const [placementStep, setPlacementStep] = useState<'editing_content' | 'placing_location'>('editing_content');
  
  // Note draft values preserved across step transitions
  const [draftContent, setDraftContent] = useState('');
  const [draftLanguage, setDraftLanguage] = useState(typeof navigator !== 'undefined' ? navigator.language : 'en-US');
  const [draftPrivacy, setDraftPrivacy] = useState<NotePrivacy>('public');
  const [draftColor, setDraftColor] = useState('#0d9488');
  const [draftEmoji, setDraftEmoji] = useState('📝');

  // Location tracking for note placement
  const [, setOriginalLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [candidateLocation, setCandidateLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [qrCodeNoteId, setQrCodeNoteId] = useState<string | null>(null);
  const [commentNote, setCommentNote] = useState<Note | null>(null);
  const [reportingNote, setReportingNote] = useState<Note | null>(null);
  const [reportingComment, setReportingComment] = useState<Comment | null>(null);
  const [showAdminHub, setShowAdminHub] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const hasHandledUrlNote = useRef(false);

  // Hooks
  const { notes } = useNotes(user, isAuthReady);
  const { flags } = useFeatureFlags();
  const { isAdmin } = useAdmin(user);
  
  const handlePermissionDenied = useCallback(() => {
    setIsTrackingLocation(false);
  }, []);

  const { userLocation, heading, isPermissionDenied } = useLocation(isTrackingLocation, handlePermissionDenied);

  const handleStartCreate = useCallback(() => {
    setIsCreating(true);
    setEditingNote(null);
    setPlacementStep('editing_content');
    setDraftContent('');
    setDraftLanguage(typeof navigator !== 'undefined' ? navigator.language : 'en-US');
    setDraftPrivacy('public');
    setDraftColor('#10b981');
    setDraftEmoji('📝');
    
    const initLoc = userLocation || { lat: 37.42, lng: -122.08 };
    setOriginalLocation(initLoc);
    setCandidateLocation(initLoc);
    setView('map');
  }, [userLocation]);

  const handleEditNote = useCallback((note: Note | null) => {
    setEditingNote(note);
    setIsCreating(false);
    if (note) {
      setPlacementStep('editing_content');
      setDraftContent(note.content || '');
      setDraftLanguage(note.language || (typeof navigator !== 'undefined' ? navigator.language : 'en-US'));
      setDraftPrivacy(note.privacy || 'public');
      setDraftColor(note.color || '#10b981');
      setDraftEmoji(note.emoji || '📝');
      
      const loc = note.location || { lat: 37.42, lng: -122.08 };
      setOriginalLocation(loc);
      setCandidateLocation(loc);
      setView('map');
    } else {
      setOriginalLocation(null);
      setCandidateLocation(null);
    }
  }, []);

  const handleProceedToPlacement = useCallback(() => {
    if (!draftContent.trim()) return;
    setPlacementStep('placing_location');
    setView('map');
  }, [draftContent]);

  const handleReturnToEditor = useCallback(() => {
    setPlacementStep('editing_content');
  }, []);

  const handleConfirmPlacement = useCallback(async () => {
    if (!candidateLocation || !auth.currentUser || !draftContent.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingNote) {
        const updates = {
          content: draftContent.trim(),
          privacy: draftPrivacy,
          updatedAt: serverTimestamp(),
          color: draftColor,
          emoji: draftEmoji,
          language: draftLanguage,
          authorName: (auth.currentUser.displayName || 'Explorer').substring(0, 100),
          location: candidateLocation
        };
        await updateDoc(doc(db, 'notes', editingNote.id), updates);
        logAnalyticsEvent('note_update', { note_id: editingNote.id, privacy: draftPrivacy });
      } else {
        const noteData = {
          type: 'text',
          content: draftContent.trim(),
          location: candidateLocation,
          authorId: auth.currentUser.uid,
          authorName: (auth.currentUser.displayName || 'Explorer').substring(0, 100),
          privacy: draftPrivacy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          color: draftColor,
          emoji: draftEmoji,
          language: draftLanguage
        };
        const newRef = await addDoc(collection(db, 'notes'), noteData);
        logAnalyticsEvent('note_create', { note_id: newRef.id, privacy: draftPrivacy });
      }

      setIsCreating(false);
      setEditingNote(null);
      setOriginalLocation(null);
      setCandidateLocation(null);
      setPlacementStep('editing_content');
      setDraftContent('');
    } catch (error) {
      handleFirestoreError(
        error, 
        editingNote ? OperationType.UPDATE : OperationType.CREATE, 
        editingNote ? `notes/${editingNote.id}` : 'notes'
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [candidateLocation, editingNote, draftContent, draftPrivacy, draftColor, draftEmoji, draftLanguage]);

  const handleCancelNoteFlow = useCallback(() => {
    setIsCreating(false);
    setEditingNote(null);
    setOriginalLocation(null);
    setCandidateLocation(null);
    setPlacementStep('editing_content');
    setDraftContent('');
  }, []);

  const copyToClipboard = useCallback((id: string) => {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('noteId', id);
    navigator.clipboard.writeText(url.toString());
    setCopyStatus(id);
    logAnalyticsEvent('share_note_link', { note_id: id });
    setTimeout(() => setCopyStatus(null), 2000);
  }, []);

  const handleFocusNote = useCallback((note: Note) => {
    setView('map');
    setSelectedNote(note);
    setIsTrackingLocation(false);
    logAnalyticsEvent('note_view', { note_id: note.id, privacy: note.privacy, mode: 'anchor_list' });
  }, []);

  useEffect(() => {
    logAnalyticsEvent('screen_view', { firebase_screen: view, screen_name: view });
  }, [view]);

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
      logAnalyticsEvent('qr_scan', { note_id: noteIdFromUrl, source: 'url_param' });
      logAnalyticsEvent('note_view', { note_id: noteIdFromUrl, mode: 'url_param' });

      const targetNote = notes.find(n => n.id === noteIdFromUrl);
      if (targetNote) {
        hasHandledUrlNote.current = true;
        setTimeout(() => setCommentNote(targetNote), 0);
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
              setTimeout(() => setCommentNote(fetchedNote), 0);
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
      <div className="flex items-center justify-center min-h-screen bg-[#081e2b]">
        <div className="w-10 h-10 border-4 border-teal-200/20 border-t-[#00a88f] rounded-full animate-spin" />
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
                  placementStep={placementStep}
                  userLocation={userLocation}
                  candidateLocation={candidateLocation}
                  setCandidateLocation={setCandidateLocation}
                  isTrackingLocation={isTrackingLocation}
                  selectedNote={selectedNote}
                />
                
                <MapMarkers 
                  user={user}
                  notes={notes}
                  userLocation={userLocation}
                  isCreating={isCreating}
                  editingNote={editingNote}
                  placementStep={placementStep}
                  draftLocation={candidateLocation}
                  draftColor={draftColor}
                  draftEmoji={draftEmoji}
                  selectedNote={selectedNote}
                  copyStatus={copyStatus}
                  setDraftLocation={setCandidateLocation}
                  setSelectedNote={setSelectedNote}
                  setEditingNote={handleEditNote}
                  copyToClipboard={copyToClipboard}
                  onGenerateQRCode={(id) => setQrCodeNoteId(id)}
                  onShowComments={setCommentNote}
                  onReportNote={setReportingNote}
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
                onReportNote={setReportingNote}
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
                onReportNote={setReportingNote}
              />
            ) : (
              <QRNotesView 
                notes={notes}
                user={user}
                copyToClipboard={copyToClipboard}
                copyStatus={copyStatus}
                onShowComments={setCommentNote}
                onReportNote={setReportingNote}
              />
            )}
          </div>

          {(isCreating || editingNote) && placementStep === 'placing_location' && (
            <LocationPlacement 
              isCreating={isCreating}
              editingNote={editingNote}
              draftColor={draftColor}
              draftEmoji={draftEmoji}
              draftContent={draftContent}
              candidateLocation={candidateLocation}
              onEditNote={handleReturnToEditor}
              onConfirmLocation={handleConfirmPlacement}
              onCancel={handleCancelNoteFlow}
              isSubmitting={isSubmitting}
            />
          )}

          <NavigationUI 
            user={user}
            view={view}
            isTrackingLocation={isTrackingLocation}
            isPermissionDenied={isPermissionDenied}
            isCreating={isCreating}
            editingNote={editingNote}
            placementStep={placementStep}
            draftLocation={candidateLocation}
            draftColor={draftColor}
            draftEmoji={draftEmoji}
            draftContent={draftContent}
            draftLanguage={draftLanguage}
            draftPrivacy={draftPrivacy}
            setView={setView}
            setIsTrackingLocation={setIsTrackingLocation}
            onStartCreate={handleStartCreate}
            onCancelNoteFlow={handleCancelNoteFlow}
            setDraftColor={setDraftColor}
            setDraftEmoji={setDraftEmoji}
            setDraftContent={setDraftContent}
            setDraftLanguage={setDraftLanguage}
            setDraftPrivacy={setDraftPrivacy}
            onProceedToPlacement={handleProceedToPlacement}
            handleLogin={handleLogin}
            handleLogout={handleLogout}
            heading={heading}
            isAdmin={isAdmin && flags.enableAdminHub}
            onOpenAdmin={() => setShowAdminHub(true)}
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
          onReportComment={(c) => setReportingComment(c)}
          onReportNote={(n) => setReportingNote(n)}
        />
        <ReportModal
          note={reportingNote || (reportingComment ? commentNote : null)}
          comment={reportingComment}
          user={user}
          onClose={() => {
            setReportingNote(null);
            setReportingComment(null);
          }}
        />
        {showAdminHub && <AdminDashboard onClose={() => setShowAdminHub(false)} />}
        <InstallPrompt />
      </APIProvider>
    </ErrorBoundary>
  );
}

